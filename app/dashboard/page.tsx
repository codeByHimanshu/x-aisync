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

type User = {
  id?: string;
  xUserId?: string;
  username?: string;
  name?: string;
  email?: string;
  createdAt?: string;
  lastActive?: string;
  recent?: RecentItem[];
  postingPreferences?: any;
};

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [refreshScheduledTrigger, setRefreshScheduledTrigger] = useState<number>(0);
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<"compose" | "schedule" | "scheduled" | "recent">("compose");

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
          if (mounted) window.location.href = "/api/auth/x/start";
        }
      } catch (e) {
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

 
  function onScheduledCreated() {
    setRefreshScheduledTrigger((s) => s + 1);
  
    setActiveView("scheduled");
  }
  function renderActivePanel() {
    switch (activeView) {
      case "compose":
        return <PostTweetForm />;
      case "schedule":
        return <SchedulerForm onCreated={onScheduledCreated} />;
      case "scheduled":
        return <SchedulerManager key={refreshScheduledTrigger} />;
      case "recent":
        return <RecentTweets />;
      default:
        return <PostTweetForm />;
    }
  }

  return (
    <div className="min-h-screen bg-gradient from-indigo-50 via-white to-pink-50">
 
      <header className="flex items-center justify-between p-4 bg-blue-500 text-black shadow-md">
        <div className="flex items-center gap-4">
          <button
            className="md:hidden p-2 rounded-md bg-white/30 hover:bg-white/40"
            aria-label="Toggle navigation"
            onClick={() => setMobileNavOpen((s) => !s)}
          >
        
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div>
            <h1 className="text-2xl font-extrabold">Dashboard</h1>
            <p className="text-sm text-gray-100 mt-0">Welcome back{user.name ? `, ${user.name}` : ""}.</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <nav className="flex gap-2">
            <button
              onClick={() => setActiveView("compose")}
              className={`px-3 py-2 rounded-md text-sm font-medium ${activeView === "compose" ? "bg-white text-indigo-700" : "text-white/90 hover:bg-white/10"}`}
            >
              Compose
            </button>
            <button
              onClick={() => setActiveView("schedule")}
              className={`px-3 py-2 rounded-md text-sm font-medium ${activeView === "schedule" ? "bg-white text-indigo-700" : "text-white/90 hover:bg-white/10"}`}
            >
              Schedule Tweet
            </button>
            <button
              onClick={() => setActiveView("scheduled")}
              className={`px-3 py-2 rounded-md text-sm font-medium ${activeView === "scheduled" ? "bg-white text-indigo-700" : "text-white/90 hover:bg-white/10"}`}
            >
              Check Schedule
            </button>
            <button
              onClick={() => setActiveView("recent")}
              className={`px-3 py-2 rounded-md text-sm font-medium ${activeView === "recent" ? "bg-white text-indigo-700" : "text-white/90 hover:bg-white/10"}`}
            >
              Recent
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-semibold text-indigo-700 cursor-pointer"
            onClick={() => setMenuOpen((s) => !s)}
           
                aria-expanded={menuOpen}
            >
              {avatarLetter}
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium">@{user.username}</div>
              <div className="text-xs text-gray-100">{user.email ?? "No email"}</div>
            </div>

            <div className="relative">
            

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl border shadow-2xl z-30 overflow-hidden text-left">
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
          </div>
        </div>
      </header>

   
      {mobileNavOpen && (
        <div className="md:hidden bg-white/95 border-b shadow-sm">
          <div className="p-3 flex flex-col gap-2">
            <button onClick={() => { setActiveView("compose"); setMobileNavOpen(false); }} className={`text-left px-3 py-2 rounded ${activeView === "compose" ? "bg-indigo-50 font-semibold" : "hover:bg-gray-100"}`}>
              Compose
            </button>
            <button onClick={() => { setActiveView("schedule"); setMobileNavOpen(false); }} className={`text-left px-3 py-2 rounded ${activeView === "schedule" ? "bg-indigo-50 font-semibold" : "hover:bg-gray-100"}`}>
              Schedule Tweet
            </button>
            <button onClick={() => { setActiveView("scheduled"); setMobileNavOpen(false); }} className={`text-left px-3 py-2 rounded ${activeView === "scheduled" ? "bg-indigo-50 font-semibold" : "hover:bg-gray-100"}`}>
              Check Schedule
            </button>
            <button onClick={() => { setActiveView("recent"); setMobileNavOpen(false); }} className={`text-left px-3 py-2 rounded ${activeView === "recent" ? "bg-indigo-50 font-semibold" : "hover:bg-gray-100"}`}>
              Recent
            </button>
          </div>
        </div>
      )}

      <main className="p-6 mx-auto lg:max-w-[80%] ">
        <div >

 
          <section className="lg:col-span-3 space-y-6 h-full">
     
              

          
              <div>{renderActivePanel()}</div>
            
          </section>
        </div>
      </main>
    </div>
  );
}
