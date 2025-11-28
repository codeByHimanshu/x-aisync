// app/api/auth/x/start/route.ts
import { NextResponse } from "next/server";

/** random url-safe chars for PKCE/state */
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

/** base64url encode with Node fallback */
function base64urlEncode(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  // convert to binary string
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);

  // btoa exists in Edge / browser; fallback to Buffer in Node
  if (typeof btoa === "function") {
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } else {
    // Node: use Buffer
    return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
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

    // generate PKCE verifier & challenge
    const codeVerifier = randomString(64);
    const digest = await crypto.subtle.digest("SHA-256", toUint8Array(codeVerifier));
    const codeChallenge = base64urlEncode(digest);

    // state
    const state = randomString(32);

    // Build OAuth URL
    const oauthUrl = new URL(authorizeUrl);
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("client_id", clientId);
    oauthUrl.searchParams.set("redirect_uri", redirectUri);
    oauthUrl.searchParams.set("scope", process.env.X_OAUTH_SCOPE || "tweet.read users.read offline.access");
    oauthUrl.searchParams.set("state", state);
    oauthUrl.searchParams.set("code_challenge", codeChallenge);
    oauthUrl.searchParams.set("code_challenge_method", "S256");

    // Save PKCE as URL-encoded JSON value
    const pkce = encodeURIComponent(JSON.stringify({ codeVerifier, state, createdAt: Date.now() }));

    // Create redirect response and set cookie via cookies API
    const res = NextResponse.redirect(oauthUrl.toString());

    // cookie options
    const maxAge = Number(process.env.X_PKCE_MAX_AGE || 300); // seconds
    const sameSite = (process.env.X_PKCE_SAMESITE as "lax" | "strict" | "none") || "lax";
    const secure = process.env.NODE_ENV === "production";

    // Use NextResponse cookies API so attributes are correct and consistent
    // Note: httpOnly must be true so client JS cannot read it
    res.cookies.set({
      name: "x_pkce",
      value: pkce,
      path: "/",
      httpOnly: true,
      maxAge,
      sameSite,
      secure,
    });

    return res;
  } catch (err) {
    console.error("OAuth start error:", err);
    return new NextResponse("Server error", { status: 500 });
  }
}
