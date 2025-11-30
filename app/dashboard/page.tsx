"use client";
import React, { useEffect, useState } from "react";
import PostTweetForm from "@/components/PostTweetForm";
import RecentTweets from "@/components/RecentTweets";
import SchedulerForm from "@/components/SchedulerForm";
import SchedulerManager from "@/components/SchedulerManager";

type RecentItem = {
  title: string;
  date: string;
};

type Stats = {
  posts?: number;
  followers?: number;
  likes?: number;
  listings?: number;
  orders?: number;
  revenue?: number;
};

type User = {
  id?: string;
  xUserId?: string;
  username?: string;
  name?: string;
  email?: string;
  createdAt?: string;
  lastActive?: string;
  stats?: Stats;
  recent?: RecentItem[];
  postingPreferences?: any;
};

export default function DashboardPage(): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [refreshScheduledTrigger, setRefreshScheduledTrigger] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    async function load(): Promise<void> {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const j = await res.json();
          const u: User = j.user ?? j;
          if (mounted) setUser(u);
        } else {
          // If not authenticated, immediately send the user to auth start
          if (mounted) window.location.href = "/api/auth/x/start";
        }
      } catch (e) {
        // network/error -> send to auth start
        // eslint-disable-next-line no-console
        console.error("Failed to load /api/me", e);
        if (mounted) window.location.href = "/api/auth/x/start";
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleLogout(): Promise<void> {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
    window.location.href = "/api/auth/x/start";
  }

  async function handleDeleteAccount(): Promise<void> {
    const ok = window.confirm(
      "Are you sure you want to permanently delete your account? This cannot be undone."
    );
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/user/delete", { method: "DELETE" });
      if (res.ok) {
        window.location.href = "/";
      } else {
        const txt = await res.text();
        window.alert("Failed to delete account: " + txt);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      window.alert("Error deleting account");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <div className="p-8">Loading…</div>;

  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/api/auth/x/start";
    return <div />;
  }

  const avatarLetter = (user.name ?? user.username ?? "U").charAt(0).toUpperCase();

  const Stat: React.FC<{ label: string; value?: number | string | undefined }> = ({
    label,
    value,
  }) => {
    return (
      <div className="p-4 bg-white/60 backdrop-blur-sm rounded-xl shadow-md">
        <div className="text-2xl font-semibold">{typeof value === "number" ? value : value ?? 0}</div>
        <div className="text-xs text-gray-500 mt-1">{label}</div>
      </div>
    );
  };

  // helper to trigger refresh of scheduler manager (passed to SchedulerForm)
  function onScheduledCreated() {
    setRefreshScheduledTrigger((s) => s + 1);
  }

  return (
    <div className="p-6 min-h-screen mx-auto bg-gradient from-indigo-50 via-white to-pink-50">
      <header className="flex items-center justify-between mb-6 bg-blue-500 text-2xl text-black p-4 rounded-2xl shadow">
        <div className="w-full">
          <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-linear-to-r from-black via-pink-600 to-amber-500">
            Dashboard
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Welcome back{user.name ? `, ${user.name}` : ""}. Quick overview of your account.
          </p>
        </div>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((s) => !s)}
            className="flex items-center gap-3 rounded-full px-3 py-1.5 hover:shadow-lg transition-shadow bg-white border"
            aria-expanded={menuOpen}
            type="button"
          >
            <div className="w-10 h-10 rounded-full bg-linear-to-br from-indigo-200 to-pink-200 flex items-center justify-center font-semibold text-indigo-700">
              {avatarLetter}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-sm font-medium">@{user.username}</div>
              <div className="text-xs text-gray-500">{user.email ?? "No email"}</div>
            </div>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border shadow-2xl z-30 overflow-hidden">
              <a href="/profile" className="block px-4 py-3 text-sm hover:bg-gray-50">
                Profile
              </a>
              <a href="/settings" className="block px-4 py-3 text-sm hover:bg-gray-50">
                Settings
              </a>
              <a href="/help" className="block px-4 py-3 text-sm hover:bg-gray-50">
                Help
              </a>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50"
                type="button"
              >
                Logout
              </button>
              <button
                onClick={handleDeleteAccount}
                className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-gray-50"
                type="button"
              >
                Delete account
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left column: profile + scheduler form + stats */}
        <section className="lg:col-span-1 space-y-4">
          <div className="p-6 rounded-2xl bg-linear-to-br from-white to-indigo-50 border shadow">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-linear-to-br from-indigo-100 to-pink-100 flex items-center justify-center text-3xl font-bold text-indigo-700">
                {avatarLetter}
              </div>
              <div>
                <div className="text-lg font-semibold">{user.name ?? `@${user.username}`}</div>
                <div className="text-xs text-gray-500">X id: {user.xUserId ?? user.id}</div>
                <div className="text-xs text-gray-500">
                  Joined: {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}
                </div>
              </div>
            </div>

            <div className="mt-4 text-sm text-gray-600">
              <strong>Sessions</strong>
              <div className="mt-2 text-xs text-gray-500">
                Active on: {user.lastActive ? new Date(user.lastActive).toLocaleString() : "now"}
              </div>
            </div>
          </div>

          {/* Scheduler form: schedule a new post (AI or manual) */}
          <div className="p-4 rounded-2xl bg-white border shadow">
            <h3 className="text-sm font-medium mb-2">Schedule a Tweet</h3>
            <SchedulerForm onCreated={onScheduledCreated} />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 gap-3 mt-2">
            <Stat label="Posts" value={user.stats?.posts ?? 0} />
            <Stat label="Followers" value={user.stats?.followers ?? 0} />
            <Stat label="Likes" value={user.stats?.likes ?? 0} />
          </div>
        </section>

        {/* Right column: composer, recent tweets, scheduler manager */}
        <section className="lg:col-span-3 mt-0 space-y-6">
          {/* Composer */}
          <div className="p-4 rounded-2xl bg-white border shadow">
            <PostTweetForm />
          </div>

          {/* Recent tweets */}
          <div className="p-4 rounded-2xl bg-white border shadow">
            <h3 className="font-medium text-gray-800">Recent activity</h3>
            <div className="mt-3">
              <RecentTweets />
            </div>
          </div>

          {/* Scheduler Manager (7-day view + list) */}
          <div className="p-4 rounded-2xl bg-white border shadow">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-800">Scheduled Posts</h3>
              <button
                onClick={() => setRefreshScheduledTrigger((n) => n + 1)}
                className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
              >
                Refresh
              </button>
            </div>

            {/* Pass a prop that changes when new scheduled posts are created to trigger child refresh if needed */}
            <SchedulerManager key={refreshScheduledTrigger} />
          </div>
        </section>
      </main>
    </div>
  );
}
