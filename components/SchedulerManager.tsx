"use client";
import React, { useEffect, useState } from "react";

type Scheduled = {
  _id: string;
  scheduledAt: string; // ISO
  timezone?: string | null;
  text?: string;
  aiPrompt?: string;
  status?: string;
};

function pad(n: number) { return String(n).padStart(2, "0"); }

// Return YYYY-MM-DD for a given date in the provided timezone
function dayKeyForDateInTZ(date: Date, tz: string) {
  // use en-CA formatting produces YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// format time for display in given tz
function formatTimeInTZ(iso: string, tz: string) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  } catch {
    return new Date(iso).toLocaleTimeString();
  }
}

// format full friendly date for header
function friendlyDayLabel(dayKey: string, tz: string) {
  // dayKey is YYYY-MM-DD; create a midday UTC date to avoid DST shifts
  const [y, m, d] = dayKey.split("-");
  const iso = `${y}-${m}-${d}T12:00:00.000Z`;
  try {
    const dObj = new Date(iso);
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(dObj);
  } catch {
    return `${y}-${m}-${d}`;
  }
}

function statusBadgeClass(s?: string) {
  switch ((s || "pending").toLowerCase()) {
    case "posted": return "bg-green-100 text-green-800";
    case "queued": return "bg-indigo-100 text-indigo-800";
    case "failed": return "bg-red-100 text-red-800";
    default: return "bg-yellow-100 text-yellow-800";
  }
}

export default function SchedulerManager(): React.ReactElement {
  const [items, setItems] = useState<Scheduled[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [days, setDays] = useState<string[]>([]); // array of dayKeys (YYYY-MM-DD)
  const [userTz, setUserTz] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

  // load scheduled posts + user's timezone from API
  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/scheduler/list", { cache: "no-store" });
      const j = await res.json();
      if (j?.ok) {
        setItems(j.scheduled || []);
        if (j.userTimezone) setUserTz(j.userTimezone);
      } else {
        setItems([]);
      }
    } catch (e) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // build 7-day window starting from today in user's timezone
  useEffect(() => {
    const tz = userTz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const today = new Date();
    // get today's dayKey in user's timezone, then create next 7 dayKeys
    const baseKey = dayKeyForDateInTZ(today, tz);
    const parts = baseKey.split("-").map((s) => Number(s));
    const baseDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0)); // midday UTC for the local day
    const arr: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate);
      d.setUTCDate(d.getUTCDate() + i);
      const key = dayKeyForDateInTZ(d, tz);
      arr.push(key);
    }
    setDays(arr);
    // set default selected day if not set
    setSelectedDayKey((prev) => prev ?? arr[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userTz]);

  useEffect(() => { load(); }, []);

  // returns items whose scheduledAt lands on provided dayKey when interpreted in the item's timezone (or user's timezone)
  function scheduledForDayKey(dayKey: string) {
    return items.filter((it) => {
      try {
        const tz = it.timezone || userTz || "UTC";
        const itemDay = dayKeyForDateInTZ(new Date(it.scheduledAt), tz);
        return itemDay === dayKey;
      } catch {
        return false;
      }
    }).sort((a,b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete scheduled post? This cannot be undone.")) return;
    try {
      await fetch(`/api/scheduler/delete/${id}`, { method: "DELETE" });
    } catch {
      // ignore
    } finally {
      await load();
    }
  }

  return (
    <div className="p-4 bg-white rounded shadow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium">Scheduler</h3>
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-600">Timezone: <strong>{userTz}</strong></div>
          <button onClick={load} className="text-xs bg-gray-100 px-2 py-1 rounded">Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 mb-4">
        {days.map((dayKey) => {
          const list = scheduledForDayKey(dayKey);
          const isSelected = dayKey === selectedDayKey;
          return (
            <button
              key={dayKey}
              onClick={() => setSelectedDayKey(dayKey)}
              className={`p-2 rounded border text-left ${isSelected ? "bg-indigo-50 border-indigo-300" : "bg-white"}`}
            >
              <div className="text-xs font-semibold">{friendlyDayLabel(dayKey, userTz)}</div>
              <div className="mt-2 text-xs text-gray-500">{list.length} scheduled</div>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">Scheduled for {selectedDayKey ? friendlyDayLabel(selectedDayKey, userTz) : "—"}</div>
        <div className="text-xs text-gray-500">{loading ? "Loading…" : `${items.length} total`}</div>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : (
        <>
          {(!selectedDayKey || scheduledForDayKey(selectedDayKey).length === 0) ? (
            <div className="text-sm text-gray-500">No scheduled posts for this day.</div>
          ) : (
            <ul className="space-y-2">
              {scheduledForDayKey(selectedDayKey).map(it => {
                const tz = it.timezone || userTz;
                return (
                  <li key={it._id} className="p-3 border rounded flex justify-between items-start">
                    <div>
                      <div className="text-sm font-medium">{it.text || it.aiPrompt || <em className="text-gray-400">(AI)</em>}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatTimeInTZ(it.scheduledAt, tz)} • {tz}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded ${statusBadgeClass(it.status)}`}>
                        {it.status ?? "pending"}
                      </span>
                      <div className="flex gap-2">
                        <button onClick={() => navigator.clipboard?.writeText(it._id)} className="text-xs px-2 py-1 border rounded">Copy ID</button>
                        <button onClick={() => handleDelete(it._id)} className="text-xs px-2 py-1 border rounded text-red-600">Delete</button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
