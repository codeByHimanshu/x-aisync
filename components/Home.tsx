"use client";

export default function HomePage() {
  return (
    <>
      {/* RAW CSS injected safely */}
      <style>
        {`
          .bg-midnight-mist {
            background-image:
              radial-gradient(circle at 50% 100%, rgba(70, 85, 110, 0.5) 0%, transparent 60%),
              radial-gradient(circle at 50% 100%, rgba(99, 102, 241, 0.4) 0%, transparent 70%),
              radial-gradient(circle at 50% 100%, rgba(181, 184, 208, 0.3) 0%, transparent 80%);
          }
        `}
      </style>

      <div className="min-h-screen w-full bg-black relative text-white flex flex-col items-center justify-center px-6 py-20">
        {/* Midnight Mist Background */}
        <div className="absolute inset-0 z-0 bg-midnight-mist" />

        {/* Hero Section */}
        <div className="relative z-10 max-w-4xl text-center space-y-6">
          <h1 className="text-6xl font-extrabold tracking-tight leading-[1.1]">x-aisync</h1>
          <p className="text-xl md:text-2xl font-medium text-gray-300 leading-relaxed">
            The development platform that synchronizes your AI, automation,
            and product workflows — all in one place.
          </p>

          <a
            href="/auth/login"
            className="inline-block mt-6 px-10 py-4 bg-white text-black font-semibold text-lg rounded-2xl shadow-lg hover:bg-gray-200 transition"
          >
            Get Started
          </a>
        </div>

        {/* Features */}
        <div className="relative z-10 mt-24 grid grid-cols-1 md:grid-cols-3 gap-10 max-w-5xl w-full">
          <div className="p-6 bg-zinc-900 rounded-2xl border border-zinc-700">
            <h2 className="text-2xl font-bold mb-2">AI Workflows</h2>
            <p className="text-gray-400">Design and execute powerful AI-driven tasks effortlessly.</p>
          </div>

          <div className="p-6 bg-zinc-900 rounded-2xl border border-zinc-700">
            <h2 className="text-2xl font-bold mb-2">Sync Everything</h2>
            <p className="text-gray-400">Keep your projects, prompts, and data aligned automatically.</p>
          </div>

          <div className="p-6 bg-zinc-900 rounded-2xl border border-zinc-700">
            <h2 className="text-2xl font-bold mb-2">Developer-First</h2>
            <p className="text-gray-400">Optimized for speed, clarity, and modern app development needs.</p>
          </div>
        </div>
      </div>
    </>
  );
}
