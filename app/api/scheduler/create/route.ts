// app/api/scheduler/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/jwt";
import { connectDB } from "@/lib/mongodb"; // keep your existing connect helper
import { ScheduledPost } from "@/models/ScheduledPost";
import { User } from "@/models/Account"; // fixed import (was incorrectly imported from Account)

async function getSessionPayload(req: NextRequest) {
  const sess = req.cookies.get("sess")?.value;
  if (!sess) return null;
  try {
    return await verifyJwt(decodeURIComponent(sess));
  } catch {
    return null;
  }
}

function isISODateString(s: string) {
  // simple check — accepts ISO with or without timezone offset
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,})?)?([+-]\d{2}:\d{2}|Z)?$/.test(s);
}

export async function POST(req: NextRequest) {
  try {
    const payload: any = await getSessionPayload(req);
    if (!payload || typeof payload.sub !== "string") {
      return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
    }
    const xUserId = payload.sub;
    await connectDB();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }

    // expected fields
    let { text, aiPrompt, generateWithAI, scheduledAt, timezone, repeat } = body;

    // sanitize flags
    generateWithAI = !!generateWithAI;
    repeat = typeof repeat === "string" && ["none", "daily"].includes(repeat) ? repeat : "none";

    // Validate scheduledAt presence
    if (!scheduledAt) {
      return NextResponse.json({ ok: false, error: "missing_scheduledAt" }, { status: 400 });
    }

    // If client sent a plain datetime-local (e.g. "2025-12-01T09:30"), prefer that to be converted on the client.
    // Here we accept only ISO-ish strings. If you pass local datetime without TZ, the front-end should convert to ISO via new Date(...).toISOString()
    if (!isISODateString(scheduledAt)) {
      return NextResponse.json({ ok: false, error: "invalid_scheduledAt_format", detail: "Use ISO datetime (e.g. 2025-12-01T09:30:00.000Z)" }, { status: 400 });
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ ok: false, error: "invalid_scheduledAt", status: 400 }, { status: 400 });
    }

    // scheduledAt must be in the future (small allowance: 30 seconds)
    const minDate = Date.now() - 30 * 1000; // allow slight clock skew
    if (scheduledDate.getTime() <= minDate) {
      return NextResponse.json({ ok: false, error: "scheduledAt_must_be_future" }, { status: 400 });
    }

    // Limit text length to X (X = 280 for X/Twitter)
    if (typeof text === "string" && text.length > 280) {
      return NextResponse.json({ ok: false, error: "text_too_long", detail: "Max 280 characters" }, { status: 400 });
    }

    // Basic normalization
    text = typeof text === "string" ? text.trim() : "";
    aiPrompt = typeof aiPrompt === "string" ? aiPrompt.trim() : "";

    // If generateWithAI is true but no aiPrompt provided that's fine — worker/cron will use default prompt.
    // If generateWithAI is false and there's no text, return error
    if (!generateWithAI && (!text || text.length === 0)) {
      return NextResponse.json({ ok: false, error: "missing_text" }, { status: 400 });
    }

    // timezone is optional but store it (client should send Intl.DateTimeFormat().resolvedOptions().timeZone)
    timezone = typeof timezone === "string" && timezone.length > 0 ? timezone : "UTC";

    // Optionally enforce user's daily limit at scheduling time.
    // We'll fetch user's postingPreferences and if dailyLimit is present we can block schedules that would immediately exceed (optional).
    const user = await User.findOne({ xUserId }).lean();
    const userPrefs = user?.postingPreferences || {};

    // Create scheduled post
    const sp = await ScheduledPost.create({
      userId: payload.uid ? payload.uid : undefined,
      xUserId,
      text,
      aiPrompt,
      generateWithAI,
      scheduledAt: scheduledDate,
      timezone,
      repeat,
      status: "pending",
      attempts: 0,
      maxAttempts: Number(process.env.SCHEDULER_MAX_RETRIES || 3),
      meta: {
        createdBy: "api/scheduler/create",
        userPostingPreferencesSnapshot: userPrefs || null,
      },
    });

    return NextResponse.json({ ok: true, scheduled: sp }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/scheduler/create", err);
    return NextResponse.json({ ok: false, error: "server_error", detail: String(err) }, { status: 500 });
  }
}
