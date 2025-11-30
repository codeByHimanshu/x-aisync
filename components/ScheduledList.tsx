"use client";
import React, { useEffect, useState } from "react";

type Scheduled = {
  _id: string;
  text?: string;
  aiPrompt?: string;
  scheduledAt: string; // ISO
  timezone?: string | null;
  status?: string;
};

function dayKeyForDateInTZ(date: Date, tz: string) {
  // returns YYYY-MM-DD for that timezone
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function friendlyDateTime(iso: string, tz: string) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function statusColor(status?: string) {
  switch ((status || "").toLowerCase()) {
    case "posted":
      return "bg-green-100 text-green-800";
    case "queued":
      return "bg-indigo-100 text-indigo-800";
    case "failed":
      return "bg-red-100 text-red-800";
    case "pending":
    default:
      return "bg-yellow-100 text-yellow-800";
  }
}

export default function ScheduledList(): React.ReactElement {
  const [items, setItems] = useState<Scheduled[]>([]);
  const [loading, setLoading] = useState(true);
  const [userTz, setUserTz] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

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

  useEffect(() => {
    load();
  }, []);

  // Group items into days (use each item's timezone if available; fallback to user's timezone)
  const groups: { key: string; display: string; items: Scheduled[] }[] = [];
  if (!loading && items.length > 0) {
    const map = new Map<string, { key: string; tz: string; items: Scheduled[] }>();
    for (const it of items) {
      const tz = it.timezone || userTz || "UTC";
      const key = dayKeyForDateInTZ(new Date(it.scheduledAt), tz);
      if (!map.has(key)) map.set(key, { key, tz, items: [] });
      map.get(key)!.items.push(it);
    }
    // Sort group keys (ascending)
    const sortedKeys = Array.from(map.keys()).sort();
    for (const k of sortedKeys) {
      const entry = map.get(k)!;
      // nice display: convert YYYY-MM-DD to readable form (in group's tz)
      const parts = k.split("-");
      const isoMid = `${parts[0]}-${parts[1]}-${parts[2]}T12:00:00.000Z`;
      const display = new Intl.DateTimeFormat(undefined, { timeZone: entry.tz, weekday: "long", month: "short", day: "numeric" }).format(new Date(isoMid));
      // sort items within the day by scheduledAt ascending
      entry.items.sort((a,b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
      groups.push({ key: k, display, items: entry.items });
    }
  }

  async function handleDelete(id: string) {
    const ok = confirm("Delete this scheduled post? This cannot be undone.");
    if (!ok) return;
    try {
      await fetch(`/api/scheduler/delete/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      // ignore
      await load();
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium">Scheduled Posts</h4>
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-500">Timezone: <strong className="ml-1">{userTz}</strong></div>
          <button onClick={load} className="text-xs px-2 py-1 bg-gray-100 rounded">Refresh</button>
        </div>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-500">No scheduled posts</div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="rounded-lg overflow-hidden border">
              <div className="px-4 py-2 bg-gradient from-white to-slate-50 border-b">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{g.display}</div>
                  <div className="text-xs text-gray-500">{g.items.length} scheduled</div>
                </div>
              </div>

              <div className="p-3 space-y-2 bg-white">
                {g.items.map((i) => (
                  <div key={i._id} className="p-3 rounded-md border hover:shadow-sm flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium">{i.text || i.aiPrompt || <em className="text-gray-400">[AI-generated]</em>}</div>
                      <div className="text-xs text-gray-500 mt-1">{friendlyDateTime(i.scheduledAt, i.timezone || userTz)}</div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded ${statusColor(i.status)}`}>
                        {i.status ?? "pending"}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDelete(i._id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => navigator.clipboard?.writeText(i._id)}
                          className="text-xs text-gray-600 hover:underline"
                        >
                          Copy ID
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
