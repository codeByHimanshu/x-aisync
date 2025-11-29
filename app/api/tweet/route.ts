
import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/jwt";
import { connectDB } from "@/lib/mongodb";
import { Account } from "@/models/Account";
import { decryptToken, encryptToken } from "@/lib/crypto";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

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
 * Get a valid access token for the given xUserId.
 * - If access token is not expired, decrypt and return it.
 * - If expired and refresh token is available, attempt refresh and update DB.
 */
async function getValidAccessToken(xUserId: string): Promise<string | null> {
  await connectDB();
  const acc = await Account.findOne({ xUserId }).lean();
  if (!acc) return null;

  const oauth = (acc as any).oauth || {};
  const accessEnc: string | undefined = oauth.accessTokenEnc;
  const refreshEnc: string | undefined = oauth.refreshTokenEnc;
  const expiresAt: Date | null = oauth.expiresAt ? new Date(oauth.expiresAt) : null;

  // If access token exists and not expired (with small clock skew)
  if (accessEnc && (!expiresAt || expiresAt.getTime() > Date.now() + 5_000)) {
    try {
      const access = await decryptToken(accessEnc);
      return access;
    } catch (e) {
      console.error("Failed to decrypt access token:", e);
      // fallthrough to try refresh
    }
  }

  // If we have a refresh token, try refresh
  if (!refreshEnc) return null;
  let refreshToken: string;
  try {
    refreshToken = await decryptToken(refreshEnc);
  } catch (e) {
    console.error("Failed to decrypt refresh token:", e);
    return null;
  }

  // Build refresh request
  const tokenUrl = process.env.X_OAUTH_TOKEN_URL || "https://api.twitter.com/2/oauth2/token";
  const clientId = process.env.X_CLIENT_ID || "";
  const clientSecret = process.env.X_CLIENT_SECRET || ""; // may be empty
  const bodyParams = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  if (!clientSecret) {
    // If no client secret (public client), include client_id in body
    bodyParams.set("client_id", clientId);
  }

  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (clientSecret) {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${basic}`;
  }

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers,
    body: bodyParams.toString(),
  });

  const text = await resp.text().catch(() => "");
  if (!resp.ok) {
    console.error("Token refresh failed:", resp.status, text);
    return null;
  }

  const json: TokenResponse = JSON.parse(text);
  const newAccess = json.access_token;
  const newRefresh = json.refresh_token || refreshToken; // some providers may not return a new refresh token
  const expiresIn = json.expires_in;

  if (!newAccess) return null;

  // Encrypt tokens and update DB
  try {
    const encAccess = await encryptToken(newAccess);
    const encRefresh = newRefresh ? await encryptToken(newRefresh) : undefined;
    const expiresAtNew = typeof expiresIn === "number" ? new Date(Date.now() + expiresIn * 1000) : null;

    await Account.updateOne(
      { xUserId },
      {
        $set: {
          "oauth.accessTokenEnc": encAccess,
          ...(encRefresh ? { "oauth.refreshTokenEnc": encRefresh } : {}),
          "oauth.expiresAt": expiresAtNew,
          updatedAt: new Date(),
        },
      }
    );
  } catch (e) {
    console.error("Failed to encrypt/store refreshed tokens:", e);
    // still return the raw access token if available
  }

  return newAccess;
}

export async function POST(req: NextRequest) {
  try {
    // authenticate session
    const payload: any = await getSessionPayload(req);
    if (!payload || typeof payload.sub !== "string") {
      return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
    }
    const xUserId = payload.sub as string;

    // read body
    const body = await req.json().catch(() => null);
    if (!body || typeof body.text !== "string" || body.text.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "invalid_body", message: "Provide { text: string }" }, { status: 400 });
    }
    const text = body.text.trim();

    // obtain valid access token (or null)
    const accessToken = await getValidAccessToken(xUserId);
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "no_valid_token", message: "Please re-authenticate" }, { status: 403 });
    }

    // call X API to create the tweet
    const tweetResp = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    const tweetText = await tweetResp.text().catch(() => "");
    if (!tweetResp.ok) {
      console.error("Tweet create failed:", tweetResp.status, tweetText);
      return NextResponse.json({ ok: false, error: "tweet_create_failed", status: tweetResp.status, body: tweetText }, { status: 500 });
    }

    const tweetJson = JSON.parse(tweetText);
    return NextResponse.json({ ok: true, tweet: tweetJson });
  } catch (err: any) {
    console.error("POST /api/tweet error", err);
    return NextResponse.json({ ok: false, error: "server_error", detail: String(err) }, { status: 500 });
  }
}
