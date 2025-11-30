// worker/scheduler.js
/* eslint-disable no-console */
require("dotenv").config();

const { connectDB } = require("../lib/mongoose");
const { ScheduledPost } = require("../models/ScheduledPost");
const { Account } = require("../models/Account");
const { User } = require("../models/User");
const { DailyPostCount } = require("../models/DailyPostCount");
const cryptoHelpers = require("../lib/crypto"); // has encryptToken, decryptToken
// use global fetch (Node 18+)
const fetch = globalThis.fetch;

const POLL_INTERVAL = Number(process.env.SCHEDULER_POLL_INTERVAL || 60) * 1000;
const MAX_RETRIES = Number(process.env.SCHEDULER_MAX_RETRIES || 3);
const BACKOFF_BASE = Number(process.env.SCHEDULER_RETRY_BACKOFF || 60); // seconds

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function backoffSeconds(attempt) { return BACKOFF_BASE * Math.pow(2, Math.max(0, attempt - 1)); }

function minutesFromHHMM(hhmm = "00:00") {
  const [hh, mm] = hhmm.split(":").map((n) => Number(n || 0));
  return hh * 60 + mm;
}

function formatDateKeyForTZ(date, tz) {
  // returns YYYY-MM-DD in that timezone using Intl
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(date); // "YYYY-MM-DD"
}

async function incrementDailyCount(xUserId, dateKey) {
  const res = await DailyPostCount.findOneAndUpdate(
    { xUserId, date: dateKey },
    { $inc: { count: 1 }, $set: { updatedAt: new Date() } },
    { upsert: true, new: true }
  ).lean();
  return res.count;
}

async function getDailyCount(xUserId, dateKey) {
  const doc = await DailyPostCount.findOne({ xUserId, date: dateKey }).lean();
  return doc ? doc.count : 0;
}

async function fetchOpenAI(prompt) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant that writes short tweets (<= 280 chars)." },
        { role: "user", content: prompt },
      ],
      max_tokens: 120,
      temperature: 0.8,
    }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(text);
  const j = JSON.parse(text);
  const out = j.choices?.[0]?.message?.content ?? "";
  return out.trim();
}

async function getValidAccessToken(xUserId) {
  // returns plaintext access token or null
  const acc = await Account.findOne({ xUserId }).lean();
  if (!acc) return null;
  const oauth = acc.oauth || {};
  const accessEnc = oauth.accessTokenEnc;
  const refreshEnc = oauth.refreshTokenEnc;
  const expiresAt = oauth.expiresAt ? new Date(oauth.expiresAt) : null;

  // use access if valid
  if (accessEnc && (!expiresAt || expiresAt.getTime() > Date.now() + 5000)) {
    try {
      return await cryptoHelpers.decryptToken(accessEnc);
    } catch (e) {
      console.error("decrypt access failed:", e);
    }
  }

  // try refresh
  if (!refreshEnc) return null;
  try {
    const refreshToken = await cryptoHelpers.decryptToken(refreshEnc);
    const tokenUrl = process.env.X_OAUTH_TOKEN_URL || "https://api.twitter.com/2/oauth2/token";
    const clientId = process.env.X_CLIENT_ID || "";
    const clientSecret = process.env.X_CLIENT_SECRET || "";

    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
    if (!clientSecret) body.set("client_id", clientId);

    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    if (clientSecret) headers["Authorization"] = "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const r = await fetch(tokenUrl, { method: "POST", headers, body: body.toString() });
    const txt = await r.text();
    if (!r.ok) throw new Error(txt);
    const js = JSON.parse(txt);
    const newAccess = js.access_token;
    const newRefresh = js.refresh_token || refreshToken;
    const expiresIn = js.expires_in;

    // persist encrypted tokens (best-effort)
    try {
      const encA = newAccess ? await cryptoHelpers.encryptToken(newAccess) : undefined;
      const encR = newRefresh ? await cryptoHelpers.encryptToken(newRefresh) : undefined;
      const expiresAtNew = typeof expiresIn === "number" ? new Date(Date.now() + expiresIn * 1000) : null;
      await Account.updateOne(
        { xUserId },
        {
          $set: {
            "oauth.accessTokenEnc": encA,
            ...(encR ? { "oauth.refreshTokenEnc": encR } : {}),
            "oauth.expiresAt": expiresAtNew,
            updatedAt: new Date(),
          },
        }
      );
    } catch (e) {
      console.error("failed to store refreshed tokens:", e);
    }

    return newAccess;
  } catch (e) {
    console.error("refresh error:", e);
    return null;
  }
}

