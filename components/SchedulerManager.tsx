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

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Return YYYY-MM-DD for a given date in the provided timezone
function dayKeyForDateInTZ(date: Date, tz: string) {
  // use en-CA formatting produces YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// format time for display in given tz
function formatTimeInTZ(iso: string, tz: string) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
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
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(dObj);
  } catch {
    return `${y}-${m}-${d}`;
  }
}

function statusBadgeClass(s?: string) {
  switch ((s || "pending").toLowerCase()) {
    case "posted":
      return "bg-green-100 text-green-800";
    case "queued":
      return "bg-indigo-100 text-indigo-800";
    case "failed":
      return "bg-red-100 text-red-800";
    default:
      return "bg-yellow-100 text-yellow-800";
  }
}

export default function SchedulerManager(): React.ReactElement {
  const [items, setItems] = useState<Scheduled[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [days, setDays] = useState<string[]>([]); // array of dayKeys (YYYY-MM-DD)
  const [userTz, setUserTz] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );

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
    const tz =
      userTz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const today = new Date();
    // get today's dayKey in user's timezone, then create next 7 dayKeys
    const baseKey = dayKeyForDateInTZ(today, tz);
    const parts = baseKey.split("-").map((s) => Number(s));
    const baseDate = new Date(
      Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0)
    ); // midday UTC for the local day
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

  useEffect(() => {
    load();
  }, []);

  // returns items whose scheduledAt lands on provided dayKey when interpreted in the item's timezone (or user's timezone)
  function scheduledForDayKey(dayKey: string) {
    return items
      .filter((it) => {
        try {
          const tz = it.timezone || userTz || "UTC";
          const itemDay = dayKeyForDateInTZ(new Date(it.scheduledAt), tz);
          return itemDay === dayKey;
        } catch {
          return false;
        }
      })
      .sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      );
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
    <div className="p-6 bg-white  shadow-sm min-h-[48vh] lg:min-h-[40vh] w-full md:h-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
        <h3 className="text-2xl font-semibold">Scheduler</h3>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600">
            Timezone: <strong className="text-base">{userTz}</strong>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-5">
        <div className="hidden lg:grid lg:grid-cols-7 gap-3 w-full">
          {days.map((dayKey) => {
            const list = scheduledForDayKey(dayKey);
            const isSelected = dayKey === selectedDayKey;
            return (
              <button
                key={dayKey}
                onClick={() => setSelectedDayKey(dayKey)}
                className={`p-4 rounded-lg border text-left transition-all ${
                  isSelected
                    ? "bg-indigo-50 border-indigo-300 shadow-inner"
                    : "bg-white hover:shadow-sm"
                }`}
              >
                <div className="text-sm font-semibold">
                  {friendlyDayLabel(dayKey, userTz)}
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  {list.length} scheduled
                </div>
              </button>
            );
          })}
        </div>

        <div className="lg:hidden flex flex-col gap-3 w-full">
          {days.map((dayKey) => {
            const list = scheduledForDayKey(dayKey);
            const isSelected = dayKey === selectedDayKey;
            return (
              <button
                key={dayKey}
                onClick={() => setSelectedDayKey(dayKey)}
                className={`w-full p-3 rounded-lg border text-left transition-colors ${
                  isSelected
                    ? "bg-indigo-50 border-indigo-300"
                    : "bg-white hover:shadow-sm"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">
                    {friendlyDayLabel(dayKey, userTz)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {list.length} scheduled
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="text-lg font-medium">
          Scheduled for{" "}
          {selectedDayKey ? friendlyDayLabel(selectedDayKey, userTz) : "—"}
        </div>
        <div className="text-sm text-gray-500">
          {loading ? "Loading…" : `${items.length} total`}
        </div>
      </div>

      {loading ? (
        <div className="text-base text-gray-600">Loading…</div>
      ) : (
        <>
          {!selectedDayKey ||
          scheduledForDayKey(selectedDayKey).length === 0 ? (
            <div className="text-base text-gray-500 py-6">
              No scheduled posts for this day.
            </div>
          ) : (
            <ul className="space-y-4">
              {scheduledForDayKey(selectedDayKey).map((it) => {
                const tz = it.timezone || userTz;
                return (
                  <li
                    key={it._id}
                    className="p-4 border rounded-lg flex flex-col sm:flex-row justify-between items-start gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-lg font-medium leading-snug wrap-break-words">
                        {it.text || it.aiPrompt || (
                          <em className="text-gray-400">(AI)</em>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 mt-2">
                        {formatTimeInTZ(it.scheduledAt, tz)} •{" "}
                        <span className="font-medium">{tz}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-3">
                      <span
                        className={`inline-flex items-center text-sm font-semibold px-3 py-1 rounded-full ${statusBadgeClass(
                          it.status
                        )}`}
                      >
                        {it.status ?? "pending"}
                      </span>

                      <div className="flex gap-2">
                        <button
                          onClick={() => navigator.clipboard?.writeText(it._id)}
                          className="px-3 py-2 text-sm rounded-md border hover:bg-gray-50"
                        >
                          Copy ID
                        </button>
                        <button
                          onClick={() => handleDelete(it._id)}
                          className="px-3 py-2 text-sm rounded-md border text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
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
