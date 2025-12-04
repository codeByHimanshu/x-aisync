"use client";

import Image from "next/image";
import { useState } from "react";

export default function HomePage() {
  const [navOpen, setNavOpen] = useState(false);

  const features = [
    { title: "AI Content Drafts", desc: "Generate drafts and captions tailored to your brand voice for faster publishing." },
    { title: "Sync & Grow", desc: "Connect teams and analytics to create feedback loops that accelerate growth." },
    { title: "x-AI Automation", desc: "Automate repetitive workflows with conditional AI pipelines that run reliably." },
    { title: "Publish For You", desc: "Securely publish and localize posts across channels without manual copying." },
    { title: "Weekly Scheduling", desc: "Plan content days or weeks ahead with templates and timezone-aware scheduling." },
    { title: "Daily Scheduling", desc: "Plan content days or weeks ahead with templates and timezone-aware scheduling." },
  ];

  return (
    <div className="min-h-screen w-full bg-black text-white relative overflow-hidden font-inter">
      <style>{` 
        .bg-midnight-mist {
          background-image:
            radial-gradient(circle at 50% 100%, rgba(70,85,110,0.5) 0%, transparent 60%),
            radial-gradient(circle at 50% 100%, rgba(99,102,241,0.35) 0%, transparent 70%),
            radial-gradient(circle at 50% 100%, rgba(181,184,208,0.25) 0%, transparent 80%);
          background-repeat: no-repeat;
          background-size: cover;
        }

        @keyframes floatOrb {
          0% { transform: translateY(0) translateX(0) scale(1); }
          25% { transform: translateY(-14px) translateX(6px) scale(1.02); }
          50% { transform: translateY(0) translateX(12px) scale(1); }
          75% { transform: translateY(14px) translateX(6px) scale(0.98); }
          100% { transform: translateY(0) translateX(0) scale(1); }
        }

        @keyframes floatSlow {
          0% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0); }
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animate-orb { animation: floatOrb 10s ease-in-out infinite; }
        .animate-orb-slow { animation: floatSlow 8s ease-in-out infinite; }
        .animate-fade-up { animation: fadeInUp 0.6s ease forwards; }

        /* small helpers */
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="absolute inset-0 z-0 bg-midnight-mist" />

      <div aria-hidden className="pointer-events-none absolute z-10 rounded-full left-[6%] top-[6%] blur-[42px] opacity-10 bg-[rgba(255,45,85,0.95)] shadow-[0_0_120px_40px_rgba(255,45,85,0.12),0_0_48px_16px_rgba(255,99,132,0.08)] w-[420px] h-[420px] animate-orb" />

      <header className="relative z-30 backdrop-blur-md bg-black/40 border-b border-white/5">
        <div className="max-w-[1100px] mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/6 flex items-center justify-center font-bold text-black transition-transform transform hover:scale-105">XA</div>
            <span className="font-semibold">X-aisync</span>
          </div>

          <nav className="hidden md:flex items-center gap-4">
            <a href="#features" className="text-slate-300 hover:text-white text-sm">Features</a>
            <a href="#pricing" className="text-slate-300 hover:text-white text-sm">Pricing</a>
            <a href="/auth/login" className="ml-2 inline-block bg-red-500 text-white px-4 py-2 rounded-lg font-semibold text-sm">Get Started</a>
          </nav>

          <div className="md:hidden">
            <button aria-label="Toggle menu" aria-expanded={navOpen} onClick={() => setNavOpen((s) => !s)} className="p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-red-300">
              <span className={`block w-7 h-0.5 bg-white transition-transform ${navOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
              <span className={`block w-7 h-0.5 bg-white my-1 transition-opacity ${navOpen ? 'opacity-0' : 'opacity-100'}`} />
              <span className={`block w-7 h-0.5 bg-white transition-transform ${navOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
            </button>
          </div>
        </div>

        <div className={`md:hidden bg-black/40 border-t border-white/5 ${navOpen ? 'block' : 'hidden'}`}>
          <div className="px-5 py-4 space-y-2">
            <a href="#features" onClick={() => setNavOpen(false)} className="block text-slate-100">Features</a>
            <a href="#pricing" onClick={() => setNavOpen(false)} className="block text-slate-100">Pricing</a>
            <a href="/auth/login" onClick={() => setNavOpen(false)} className="block mt-2 bg-red-500 text-white px-4 py-2 rounded-lg text-center">Get Started</a>
          </div>
        </div>
      </header>

      <main className="relative z-20 w-full mx-auto px-5 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-10 items-center w-[80%] justify-center-safe ml-[10%] mr-[10%]">
          <div>
            <h1 className="text-[3.6rem] leading-[1.02] font-extrabold mb-3 md:text-[4rem] sm:text-3xl animate-fade-up">X-Aisync</h1>
            <p className="text-slate-300 text-lg mb-6 max-w-xl opacity-0 animate-fade-up" style={{ animationDelay: '120ms' }}>Synchronize AI, automation, and product workflows — one platform.</p>
            <a href="/auth/login" className="inline-block bg-red-500 text-white px-6 py-3 rounded-2xl font-bold transition-transform transform hover:-translate-y-1 active:scale-95">Get Started</a>
          </div>

          <div className="flex justify-center">
            <div className="w-[420px] h-[420px] flex items-center justify-center">
              <div className="w-[420px] h-[420px] rounded-sm  hover:scale-[1.02] animate-orb-slow flex items-center justify-center">
                <Image src="/x-ai.png" alt="X-Aisync illustration" width={420} height={420} />
              </div>
            </div>
          </div>
        </div>

        <section id="features" aria-label="Platform features" className="mt-10">
          <div className="relative w-full">
            <div className="md:hidden overflow-x-auto cards-row no-scrollbar flex gap-4 py-2 px-2 snap-x snap-mandatory" role="list" aria-label="Feature cards (swipeable)">
              {features.map((f, idx) => (
                <article key={idx} role="listitem" tabIndex={0} className="feature-card snap-center shrink-0 w-[82%] max-w-[360px] min-w-[260px] h-56 rounded-lg border border-white/6 bg-black/60 text-slate-100 p-5 flex flex-col justify-between focus:shadow-lg transition-transform hover:-translate-y-2">
                  <div>
                    <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                    <p className="text-slate-300 text-sm">{f.desc}</p>
                  </div>
                  <div className="text-xs text-slate-400">Tap to explore</div>
                </article>
              ))}
            </div>

            <div className="hidden md:grid grid-cols-3 gap-6 mt-4">
              {features.map((f, idx) => (
                <article key={idx} tabIndex={0} className="feature-card rounded-lg border border-white/6 bg-black/60 text-slate-100 p-6 transition-transform duration-300 hover:-translate-y-2 focus:translate-y-0">
                  <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                  <p className="text-slate-300 text-sm">{f.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" aria-label="Pricing plans" className="mt-14 max-w-[1100px] mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-extrabold animate-fade-up">Pricing</h2>
            <p className="text-slate-300 mt-2 opacity-0 animate-fade-up" style={{ animationDelay: '80ms' }}>Simple, transparent pricing — upgrade anytime.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-lg border border-white/6 bg-black/60 p-6 text-center transform transition duration-300 hover:scale-[1.02]">
              <div className="text-sm text-slate-400">Free Trial</div>
              <div className="text-3xl font-bold my-3">Free</div>
              <p className="text-slate-300 mb-4">Try all core features for 3 days — no card required.</p>
              <ul className="text-sm text-slate-400 mb-6 space-y-2">
                <li> 3-day trial</li>
                <li> Basic automations</li>
                <li> Community support</li>
              </ul>
              <a href="/auth/signup" className="inline-block w-full bg-white text-black py-2 rounded-lg font-semibold transition-transform hover:-translate-y-1">Start free</a>
            </div>

            <div className="rounded-lg border border-white/6 bg-black/60 p-6 text-center transform transition duration-300 hover:scale-[1.02]">
              <div className="text-sm text-slate-400">Starter</div>
              <div className="text-3xl font-bold my-3">$10<span className="text-sm font-normal">/mo</span></div>
              <p className="text-slate-300 mb-4">For solo builders — essential AI features & scheduling.</p>
              <ul className="text-sm text-slate-400 mb-6 space-y-2">
                <li> Unlimited drafts</li>
                <li> Basic analytics</li>
                <li> Email support</li>
              </ul>
              <a href="/auth/signup?plan=starter" className="inline-block w-full bg-red-500 text-white py-2 rounded-lg font-semibold transition-transform hover:-translate-y-1">Choose $10</a>
            </div>

            <div className="rounded-lg border border-white/6 bg-linear-to-br from-gray-900/40 to-black/30 p-6 text-center ring-1 ring-white/6 transform transition duration-300 hover:scale-[1.02]">
              <div className="text-sm text-slate-400">Pro</div>
              <div className="text-3xl font-bold my-3">$20<span className="text-sm font-normal">/mo</span></div>
              <p className="text-slate-300 mb-4">For teams — advanced automation, analytics & priority support.</p>
              <ul className="text-sm text-slate-400 mb-6 space-y-2">
                <li> Team seats</li>
                <li> Advanced automation</li>
                <li> Priority support</li>
              </ul>
              <a href="/auth/signup?plan=pro" className="inline-block w-full bg-red-500 text-white py-2 rounded-lg font-semibold transition-transform hover:-translate-y-1">Choose $20</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-20 border-t border-white/5 mt-12">
        <div className="max-w-[1100px] mx-auto px-5 py-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/6 flex items-center justify-center font-bold text-black">XA</div>
            <div>
              <div className="font-semibold">X-aisync</div>
              <div className="text-slate-400 text-sm">Built for developers & teams.</div>
            </div>
          </div>

          <div className="text-slate-300 text-sm">© {new Date().getFullYear()} x-aisync — <span className="text-slate-400">Privacy</span> · <span className="text-slate-400">Terms</span></div>
        </div>
      </footer>
    </div>
  );
}
