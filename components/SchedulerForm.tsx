"use client";
import React, { useState } from "react";

type Props = { onCreated?: () => void };

export default function SchedulerForm({ onCreated }: Props): React.ReactElement {
  const [text, setText] = useState<string>("");
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [generateWithAI, setGenerateWithAI] = useState<boolean>(false);

  // --- helpers for datetime-local <-> local ISO handling ---
  function pad(n: number) {
    return String(n).padStart(2, "0");
  }
  function formatLocalForDateTimeLocal(d: Date) {
    // returns "YYYY-MM-DDTHH:mm" suitable for input[type=datetime-local]
    return (
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      "T" +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes())
    );
  }
  function localDatetimeLocalToISOString(val: string) {
    // val: "YYYY-MM-DDTHH:mm" (interpreted as local time by Date constructor)
    return new Date(val).toISOString();
  }

  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    const t = new Date();
    t.setMinutes(t.getMinutes() + 30);
    // use local formatting instead of toISOString().slice(0,16)
    return formatLocalForDateTimeLocal(t);
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const MAX_TWEET_LENGTH = 280;

  function validateBeforeSubmit(): string | null {
    if (!scheduledAt) return "Please select a schedule time.";
    const scheduledDate = new Date(scheduledAt); // parsed as local
    if (isNaN(scheduledDate.getTime())) return "Invalid schedule time.";
    const minAllowed = Date.now() - 30 * 1000; // allow small clock skew
    if (scheduledDate.getTime() <= minAllowed) return "Schedule time must be in the future.";

    if (!generateWithAI) {
      if (!text || text.trim().length === 0) return "Please provide tweet text or enable AI generation.";
      if (text.length > MAX_TWEET_LENGTH) return `Tweet must be ${MAX_TWEET_LENGTH} characters or fewer.`;
    } else {
      if (text && text.length > MAX_TWEET_LENGTH) return `Tweet must be ${MAX_TWEET_LENGTH} characters or fewer.`;
    }

    return null;
  }

  async function handleGenerateAI() {
    setAiLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/scheduler/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt || "Write a short tweet about developer productivity and AI." }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j || !j.ok) {
        throw new Error(j?.error || j?.detail || "AI generation failed");
      }
      const out = j.text ?? j.output ?? "";
      setText(out.slice(0, MAX_TWEET_LENGTH));
      setSuccess("AI generation inserted into text area.");
      setTimeout(() => setSuccess(null), 2500);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const validationErr = validateBeforeSubmit();
    if (validationErr) {
      setError(validationErr);
      return;
    }

    setLoading(true);
    try {
      // Convert the local datetime-local string to ISO UTC before sending
      const isoUtc = localDatetimeLocalToISOString(scheduledAt);
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const body = {
        text: text.trim(),
        aiPrompt: aiPrompt.trim(),
        generateWithAI: Boolean(generateWithAI),
        scheduledAt: isoUtc,
        timezone,
        repeat: "none",
      };

      const res = await fetch("/api/scheduler/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j || !j.ok) {
        throw new Error(j?.error || j?.detail || `Failed to schedule (${res.status})`);
      }

      // Success — reset fields (keep user's timezone)
      setText("");
      setAiPrompt("");
      setGenerateWithAI(false);
      const nextDefault = new Date();
      nextDefault.setMinutes(nextDefault.getMinutes() + 30);
      setScheduledAt(formatLocalForDateTimeLocal(nextDefault));

      setSuccess("Scheduled successfully.");
      setTimeout(() => setSuccess(null), 3000);

      if (typeof onCreated === "function") onCreated();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Tweet text</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full border rounded p-2"
          rows={4}
          placeholder={generateWithAI ? "Optional: provide text or leave blank to auto-generate at post time" : "Write your tweet (max 280 chars)"}
          maxLength={MAX_TWEET_LENGTH}
        />
        <div className="flex justify-between text-xs mt-1 text-gray-500">
          <div>{text.length}/{MAX_TWEET_LENGTH} chars</div>
          <div>{generateWithAI ? "AI mode ON" : "Manual text"}</div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">AI prompt (optional)</label>
        <input
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          className="w-full border rounded p-2"
          placeholder="E.g. 'Short motivational tweet about coding'"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerateAI}
            disabled={aiLoading}
            className="inline-flex items-center gap-2 px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm"
          >
            {aiLoading ? "Generating…" : "Generate with AI"}
          </button>

          <label className="ml-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={generateWithAI}
              onChange={(e) => setGenerateWithAI(e.target.checked)}
            />
            <span>Auto-generate at post time (use prompt if text empty)</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Schedule time</label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="border rounded p-2"
        />
        <div className="text-xs text-gray-500 mt-1">
          Time shown is local to your browser. We'll store it as UTC on the server. Your timezone: <strong>{Intl.DateTimeFormat().resolvedOptions().timeZone}</strong>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {success && <div className="text-sm text-green-600">{success}</div>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="bg-black text-white rounded px-4 py-2"
        >
          {loading ? "Scheduling…" : "Schedule Tweet"}
        </button>

        <button
          type="button"
          onClick={() => {
            setText("");
            setAiPrompt("");
            setGenerateWithAI(false);
            const next = new Date();
            next.setMinutes(next.getMinutes() + 30);
            setScheduledAt(formatLocalForDateTimeLocal(next));
            setError(null);
            setSuccess(null);
          }}
          className="text-sm px-3 py-2 border rounded"
        >
          Reset
        </button>
      </div>
    </form>
  );
}
