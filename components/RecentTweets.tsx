"use client";
import React, { useEffect, useState } from "react";

type Tweet = {
  id?: string;
  text?: string;
  created_at?: string;
  public_metrics?: { like_count?: number; retweet_count?: number; reply_count?: number };
};

export default function RecentTweets() {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recenttweets",);
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error || `Failed (${res.status})`);
        return;
      }
      const j = await res.json();
      const t = j.tweets?.data ?? [];
      setTweets(t);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium">Recent Tweets</h4>
        <button
          onClick={load}
          className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading tweets…</div>
      ) : error ? (
        <div className="text-sm text-red-600">Error: {error}</div>
      ) : tweets.length === 0 ? (
        <div className="text-sm text-gray-500">No tweets found</div>
      ) : (
        <ul className="space-y-3">
          {tweets.map((t: any) => (
            <li key={t.id} className="p-3 bg-white rounded-lg border">
              <div className="text-sm text-gray-800">{t.text}</div>
              <div className="text-xs text-gray-500 mt-2">
                {t.created_at ? new Date(t.created_at).toLocaleString() : ""}
                {t.public_metrics && (
                  <span className="ml-3">❤ {t.public_metrics.like_count ?? 0} • 🔁 {t.public_metrics.retweet_count ?? 0}</span>
                )}
                <a
                  className="ml-3 text-blue-600 underline"
                  href={`https://twitter.com/i/web/status/${t.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
