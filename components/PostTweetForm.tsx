"use client";

import React, { useEffect, useState } from "react";

type MeResponse = {
  ok: boolean;
  user?: { username?: string; xUserId?: string };
  error?: string;
};

export default function PostTweetForm() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id?: string; url?: string } | null>(null);
  const [charCount, setCharCount] = useState(0);
  const [username, setUsername] = useState<string | null>(null);

  const MAX_CHARS = 280;

  useEffect(() => {
    setCharCount(text.length);
  }, [text]);

  // Try to fetch current username for building tweet link
  useEffect(() => {
    let mounted = true;
    async function loadMe() {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!res.ok) return;
        const json: MeResponse = await res.json();
        if (!mounted) return;
        if (json.ok && json.user?.username) setUsername(json.user.username);
      } catch (e) {
        // ignore - optional
      }
    }
    loadMe();
    return () => { mounted = false; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmed = text.trim();
    if (!trimmed) {
      setError("Please enter text to tweet.");
      return;
    }
    if (trimmed.length > MAX_CHARS) {
      setError(`Tweet is too long (max ${MAX_CHARS} characters).`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/tweet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok || !body || !body.ok) {
        const msg = body?.error || body?.body || `Tweet failed (status ${res.status})`;
        setError(msg);
        setLoading(false);
        return;
      }

      // success
      const tweetData = body.tweet;
      // typical response has tweet.data.id
      const id = tweetData?.data?.id || tweetData?.id;
      const url = id && username ? `https://twitter.com/${username}/status/${id}` : undefined;

      setSuccess({ id, url });
      setText("");
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="m w-full bg-white  p-6 ">
      <h2 className="text-lg font-semibold mb-2">Post a Tweet</h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          className="w-full rounded-md border px-3 py-2 min-h-[100px] resize-vertical focus:outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="What's happening?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000} // backend enforces logical limits
          aria-label="Tweet text"
          disabled={loading}
        />

        <div className="flex items-center justify-between text-sm text-gray-600">
          <div>
            <span className={charCount > MAX_CHARS ? "text-red-600 font-medium" : ""}>
              {charCount}
            </span>
            <span className="ml-1">/ {MAX_CHARS}</span>
          </div>

          <div className="flex items-center gap-2">
            {error && <div className="text-sm text-red-600">{error}</div>}
            {success && (
              <div className="text-sm text-green-600 wrap-break-words">
                Posted{success.url ? (
                  <a className="underline ml-2" href={success.url} target="_blank" rel="noreferrer">
                    View on X
                  </a>
                ) : (
                  <span className="ml-2"> (id: {success.id})</span>
                )}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || text.trim().length === 0 || charCount > MAX_CHARS}
              className={`ml-2 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition ${
                loading ? "bg-gray-200 text-gray-600 cursor-wait" : "bg-black text-white hover:opacity-95"
              }`}
            >
              {loading ? "Posting…" : "Tweet"}
            </button>
          </div>
        </div>
      </form>

      <div className="mt-3 text-xs text-gray-500">
        Posting as {username ? <span className="font-medium">@{username}</span> : "your connected account"}.
      </div>
    </div>
  );
}