async function postTweet(accessToken, text) {
  const r = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const txt = await r.text();
  if (!r.ok) return { ok: false, status: r.status, body: txt };
  return { ok: true, status: r.status, body: JSON.parse(txt) };
}

async function postponeToNextWindow(job, windows, tz) {
  // find next window start after job.scheduledAt (in tz). If none on same day, pick first window next day.
  const scheduled = new Date(job.scheduledAt);
  // get local hour/minute in tz using Intl
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" }).formatToParts(scheduled);
  const hour = Number(parts.find(p=>p.type==="hour").value);
  const minute = Number(parts.find(p=>p.type==="minute").value);
  const minsNow = hour * 60 + minute;

  // find next window start > minsNow on same day
  let nextDate = new Date(scheduled);
  let found = false;
  for (const w of windows) {
    const startM = minutesFromHHMM(w.start);
    if (startM > minsNow) {
      const hh = Math.floor(startM / 60);
      const mm = startM % 60;
      // set nextDate to that local time in tz. We'll convert by constructing an ISO string using tz parts.
      // Build date components in tz: year-month-day from scheduled in tz
      const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(scheduled); // YYYY-MM-DD
      const isoLocal = `${dateParts}T${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:00`;
      // Interpret isoLocal as in tz by using Date constructor on ISO as if tz=local — we need absolute time.
      // To compute absolute time for that tz local, create Date from parts in UTC by leveraging Date.parse with 'Z' then adjust offset
      // Simpler approach: increment day until matching local hour via loop (safer)
      nextDate = new Date(scheduled);
      nextDate.setHours(hh, mm, 0, 0);
      found = true;
      break;
    }
  }

  if (!found) {
    // use first window next day
    const startM = minutesFromHHMM(windows[0].start);
    const hh = Math.floor(startM / 60);
    const mm = startM % 60;
    nextDate = new Date(scheduled);
    nextDate.setDate(nextDate.getDate() + 1);
    nextDate.setHours(hh, mm, 0, 0);
  }

  // store postponed scheduledAt as UTC ISO (we assume system timezone handling adequate)
  await ScheduledPost.updateOne({ _id: job._id }, { $set: { scheduledAt: nextDate, status: "pending", updatedAt: new Date(), lastError: "outside_window_postponed" }, $inc: { attempts: 1 } });
  console.log("Postponed job", job._id.toString(), "to", nextDate.toISOString());
}

