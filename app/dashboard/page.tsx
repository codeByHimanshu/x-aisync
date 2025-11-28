// app/dashboard/page.tsx
"use client";
import React, { useEffect, useState } from "react";

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/me");
      if (res.ok) {
        const j = await res.json();
        setUser(j.user);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="p-8">Loading…</div>;
  if (!user) {
    return (
      <div className="p-8">
        <h2 className="text-2xl font-semibold">Not signed in</h2>
        <a href="/api/auth/x/start" className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded">Sign in with X</a>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="mt-6 p-4 border rounded">
        <p><strong>Username:</strong> @{user.username}</p>
        <p><strong>X user id:</strong> {user.xUserId}</p>
        <p><strong>Account created:</strong> {new Date(user.createdAt).toLocaleString()}</p>
      </div>

      <div className="mt-6">
        <a href="/profile" className="px-4 py-2 border rounded">Edit profile</a>
      </div>
    </div>
  );
}
