// app/profile/page.tsx
"use client";
import React, { useEffect, useState } from "react";

export default function ProfilePage() {
  const [username, setUsername] = useState("");
  useEffect(() => {
    fetch("/api/me").then(r => r.json()).then(j => {
      if (j?.user) setUsername(j.user.username || "");
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // TODO: call /api/profile to save profile preferences
    alert("Profile save not wired yet — implement /api/profile");
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-semibold">Profile</h2>
      <form onSubmit={save} className="mt-4 space-y-4">
        <div>
          <label className="block text-sm">X Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} className="mt-1 p-2 border rounded w-full" />
        </div>

        <div>
          <label className="block text-sm">Timezone</label>
          <input placeholder="Asia/Kolkata" className="mt-1 p-2 border rounded w-full" />
        </div>

        <div>
          <button className="px-4 py-2 bg-green-600 text-white rounded">Save</button>
        </div>
      </form>
    </div>
  );
}
