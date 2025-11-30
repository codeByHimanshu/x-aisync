"use client";
import React, { useEffect, useState } from "react";

type WindowItem = { id: string; start: string; end: string };
type Prefs = {
  windows?: WindowItem[] | { start: string; end: string }[];
  timezone?: string;
  dailyLimit?: number | null;
  tone?: string;
  topics?: string[];
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export default function PostingPreferencesPanel({
  className,
}: {
  className?: string;
}): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [windows, setWindows] = useState<WindowItem[]>([]);
  const [timezone, setTimezone] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [dailyLimit, setDailyLimit] = useState<number | "">("");
  const [tone, setTone] = useState<string>("neutral");
  const [topicsRaw, setTopicsRaw] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load profile");
        const j = await res.json();
        const prefs = j.user?.postingPreferences ?? j.postingPreferences ?? null;

        if (!mounted) return;

        if (prefs) {
          const w = Array.isArray(prefs.windows)
            ? prefs.windows.map((x: any) => ({ id: uid(), start: x.start || "08:00", end: x.end || "09:00" }))
            : [];
          setWindows(w.length ? w : [{ id: uid(), start: "08:00", end: "09:00" }]);
          setTimezone(prefs.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
          setDailyLimit(typeof prefs.dailyLimit === "number" ? prefs.dailyLimit : "");
          setTone(prefs.tone || "neutral");
          setTopicsRaw(Array.isArray(prefs.topics) ? prefs.topics.join(", ") : (prefs.topics || "").toString());
        } else {
          setWindows([{ id: uid(), start: "08:00", end: "09:00" }]);
          setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
          setDailyLimit("");
          setTone("neutral");
          setTopicsRaw("");
        }
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  function addWindow() {
    setWindows((s) => [...s, { id: uid(), start: "08:00", end: "09:00" }]);
  }

  function removeWindow(id: string) {
    setWindows((s) => s.filter((w) => w.id !== id));
  }

  function updateWindow(id: string, key: "start" | "end", val: string) {
    setWindows((s) => s.map((w) => (w.id === id ? { ...w, [key]: val } : w)));
  }

  function parseTopics(raw: string) {
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    // normalise windows to array of {start,end}
    const payloadWindows = windows
      .filter((w) => w.start && w.end)
      .map((w) => ({ start: w.start, end: w.end }));

    // simple validation: start < end unless spanning midnight allowed
    for (const w of payloadWindows) {
      if (!/^\d{2}:\d{2}$/.test(w.start) || !/^\d{2}:\d{2}$/.test(w.end)) {
        setError("Invalid window times. Use HH:MM format.");
        setSaving(false);
        return;
      }
    }

    const payload: any = {
      postingPreferences: {
        windows: payloadWindows,
        timezone: timezone || "UTC",
        dailyLimit: dailyLimit === "" ? null : Number(dailyLimit),
        tone,
        topics: parseTopics(topicsRaw),
      },
    };

    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || !j.ok) {
        const msg = j?.error || j?.detail || `Save failed (${res.status})`;
        throw new Error(msg);
      }
      setSuccess("Preferences saved.");
      // clear success after a short time
      setTimeout(() => setSuccess(null), 3000);
    } catch (ex: any) {
      setError(String(ex?.message || ex));
    } finally {
      setSaving(false);
    }
  }

  function nextWindowPreview(): string {
    if (!windows || windows.length === 0) return "No windows set";
    try {
      // show first window start as example
      const w = windows[0];
      return `${w.start} — ${w.end} (${timezone})`;
    } catch {
      return "—";
    }
  }

  return (
    <div className={className}>
      <form onSubmit={handleSave} className="p-4 bg-white rounded-xl border shadow-sm">
        <h3 className="text-lg font-medium mb-3">Posting Preferences</h3>

        {loading ? (
          <div className="text-sm text-gray-500">Loading preferences…</div>
        ) : (
          <>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Posting windows</label>
              <div className="space-y-2">
                {windows.map((w) => (
                  <div key={w.id} className="flex items-center gap-2">
                    <input
                      type="time"
                      value={w.start}
                      onChange={(e) => updateWindow(w.id, "start", e.target.value)}
                      className="border rounded px-2 py-1"
                    />
                    <span className="text-sm text-gray-500">to</span>
                    <input
                      type="time"
                      value={w.end}
                      onChange={(e) => updateWindow(w.id, "end", e.target.value)}
                      className="border rounded px-2 py-1"
                    />
                    <button
                      type="button"
                      onClick={() => removeWindow(w.id)}
                      className="ml-auto text-sm text-red-600 px-2 py-1 rounded hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div>
                  <button type="button" onClick={addWindow} className="text-sm px-3 py-1 rounded bg-gray-100 hover:bg-gray-200">
                    + Add window
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Windows may cross midnight (e.g., 23:00 to 02:00).</p>
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Timezone</label>
              <input
                list="tzlist"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full border rounded px-2 py-1"
              />
              <datalist id="tzlist">
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
              <p className="text-xs text-gray-500 mt-1">Set the timezone used to evaluate posting windows.</p>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Daily posting limit</label>
              <input
                type="number"
                min={0}
                step={1}
                value={dailyLimit as any}
                onChange={(e) => setDailyLimit(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-40 border rounded px-2 py-1"
                placeholder="e.g. 3"
              />
              <p className="text-xs text-gray-500 mt-1">Limit the number of scheduled posts posted per day.</p>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Tone</label>
              <select value={tone} onChange={(e) => setTone(e.target.value)} className="border rounded px-2 py-1">
                <option value="neutral">Neutral</option>
                <option value="funny">Funny</option>
                <option value="professional">Professional</option>
                <option value="inspirational">Inspirational</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">Default tone used by the AI generator (if used).</p>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Topics (comma separated)</label>
              <input
                value={topicsRaw}
                onChange={(e) => setTopicsRaw(e.target.value)}
                className="w-full border rounded px-2 py-1"
                placeholder="ai, product, javascript"
              />
              <p className="text-xs text-gray-500 mt-1">Topics used by the AI generator to bias output.</p>
            </div>

            <div className="flex items-center gap-3 mt-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center px-4 py-2 rounded bg-black text-white text-sm hover:opacity-95"
              >
                {saving ? "Saving…" : "Save preferences"}
              </button>

              <button
                type="button"
                onClick={() => {
                  // reset to defaults (not persisted)
                  setWindows([{ id: uid(), start: "08:00", end: "09:00" }]);
                  setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
                  setDailyLimit("");
                  setTone("neutral");
                  setTopicsRaw("");
                }}
                className="text-sm px-3 py-2 rounded border hover:bg-gray-50"
              >
                Reset
              </button>

              <div className="ml-auto text-sm text-gray-500">
                Next window preview: <span className="font-medium">{nextWindowPreview()}</span>
              </div>
            </div>

            {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
            {success && <div className="mt-3 text-sm text-green-600">{success}</div>}
          </>
        )}
      </form>
    </div>
  );
}
