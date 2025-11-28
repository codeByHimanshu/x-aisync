// app/api/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/jwt";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/Account";

export async function GET(req: NextRequest) {
  try {
    // Read the session cookie (Next.js RequestCookies API)
    const sessCookie = req.cookies.get("sess")?.value;
    if (!sessCookie) {
      return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
    }

    // verify JWT
    let payload: any;
    try {
      payload = await verifyJwt(decodeURIComponent(sessCookie));
    } catch (err) {
      console.error("JWT verify error:", err);
      return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
    }

    // payload.sub should be the xUserId (per your signJwt)
    const xUserId = typeof payload?.sub === "string" ? payload.sub : null;
    if (!xUserId) {
      return NextResponse.json({ ok: false, error: "invalid_token_payload" }, { status: 401 });
    }

    // connect mongoose and fetch user
    await connectDB();
    const user = await User.findOne({ xUserId }).lean();

    if (!user) {
      return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    }

    // shape the response (omit sensitive fields)
    return NextResponse.json({
      ok: true,
      user: {
        username: user.username,
        xUserId: user.xUserId,
        postingPreferences: (user as any).postingPreferences || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (err) {
    console.error("GET /api/me error", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
