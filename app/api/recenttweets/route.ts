// app/api/tweets/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/jwt";
import { connectDB } from "@/lib/mongodb"; 
import { Account } from "@/models/Account";
import { decryptToken, encryptToken } from "@/lib/crypto";

async function getSessionPayload(req: NextRequest) {
  const sess = req.cookies.get("sess")?.value;
  if (!sess) return null;
  try {
    return await verifyJwt(decodeURIComponent(sess));
  } catch {
    return null;
  }
}

/**
 * Helper: try to return cached tweets stored on Account document
 */
async function getCachedTweetsForUser(xUserId: string) {
  const acc = await Account.findOne({ xUserId }).lean();
  return acc?.cachedTweets ?? null;
}

/**
 * Helper: store cached tweets JSON on Account doc
 */
async function storeCachedTweetsForUser(xUserId: string, tweetsJson: any) {
  try {
    await Account.updateOne(
      { xUserId },
      { $set: { cachedTweets: { data: tweetsJson, cachedAt: new Date() }, updatedAt: new Date() } }
    );
  } catch (e) {
    console.error("Failed to store cached tweets:", e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const payload: any = await getSessionPayload(req);
    if (!payload || typeof payload.sub !== "string") {
      return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
    }
    const xUserId = payload.sub as string;

    // ensure DB ready (for cache fallback & storing)
    await connectDB();

    // get access token (same refresh logic as your other endpoints)
    const accDoc = await Account.findOne({ xUserId }).lean();
    if (!accDoc) return NextResponse.json({ ok: false, error: "no_account" }, { status: 404 });

    const oauth = (accDoc as any).oauth || {};
    const accessEnc: string | undefined = oauth.accessTokenEnc;
    const refreshEnc: string | undefined = oauth.refreshTokenEnc;
    const expiresAt: Date | null = oauth.expiresAt ? new Date(oauth.expiresAt) : null;

    // decrypt access token if still valid
    let accessToken: string | null = null;
    if (accessEnc && (!expiresAt || expiresAt.getTime() > Date.now() + 5_000)) {
      try {
        accessToken = await decryptToken(accessEnc);
      } catch (e) {
        console.error("decrypt access failed:", e);
      }
    }

    // If access token missing/expired, try refresh (reuse your refresh logic)
    if (!accessToken) {
      if (!refreshEnc) {
        // no refresh token — return cached if exists
        const cached = await getCachedTweetsForUser(xUserId);
        if (cached) return NextResponse.json({ ok: true, tweets: cached.data, fromCache: true });
        return NextResponse.json({ ok: false, error: "no_valid_token" }, { status: 403 });
      }

      // attempt refresh
      let refreshToken: string;
      try {
        refreshToken = await decryptToken(refreshEnc);
      } catch (e) {
        console.error("decrypt refresh failed:", e);
        const cached = await getCachedTweetsForUser(xUserId);
        if (cached) return NextResponse.json({ ok: true, tweets: cached.data, fromCache: true });
        return NextResponse.json({ ok: false, error: "no_valid_token" }, { status: 403 });
      }

      const tokenUrl = process.env.X_OAUTH_TOKEN_URL || "https://api.twitter.com/2/oauth2/token";
      const clientId = process.env.X_CLIENT_ID || "";
      const clientSecret = process.env.X_CLIENT_SECRET || "";
      const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
      if (!clientSecret) body.set("client_id", clientId);
      const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
      if (clientSecret) headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;

      const refreshResp = await fetch(tokenUrl, { method: "POST", headers, body: body.toString() });
      const refreshText = await refreshResp.text().catch(() => "");
      if (!refreshResp.ok) {
        console.error("refresh failed:", refreshResp.status, refreshText);
        const cached = await getCachedTweetsForUser(xUserId);
        if (cached) return NextResponse.json({ ok: true, tweets: cached.data, fromCache: true });
        return NextResponse.json({ ok: false, error: "refresh_failed", status: refreshResp.status, body: refreshText }, { status: 500 });
      }

      const refreshJson = JSON.parse(refreshText);
      accessToken = refreshJson.access_token;
      const newRefresh = refreshJson.refresh_token || refreshToken;
      const expiresIn = refreshJson.expires_in;

      // persist new tokens encrypted (best-effort)
      try {
        const encA = accessToken ? await encryptToken(accessToken) : undefined;
        const encR = newRefresh ? await encryptToken(newRefresh) : undefined;
        const expiresAtNew = typeof expiresIn === "number" ? new Date(Date.now() + expiresIn * 1000) : null;
        await Account.updateOne(
          { xUserId },
          {
            $set: {
              "oauth.accessTokenEnc": encA,
              ...(encR ? { "oauth.refreshTokenEnc": encR } : {}),
              "oauth.expiresAt": expiresAtNew,
              updatedAt: new Date(),
            },
          }
        );
      } catch (e) {
        console.error("Failed to store refreshed tokens:", e);
      }
    }

    // Build X API request
    const url = new URL(`https://api.twitter.com/2/users/${xUserId}/tweets`);
    url.searchParams.set("max_results", "5");
    url.searchParams.set("tweet.fields", "created_at,public_metrics,attachments");

    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    const txt = await r.text().catch(() => "");
    if (!r.ok) {
      // If rate limited, try to return cached tweets
      if (r.status === 429) {
        const retryAfter = r.headers.get("retry-after");
        const rateReset = r.headers.get("x-rate-limit-reset");
        const cached = await getCachedTweetsForUser(xUserId);
        if (cached) {
          return NextResponse.json({
            ok: true,
            tweets: cached.data,
            fromCache: true,
            note: "rate_limited_fallback",
            retryAfter,
            rateReset,
          });
        }
        // no cache — return 429 with helpful info
        return NextResponse.json(
          { ok: false, error: "fetch_failed", status: 429, body: txt, retryAfter, rateReset },
          { status: 429 }
        );
      }

      console.error("fetch tweets failed:", r.status, txt);
      const cached = await getCachedTweetsForUser(xUserId);
      if (cached) return NextResponse.json({ ok: true, tweets: cached.data, fromCache: true });
      return NextResponse.json({ ok: false, error: "fetch_failed", status: r.status, body: txt }, { status: 500 });
    }

    const parsed = JSON.parse(txt);

    // store cached tweets (best effort)
    try {
      await storeCachedTweetsForUser(xUserId, parsed);
    } catch (e) {
      console.error("failed to cache tweets:", e);
    }

    return NextResponse.json({ ok: true, tweets: parsed });
  } catch (err: any) {
    console.error("GET /api/tweets error", err);
    const payload: any = await getSessionPayload(req as any).catch(() => null);
    const cached = payload?.sub ? await getCachedTweetsForUser(payload.sub) : null;
    if (cached) return NextResponse.json({ ok: true, tweets: cached.data, fromCache: true });
    return NextResponse.json({ ok: false, error: "server_error", detail: String(err) }, { status: 500 });
  }
}
