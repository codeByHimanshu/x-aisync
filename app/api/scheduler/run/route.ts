// app/api/scheduler/run/route.ts
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb"; // or "@/lib/mongoose" if that's your helper
import { ScheduledPost } from "@/models/ScheduledPost";
import { Account,User } from "@/models/Account";
import { DailyPostCount } from "@/models/DailyPostCount";
import { decryptToken, encryptToken } from "@/lib/crypto";

export const dynamic = "force-dynamic"; // ensure serverless invocation is dynamic

const POLL_LIMIT = Number(process.env.SCHEDULER_POLL_LIMIT || 20);
const MAX_RETRIES = Number(process.env.SCHEDULER_MAX_RETRIES || 3);

/** helpers **/
function minutesFromHHMM(hhmm = "00:00") {
  const [hh, mm] = hhmm.split(":").map((n) => Number(n || 0));
  return hh * 60 + mm;
}
function localDateKey(date: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
async function incrementDailyCount(xUserId: string, dateKey: string) {
  const res = await DailyPostCount.findOneAndUpdate(
    { xUserId, date: dateKey },
    { $inc: { count: 1 }, $set: { updatedAt: new Date() } },
    { upsert: true, new: true }
  ).lean();
  return res.count;
}
async function getDailyCount(xUserId: string, dateKey: string) {
  const doc = await DailyPostCount.findOne({ xUserId, date: dateKey }).lean();
  return doc ? doc.count : 0;
}

async function aiGenerate(prompt: string) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant that writes concise tweets (<=280 chars)." },
        { role: "user", content: prompt },
      ],
      max_tokens: 120,
      temperature: 0.8,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  const j = JSON.parse(text);
  return j.choices?.[0]?.message?.content?.trim() ?? "";
}

async function refreshAccessToken(account: any) {
  const refreshEnc = account?.oauth?.refreshTokenEnc;
  if (!refreshEnc) return null;
  const refreshToken = await decryptToken(refreshEnc);
  const tokenUrl = process.env.X_OAUTH_TOKEN_URL!;
  const clientId = process.env.X_CLIENT_ID!;
  const clientSecret = process.env.X_CLIENT_SECRET || "";

  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  if (!clientSecret) body.set("client_id", clientId);

  const headers: Record<string,string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (clientSecret) headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;

  const r = await fetch(tokenUrl, { method: "POST", headers, body: body.toString() });
  const txt = await r.text();
  if (!r.ok) throw new Error(txt);
  const js = JSON.parse(txt);
  const newAccess = js.access_token;
  const newRefresh = js.refresh_token || refreshToken;
  const expiresIn = js.expires_in;

  // persist encrypted tokens
  try {
    await Account.updateOne(
      { xUserId: account.xUserId },
      {
        $set: {
          "oauth.accessTokenEnc": newAccess ? await encryptToken(newAccess) : undefined,
          ...(newRefresh ? { "oauth.refreshTokenEnc": await encryptToken(newRefresh) } : {}),
          "oauth.expiresAt": typeof expiresIn === "number" ? new Date(Date.now() + expiresIn * 1000) : null,
          updatedAt: new Date(),
        },
      }
    );
  } catch (e) {
    console.error("Failed storing refreshed tokens:", e);
  }

  return newAccess;
}

async function postTweet(accessToken: string, text: string) {
  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const txt = await res.text();
  return { ok: res.ok, status: res.status, body: txt };
}

