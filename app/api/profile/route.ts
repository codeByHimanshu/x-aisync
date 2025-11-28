// app/api/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/jwt";
import { getDb} from '@/lib/mongodb';

async function getSessionPayload(req: NextRequest) {
  const sessCookie = (req.cookies && req.cookies.get && req.cookies.get("sess")?.value) ||
    (req.headers.get("cookie") || "").split(";").map(p => p.trim()).find(p => p.startsWith("sess="))?.split("=")[1];
  if (!sessCookie) return null;
  try {
    return await verifyJwt(decodeURIComponent(sessCookie));
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const payload: any = await getSessionPayload(req);
    if (!payload) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

    const db = await getDb();
    const users = db.collection("users");
    const user = await users.findOne({ xUserId: payload.sub });

    if (!user) return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });

    return NextResponse.json({
      ok: true,
      profile: {
        username: user.username,
        xUserId: user.xUserId,
        postingPreferences: user.postingPreferences || {},
        createdAt: user.createdAt,
      }
    });
  } catch (err) {
    console.error("GET /api/profile error", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload: any = await getSessionPayload(req);
    if (!payload) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }

    const prefs = body.postingPreferences;
    if (!prefs || typeof prefs !== "object") {
      return NextResponse.json({ ok: false, error: "missing_postingPreferences" }, { status: 400 });
    }

    const db = await getDb();
    const users = db.collection("users");

    const updateDoc: any = {
      $set: {
        postingPreferences: {
          windows: Array.isArray(prefs.windows) ? prefs.windows : [],
          tone: typeof prefs.tone === "string" ? prefs.tone : "neutral",
          topics: Array.isArray(prefs.topics) ? prefs.topics : [],
          dailyLimit: typeof prefs.dailyLimit === "number" ? prefs.dailyLimit : null
        },
        updatedAt: new Date()
      }
    };

    const result = await users.updateOne({ xUserId: payload.sub }, updateDoc, { upsert: false });
    if (result.matchedCount === 0) {
      return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    }

    const updated = await users.findOne({ xUserId: payload.sub });
    return NextResponse.json({ ok: true, profile: { postingPreferences: updated.postingPreferences } });
  } catch (err) {
    console.error("POST /api/profile error", err);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
