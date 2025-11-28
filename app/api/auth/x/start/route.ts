// app/api/auth/x/start/route.ts
import { NextResponse } from "next/server";

/** Generate a random URL-safe string for PKCE/state */
function randomString(length = 64) {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const arr = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < arr.length; i++) out += possible[arr[i] % possible.length];
  return out;
}

function toUint8Array(str: string) {
  return new TextEncoder().encode(str);
}

function base64urlEncode(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function GET() {
  try {
    const clientId = process.env.X_CLIENT_ID;
    const redirectUri = process.env.X_REDIRECT_URI;
    const authorizeUrl = process.env.X_OAUTH_AUTHORIZE_URL || "https://twitter.com/i/oauth2/authorize";

    if (!clientId || !redirectUri) {
      console.error("Missing X_CLIENT_ID or X_REDIRECT_URI");
      return new NextResponse("OAuth configuration missing", { status: 500 });
    }

    // 1) generate PKCE verifier and challenge
    const codeVerifier = randomString(64);
    const digest = await crypto.subtle.digest("SHA-256", toUint8Array(codeVerifier));
    const codeChallenge = base64urlEncode(digest);

    // 2) state
    const state = randomString(32);

    // 3) build OAuth URL (match the params used in your callback route)
    const oauthUrl = new URL(authorizeUrl);
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("client_id", clientId);
    oauthUrl.searchParams.set("redirect_uri", redirectUri);
    oauthUrl.searchParams.set("scope", process.env.X_OAUTH_SCOPE || "tweet.read users.read offline.access");
    oauthUrl.searchParams.set("state", state);
    oauthUrl.searchParams.set("code_challenge", codeChallenge);
    oauthUrl.searchParams.set("code_challenge_method", "S256");

    // 4) save PKCE object in cookie as encoded JSON (HttpOnly)
    const pkce = encodeURIComponent(JSON.stringify({ codeVerifier, state, createdAt: Date.now() }));

    const res = NextResponse.redirect(oauthUrl.toString());

    // Build cookie with secure flags. Keep HttpOnly so client JS can't read it.
    const cookieParts = [
      `x_pkce=${pkce}`,
      `Path=/`,
      `HttpOnly`,
      `Max-Age=${process.env.X_PKCE_MAX_AGE || 300}`, // default 300 seconds
      `SameSite=${process.env.X_PKCE_SAMESITE || "Lax"}`,
      process.env.NODE_ENV === "production" ? "Secure" : "",
    ].filter(Boolean);

    res.headers.set("Set-Cookie", cookieParts.join("; "));

    return res;
  } catch (err) {
    console.error("OAuth start error:", err);
    return new NextResponse("Server error", { status: 500 });
  }
}
