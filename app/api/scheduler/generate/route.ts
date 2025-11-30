// app/api/scheduler/generate/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(()=>({}));
    const prompt = body.prompt || "Write a short tweet about developer productivity";

    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ ok: false, error: "openai_key_missing" }, { status: 500 });

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: "You are a helpful assistant that writes short tweets."}, { role: "user", content: prompt }],
        max_tokens: 120,
        temperature: 0.8,
      }),
    });

    const text = await resp.text();
    if (!resp.ok) return NextResponse.json({ ok: false, error: "openai_error", body: text }, { status: 500 });
    const j = JSON.parse(text);
    const out = j.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ ok: true, text: out.trim() });
  } catch (err: any) {
    console.error("AI generate error", err);
    return NextResponse.json({ ok: false, error: "server_error", detail: String(err) }, { status: 500 });
  }
}