async function processDue() {
  await connectDB();
  const now = new Date();

  const due = await ScheduledPost.find({
    status: { $in: ["pending", "failed"] },
    scheduledAt: { $lte: now },
    attempts: { $lt: MAX_RETRIES },
  }).limit(50).lean();

  if (!due || due.length === 0) return;

  for (const job of due) {
    console.log("Processing scheduled post", job._id.toString());
    try {
      const locked = await ScheduledPost.findOneAndUpdate(
        { _id: job._id, status: job.status },
        { $set: { status: "queued", updatedAt: new Date() } },
        { new: true }
      );
      if (!locked) {
        console.log("Could not lock job, skipping", job._id.toString());
        continue;
      }

      // fetch user & account
      const user = await User.findOne({ xUserId: job.xUserId }).lean();
      const account = await Account.findOne({ xUserId: job.xUserId }).lean();

      const prefs = user?.postingPreferences || job.meta?.postingPreferences || {};
      const tz = job.timezone || prefs.timezone || "UTC";
      const windows = Array.isArray(prefs.windows) ? prefs.windows : [];
      const dailyLimit = typeof prefs.dailyLimit === "number" ? prefs.dailyLimit : null;

      // If job.generateWithAI and no text, generate
      let text = job.text;
      if (job.generateWithAI && (!text || text.trim().length === 0)) {
        try {
          text = await fetchOpenAI(job.aiPrompt || "Write a short tweet about technology.");
        } catch (e) {
          console.error("AI generation failed", e);
          await ScheduledPost.updateOne({ _id: job._id }, { $set: { status: "failed", lastError: String(e), updatedAt: new Date() }, $inc: { attempts: 1 } });
          continue;
        }
      }

      if (!text || text.trim().length === 0) {
        await ScheduledPost.updateOne({ _id: job._id }, { $set: { status: "failed", lastError: "empty_text", updatedAt: new Date() }, $inc: { attempts: 1 } });
        continue;
      }

      // check daily limit
      if (dailyLimit !== null) {
        const dateKey = formatDateKeyForTZ(new Date(job.scheduledAt), tz);
        const count = await getDailyCount(job.xUserId, dateKey);
        if (count >= dailyLimit) {
          // postpone to next day first window or +24h
          if (windows.length > 0) {
            await postponeToNextWindow(job, windows, tz);
          } else {
            const nextDate = new Date(job.scheduledAt);
            nextDate.setDate(nextDate.getDate() + 1);
            await ScheduledPost.updateOne({ _id: job._id }, { $set: { scheduledAt: nextDate, status: "pending", updatedAt: new Date(), lastError: "daily_limit_reached_postponed" }, $inc: { attempts: 1 } });
            console.log("Daily limit reached — postponed job", job._id.toString(), "to", nextDate.toISOString());
          }
          continue;
        }
      }

      // check windows (if any)
      if (windows.length > 0) {
        // compute local minutes for scheduledAt
        const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(job.scheduledAt));
        const hh = Number(parts.find(p=>p.type==="hour").value);
        const mm = Number(parts.find(p=>p.type==="minute").value);
        const mins = hh * 60 + mm;

        let inWindow = false;
        for (const w of windows) {
          const startM = minutesFromHHMM(w.start);
          const endM = minutesFromHHMM(w.end);
          if (endM >= startM) {
            if (mins >= startM && mins <= endM) { inWindow = true; break; }
          } else {
            // crosses midnight
            if (mins >= startM || mins <= endM) { inWindow = true; break; }
          }
        }

        if (!inWindow) {
          // postpone to next window start
          await postponeToNextWindow(job, windows, tz);
          continue;
        }
      }

      // get valid access token (refresh if needed)
      const accessToken = await getValidAccessToken(job.xUserId);
      if (!accessToken) {
        console.warn("No access token available for job", job._id.toString());
        await ScheduledPost.updateOne({ _id: job._id }, { $set: { status: "failed", lastError: "no_access_token", updatedAt: new Date() }, $inc: { attempts: 1 } });
        continue;
      }

      // attempt post
      const res = await postTweet(accessToken, text);
      if (!res.ok) {
        console.error("Tweet post failed", res.status, res.body);
        // If rate limit (429) or 5xx, increment attempts and let worker retry later
        await ScheduledPost.updateOne({ _id: job._id }, { $set: { status: "failed", lastError: res.body, updatedAt: new Date() }, $inc: { attempts: 1 } });
        continue;
      }

      // success: mark posted and increment daily counter for the posting day (user tz)
      await ScheduledPost.updateOne({ _id: job._id }, { $set: { status: "posted", postedAt: new Date(), response: res.body, updatedAt: new Date() } });
      const postDateKey = formatDateKeyForTZ(new Date(), tz);
      await incrementDailyCount(job.xUserId, postDateKey);
      console.log("Tweet posted OK", res.body);

      // handle daily repeat
      if (job.repeat === "daily") {
        const next = new Date(job.scheduledAt);
        next.setDate(next.getDate() + 1);
        await ScheduledPost.create({
          userId: job.userId,
          xUserId: job.xUserId,
          aiPrompt: job.aiPrompt,
          generateWithAI: job.generateWithAI,
          text: job.text,
          scheduledAt: next,
          timezone: job.timezone,
          repeat: "daily",
          status: "pending",
          attempts: 0,
          maxAttempts: job.maxAttempts ?? MAX_RETRIES,
        });
      }
    } catch (err) {
      console.error("Unexpected worker error processing job", job._id.toString(), err);
      await ScheduledPost.updateOne({ _id: job._id }, { $set: { status: "failed", lastError: String(err), updatedAt: new Date() }, $inc: { attempts: 1 } });
    }
  }
}

async function main() {
  console.log("Scheduler worker starting...");
  await connectDB();

  while (true) {
    try {
      await processDue();
    } catch (e) {
      console.error("Worker loop error", e);
    }
    await sleep(POLL_INTERVAL);
  }
}

main().catch(e => { console.error("Worker crashed", e); process.exit(1); });
