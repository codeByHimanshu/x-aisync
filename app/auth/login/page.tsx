"use client";

import React, { useState } from "react";

export default function XLoginPage() {
  const [loading, setLoading] = useState(false);

  function startAuth() {
    try {
      setLoading(true);
      // Redirect to the start route which begins the PKCE OAuth flow
      window.location.href = "/api/auth/x/start";
    } catch (err) {
      console.error("Failed to start auth:", err);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-semibold text-gray-800 mb-4">Sign in</h1>
        <p className="text-sm text-gray-500 mb-6">
          Continue with your X (Twitter) account to connect and sync your profile.
        </p>

        <button
          onClick={startAuth}
          disabled={loading}
          className={`w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-300 
            ${loading ? "bg-gray-200 text-gray-600 cursor-wait" : "bg-black text-white hover:opacity-95"}`}
          aria-label="Sign in with X"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5"
            aria-hidden
          >
            <path d="M22.46 6c-.77.35-1.6.58-2.46.69.89-.53 1.57-1.36 1.89-2.35-.83.5-1.75.86-2.73 1.06A4.15 4.15 0 0015.5 4c-2.3 0-4.16 1.86-4.16 4.16 0 .33.04.65.11.96C7.69 9.02 4.1 7.13 1.67 4.15c-.36.62-.57 1.36-.57 2.14 0 1.48.75 2.78 1.9 3.54-.7-.02-1.36-.21-1.94-.53v.05c0 2.07 1.47 3.8 3.42 4.2-.36.1-.74.16-1.13.16-.28 0-.55-.03-.81-.08.55 1.72 2.16 2.97 4.06 3.01A8.52 8.52 0 010 19.54a12.01 12.01 0 006.5 1.9c7.79 0 12.06-6.45 12.06-12.05 0-.18-.01-.36-.02-.54A8.6 8.6 0 0022.46 6z" />
          </svg>

          <span>{loading ? "Redirecting…" : "Sign in with X"}</span>
        </button>

        <div className="mt-6 text-center text-sm text-gray-500">
          By continuing you agree to our <a className="underline" href="/terms">Terms</a> and <a className="underline" href="/privacy">Privacy Policy</a>.
        </div>
      </div>
    </main>
  );
}