/** Main cron handler **/
export async function GET() {
  try {
    await connectDB();
    const now = new Date();

    const jobs = await ScheduledPost.find({
      status: { $in: ["pending", "failed"] },
      scheduledAt: { $lte: now },
      attempts: { $lt: MAX_RETRIES },
    }).limit(POLL_LIMIT).lean();

    if (!jobs || jobs.length === 0) return NextResponse.json({ ok: true, processed: 0 });

    let processed = 0;
    for (const job of jobs) {
      try {
        // optimistic lock — only update if status unchanged
        const locked = await ScheduledPost.findOneAndUpdate(
          { _id: job._id, status: job.status },
          { $set: { status: "queued", updatedAt: new Date() } },
          { new: true }
        );
        if (!locked) continue;

        // resolve prefs & timezone
        const user = await User.findOne({ xUserId: job.xUserId }).lean();
        const prefs = user?.postingPreferences || job.meta?.userPostingPreferencesSnapshot || {};
        const tz = job.timezone || prefs.timezone || "UTC";
        const windows = Array.isArray(prefs.windows) ? prefs.windows : [];
        const dailyLimit = typeof prefs.dailyLimit === "number" ? prefs.dailyLimit : null;

        // generate text if needed
        let text = job.text;
        if (job.generateWithAI && (!text || text.trim().length === 0)) {
          try {
            const prompt = job.aiPrompt || `Write a short tweet about ${prefs.topics?.join(", ") || "technology"}. Tone: ${prefs.tone || "neutral"}.`;
            text = await aiGenerate(prompt);
          } catch (e: any) {
            await ScheduledPost.updateOne({ _id: job._id }, { $inc: { attempts: 1 }, $set: { status: "failed", lastError: `ai_error: ${String(e?.message||e)}`, updatedAt: new Date() } });
            continue;
          }
        }

        if (!text || text.trim().length === 0) {
          await ScheduledPost.updateOne({ _id: job._id }, { $inc: { attempts: 1 }, $set: { status: "failed", lastError: "empty_text", updatedAt: new Date() } });
          continue;
        }

        // enforce dailyLimit
        if (dailyLimit !== null) {
          const dayKey = localDateKey(new Date(job.scheduledAt), tz);
          const count = await getDailyCount(job.xUserId, dayKey);
          if (count >= dailyLimit) {
            // postpone job to next day start of first window or +24h
            if (windows.length > 0) {
              // compute next day + first window start (simple)
              const next = new Date(job.scheduledAt);
              next.setDate(next.getDate() + 1);
              const [hh, mm] = windows[0].start.split(":").map(Number);
              next.setHours(hh, mm, 0, 0);
              await ScheduledPost.updateOne({ _id: job._id }, { $set: { scheduledAt: next, status: "pending", lastError: "daily_limit_postponed", updatedAt: new Date() }, $inc: { attempts: 1 } });
            } else {
              const next = new Date(job.scheduledAt); next.setDate(next.getDate() + 1);
              await ScheduledPost.updateOne({ _id: job._id }, { $set: { scheduledAt: next, status: "pending", lastError: "daily_limit_postponed", updatedAt: new Date() }, $inc: { attempts: 1 } });
            }
            continue;
          }
        }

        // enforce posting windows
        if (windows.length > 0) {
          const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(job.scheduledAt));
         const hh = Number(parts.find(p => p.type === "hour")?.value ?? "0");
const mm= Number(parts.find(p => p.type === "minute")?.value ?? "0");

          const mins = hh * 60 + mm;
          let inWindow = false;
          for (const w of windows) {
            const s = minutesFromHHMM(w.start), e = minutesFromHHMM(w.end);
            if (e >= s) { if (mins >= s && mins <= e) { inWindow = true; break; } }
            else { if (mins >= s || mins <= e) { inWindow = true; break; } } // crosses midnight
          }
          if (!inWindow) {
            // postpone to next window start (same day or next day)
            // find next start > mins
            let next = new Date(job.scheduledAt);
            let found = false;
            for (const w of windows) {
              const s = minutesFromHHMM(w.start);
              if (s > mins) {
                next.setHours(Math.floor(s/60), s%60, 0, 0);
                found = true;
                break;
              }
            }
            if (!found) {
              const s = minutesFromHHMM(windows[0].start);
              next.setDate(next.getDate() + 1);
              next.setHours(Math.floor(s/60), s%60, 0, 0);
            }
            await ScheduledPost.updateOne({ _id: job._id }, { $set: { scheduledAt: next, status: "pending", lastError: "outside_window_postponed", updatedAt: new Date() }, $inc: { attempts: 1 } });
            continue;
          }
        }

        // get account and access token (refresh if required)
        const account = await Account.findOne({ xUserId: job.xUserId }).lean();
        if (!account) { await ScheduledPost.updateOne({ _id: job._id }, { $inc: { attempts: 1 }, $set: { status: "failed", lastError: "no_account" } }); continue; }

        let accessToken: string | null = null;
        try {
          if (account.oauth?.accessTokenEnc) accessToken = await decryptToken(account.oauth.accessTokenEnc);
        } catch (e) { accessToken = null; }

        if (!accessToken) {
          try { accessToken = await refreshAccessToken(account); } catch (e) { accessToken = null; }
        }

        if (!accessToken) {
          await ScheduledPost.updateOne({ _id: job._id }, { $inc: { attempts: 1 }, $set: { status: "failed", lastError: "no_access_token", updatedAt: new Date() } });
          continue;
        }

        // post tweet
        const posted = await postTweet(accessToken, text);
        if (!posted.ok) {
          // rate limit or other issues — increment attempts and keep as failed for retry
          await ScheduledPost.updateOne({ _id: job._id }, { $inc: { attempts: 1 }, $set: { status: "failed", lastError: `post_error: ${posted.status} ${posted.body}`, updatedAt: new Date() } });
          continue;
        }

        // success — mark posted and increment daily counter for user's local day
        await ScheduledPost.updateOne({ _id: job._id }, { $set: { status: "posted", postedAt: new Date(), response: JSON.parse(posted.body), updatedAt: new Date() } });
        const postedDayKey = localDateKey(new Date(), tz);
        await incrementDailyCount(job.xUserId, postedDayKey);
        processed++;

        // if repeat daily: create next
        if (job.repeat === "daily") {
          const next = new Date(job.scheduledAt);
          next.setDate(next.getDate() + 1);
          await ScheduledPost.create({
            userId: job.userId,
            xUserId: job.xUserId,
            text: job.text,
            aiPrompt: job.aiPrompt,
            generateWithAI: job.generateWithAI,
            scheduledAt: next,
            timezone: job.timezone,
            repeat: "daily",
            status: "pending",
            attempts: 0,
            maxAttempts: job.maxAttempts ?? MAX_RETRIES,
          });
        }
      } catch (innerErr) {
        console.error("job loop error:", innerErr);
        try { await ScheduledPost.updateOne({ _id: job._id }, { $inc: { attempts: 1 }, $set: { status: "failed", lastError: String(innerErr), updatedAt: new Date() } }); } catch {}
      }
    }

    return NextResponse.json({ ok: true, processed });
  } catch (err: any) {
    console.error("scheduler.run error", err);
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
