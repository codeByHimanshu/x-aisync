// app/api/auth/x/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User, Account } from "@/models/Account";
import { encryptToken } from "@/lib/crypto";
import { signJwt } from "@/lib/jwt";

type PkceCookie = { codeVerifier: string; state: string; createdAt?: number };

export async function GET(req: NextRequest) {
  try {
    // --- Parse query params ---
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");

    if (!code) {
      return NextResponse.json({ ok: false, error: "missing_code" }, { status: 400 });
    }

    // --- Read PKCE cookie ---
    const rawPkce = req.cookies.get("x_pkce")?.value;
    if (!rawPkce) {
      return NextResponse.json({ ok: false, error: "missing_x_pkce_cookie" }, { status: 400 });
    }

    let parsed: PkceCookie | null = null;
    try {
      parsed = JSON.parse(decodeURIComponent(rawPkce));
    } catch (err) {
      console.error("Invalid PKCE cookie:", err);
      return NextResponse.json({ ok: false, error: "invalid_pkce_cookie" }, { status: 400 });
    }

    if (!parsed?.codeVerifier || !parsed?.state) {
      return NextResponse.json({ ok: false, error: "invalid_pkce_payload" }, { status: 400 });
    }

    if (returnedState !== parsed.state) {
      return NextResponse.json({ ok: false, error: "state_mismatch" }, { status: 400 });
    }

    // --- OAuth envs ---
    const tokenUrl = process.env.X_OAUTH_TOKEN_URL || "https://api.twitter.com/2/oauth2/token";
    const clientId = process.env.X_CLIENT_ID!;
    const clientSecret = process.env.X_CLIENT_SECRET || ""; // Optional (for confidential clients)
    const redirectUri = process.env.X_REDIRECT_URI!;

    // --- Build token request body ---
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: parsed.codeVerifier,
    });

    // If no client secret, add client_id to body
    if (!clientSecret) params.set("client_id", clientId);

    // --- Build headers ---
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    // If client secret exists → send Basic auth header
    if (clientSecret) {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      headers["Authorization"] = `Basic ${basic}`;
    }

    // --- Exchange code for tokens ---
    const tokenResp = await fetch(tokenUrl, {
      method: "POST",
      headers,
      body: params.toString(),
    });

    const tokenText = await tokenResp.text();
    if (!tokenResp.ok) {
      console.error("Token exchange failed:", tokenResp.status, tokenText);
      return NextResponse.json(
        { ok: false, error: "token_exchange_failed", status: tokenResp.status, body: tokenText },
        { status: 500 }
      );
    }

    const tokenData = JSON.parse(tokenText);
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in;

    // --- Fetch user profile ---
    const meResp = await fetch("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const meText = await meResp.text();
    if (!meResp.ok) {
      console.error("Failed to fetch user:", meResp.status, meText);
      return NextResponse.json(
        { ok: false, error: "me_fetch_failed", status: meResp.status, body: meText },
        { status: 500 }
      );
    }

    const meJson = JSON.parse(meText);
    const xUserId = meJson?.data?.id;
    const username = meJson?.data?.username || meJson?.data?.name || "unknown";

    if (!xUserId) {
      return NextResponse.json({ ok: false, error: "invalid_user_data", body: meJson }, { status: 500 });
    }

    // --- Connect DB ---
    await connectDB();

    // --- Upsert user ---
    const user = await User.findOneAndUpdate(
      { xUserId },
      { $set: { username } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // --- Encrypt tokens ---
    const encAccess = accessToken ? await encryptToken(accessToken) : undefined;
    const encRefresh = refreshToken ? await encryptToken(refreshToken) : undefined;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    // --- Upsert account ---
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

    // --- Create session JWT ---
    const jwtToken = await signJwt(
      { sub: xUserId, uid: String(user._id), username },
      "7d"
    );

    // --- Redirect to dashboard ---
    const res = NextResponse.redirect(new URL("/dashboard", req.url));


    // For local dev, secure: false
    const secure = process.env.NODE_ENV === "production";

    res.cookies.set({
      name: "sess",
      value: encodeURIComponent(jwtToken),
      httpOnly: true,
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      sameSite: "lax",
      secure,
    });

    res.cookies.set({
      name: "x_pkce",
      value: "",
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    });

    return res;
  } catch (err: any) {
    console.error("Callback error:", err);
    return NextResponse.json({ ok: false, error: "server_error", detail: String(err) }, { status: 500 });
  }
}
