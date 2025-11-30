// lib/schedulerHelpers.ts
import { ScheduledPost } from "@/models/ScheduledPost";
import { Account } from "@/models/Account";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { connectDB } from "@/lib/mongodb";

type PostResult = { ok: boolean; body?: any; status?: number; error?: string };

async function getAccessTokenForUser(xUserId: string) : Promise<string | null> {
  // Similar to your getValidAccessToken function in /api/tweet
  await connectDB();
  const acc = await Account.findOne({ xUserId }).lean();
  if (!acc) return null;
  const oauth = (acc as any).oauth || {};
  const accessEnc = oauth.accessTokenEnc;
  const refreshEnc = oauth.refreshTokenEnc;
  const expiresAt = oauth.expiresAt ? new Date(oauth.expiresAt) : null;

  if (accessEnc && (!expiresAt || new Date().getTime() + 5000 < expiresAt.getTime())) {
    try {
      return await decryptToken(accessEnc);
    } catch (e) {
      console.error("decrypt failed", e);
    }
  }

  // Try refresh flow (reuse logic from your /api/tweet)
  if (!refreshEnc) return null;
  try {
    const refreshToken = await decryptToken(refreshEnc);
    const tokenUrl = process.env.X_OAUTH_TOKEN_URL || "https://api.twitter.com/2/oauth2/token";
    const clientId = process.env.X_CLIENT_ID || "";
    const clientSecret = process.env.X_CLIENT_SECRET || "";

    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
    if (!clientSecret) body.set("client_id", clientId);

    const headers: Record<string,string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (clientSecret) headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;

    const resp = await fetch(tokenUrl, { method: "POST", headers, body: body.toString() });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`refresh failed ${resp.status} ${text}`);
    const json = JSON.parse(text);
    const newAccess = json.access_token;
    const newRefresh = json.refresh_token || refreshToken;
    const expiresIn = json.expires_in;

    // store encrypted
    try {
      await Account.updateOne({ xUserId }, {
        $set: {
          "oauth.accessTokenEnc": newAccess ? await encryptToken(newAccess) : undefined,
          ...(newRefresh ? { "oauth.refreshTokenEnc": await encryptToken(newRefresh) } : {}),
          "oauth.expiresAt": expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
          updatedAt: new Date(),
        }
      });
    } catch (e) {
      console.error("failed storing refreshed tokens", e);
    }

    return newAccess;
  } catch (e) {
    console.error("refresh error", e);
    return null;
  }
}

async function postTweetWithAccessToken(accessToken: string, text: string): Promise<PostResult> {
  try {
    const resp = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const txt = await resp.text();
    if (!resp.ok) return { ok: false, status: resp.status, body: txt, error: txt };
    return { ok: true, status: resp.status, body: JSON.parse(txt) };
  } catch (e: any) {
    return { ok: false, error: String(e) };
  }
}

export { getAccessTokenForUser, postTweetWithAccessToken };
export type { PostResult };
