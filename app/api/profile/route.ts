// app/api/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/jwt";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/Account";

type SessionPayload = { sub?: string; [k: string]: any } | null;

async function getSessionPayload(req: NextRequest): Promise<SessionPayload> {
  const sess = req.cookies.get("sess")?.value;
  if (!sess) return null;
  try {
    return await verifyJwt(decodeURIComponent(sess));
  } catch (err) {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const payload: any = await getSessionPayload(req);
    if (!payload || typeof payload.sub !== "string") {
      return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
    }

    await connectDB();
    const user = await User.findOne({ xUserId: payload.sub }).lean();

    if (!user) {
      return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      profile: {
        username: user.username,
        xUserId: user.xUserId,
        postingPreferences: (user as any).postingPreferences || {},
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (err) {
    console.error("GET /api/profile error", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload: any = await getSessionPayload(req);
    if (!payload || typeof payload.sub !== "string") {
      return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }

    const prefs = body.postingPreferences;
    if (!prefs || typeof prefs !== "object") {
      return NextResponse.json({ ok: false, error: "missing_postingPreferences" }, { status: 400 });
    }

    // sanitize/normalize incoming preferences
    const postingPreferences = {
      windows: Array.isArray(prefs.windows) ? prefs.windows : [],
      tone: typeof prefs.tone === "string" ? prefs.tone : "neutral",
      topics: Array.isArray(prefs.topics) ? prefs.topics : [],
      dailyLimit: typeof prefs.dailyLimit === "number" ? prefs.dailyLimit : null,
    };

    await connectDB();

    const updated = await User.findOneAndUpdate(
      { xUserId: payload.sub },
      {
        $set: {
          postingPreferences,
          updatedAt: new Date(),
        },
      },
      { new: true }
    ).lean();

    if (!updated) {
      return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      profile: {
        postingPreferences: (updated as any).postingPreferences || {},
      },
    });
  } catch (err) {
    console.error("POST /api/profile error", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
