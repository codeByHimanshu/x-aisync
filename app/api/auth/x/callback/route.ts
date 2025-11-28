// app/api/auth/x/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";

import { Account,User } from "@/models/Account";
import { encryptToken } from "@/lib/crypto";
import { signJwt } from "@/lib/jwt";

type PkceCookie = { codeVerifier: string; state: string; createdAt?: number };

function parseCookieValue(cookieHeader: string, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((c) => c.trim());
  const kv = parts.find((p) => p.startsWith(`${name}=`));
  if (!kv) return null;
  return kv.split("=").slice(1).join("=");
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    if (!code) return new NextResponse("Missing code", { status: 400 });

    // read PKCE cookie
    const cookieHeader = req.headers.get("cookie") || "";
    const rawPkce = parseCookieValue(cookieHeader, "x_pkce");
    if (!rawPkce) {
      return new NextResponse("Missing PKCE cookie", { status: 400 });
    }

    // decode and parse cookie
    let parsed: PkceCookie | null = null;
    try {
      const decoded = decodeURIComponent(rawPkce);
      parsed = JSON.parse(decoded) as PkceCookie;
    } catch (err) {
      console.error("Failed to parse PKCE cookie:", err);
      return new NextResponse("Invalid PKCE cookie", { status: 400 });
    }

    if (!parsed || typeof parsed.codeVerifier !== "string" || typeof parsed.state !== "string") {
      return new NextResponse("Invalid PKCE payload", { status: 400 });
    }

    const { codeVerifier, state: originalState } = parsed;
    if (returnedState !== originalState) return new NextResponse("Invalid state", { status: 400 });

    // exchange code for tokens
    const tokenResp = await fetch(process.env.X_OAUTH_TOKEN_URL || "https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.X_CLIENT_ID || "",
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.X_REDIRECT_URI || "",
        code_verifier: codeVerifier,
      }).toString(),
    });

    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      console.error("token exchange failed:", text);
      return new NextResponse("Token exchange failed", { status: 500 });
    }
    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in;

    // fetch user identity
    const meResp = await fetch("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meResp.ok) {
      console.error("me fetch failed", await meResp.text());
      return new NextResponse("Failed to fetch user", { status: 500 });
    }
    const meJson = await meResp.json();
    const xUserId = meJson?.data?.id;
    const username = meJson?.data?.username || meJson?.data?.name || "unknown";

    if (!xUserId) {
      console.error("No xUserId in profile response", meJson);
      return new NextResponse("Invalid user data", { status: 500 });
    }

    // connect mongoose
    await connectDB();

    // Upsert user (create if doesn't exist)
    // We keep createdAt via timestamps in schema, but ensure username is set/updated.
    const user = await User.findOneAndUpdate(
      { xUserId },
      { $set: { username } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // encrypt tokens
    const encAccess = accessToken ? await encryptToken(String(accessToken)) : undefined;
    const encRefresh = refreshToken ? await encryptToken(String(refreshToken)) : undefined;
    const expiresAt = typeof expiresIn === "number" ? new Date(Date.now() + expiresIn * 1000) : null;

    // Upsert or update account doc
    await Account.findOneAndUpdate(
      { xUserId },
      {
        $set: {
          userId: user._id,
          xUserId,
          username,
          oauth: {
            accessTokenEnc: encAccess,
            refreshTokenEnc: encRefresh,
            expiresAt,
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // create session JWT
    const jwtToken = await signJwt({ sub: xUserId, uid: String(user._id), username }, "7d");

    const res = NextResponse.redirect("/dashboard");

    // set session cookie (url-encode token)
    res.headers.set(
      "Set-Cookie",
      `sess=${encodeURIComponent(jwtToken)}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`
    );
    // clear pkce cookie
    res.headers.append("Set-Cookie", "x_pkce=; Path=/; Max-Age=0; SameSite=Lax");

    return res;
  } catch (err) {
    console.error("callback error", err);
    return new NextResponse("Server error", { status: 500 });
  }
}
