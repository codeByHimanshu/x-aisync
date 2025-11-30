// app/api/scheduler/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/jwt";
import { connectDB } from "@/lib/mongodb";
import { ScheduledPost } from "@/models/ScheduledPost";
import { User } from "@/models/Account";

async function getSessionPayload(req: NextRequest) {
  const sess = req.cookies.get("sess")?.value;
  if (!sess) return null;
  try { return await verifyJwt(decodeURIComponent(sess)); } catch { return null; }
}

export async function GET(req: NextRequest) {
  try {
    const payload: any = await getSessionPayload(req);
    if (!payload || typeof payload.sub !== "string") return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
    const xUserId = payload.sub;
    await connectDB();

    const docs = await ScheduledPost.find({ xUserId }).sort({ scheduledAt: 1 }).lean();
    // fetch user's timezone preference if present
    const user = await User.findOne({ xUserId }).lean();
    const userTimezone = user?.postingPreferences?.timezone || null;

    return NextResponse.json({ ok: true, scheduled: docs, userTimezone });
  } catch (err: any) {
    console.error("GET /api/scheduler/list", err);
    return NextResponse.json({ ok: false, error: "server_error", detail: String(err) }, { status: 500 });
  }
}
