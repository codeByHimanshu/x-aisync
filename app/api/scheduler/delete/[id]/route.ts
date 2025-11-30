// app/api/scheduler/delete/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/jwt";
import { connectDB } from "@/lib/mongodb";
import { ScheduledPost } from "@/models/ScheduledPost";

async function getSessionPayload(req: NextRequest) {
  const sess = req.cookies.get("sess")?.value;
  if (!sess) return null;
  try { return await verifyJwt(decodeURIComponent(sess)); } catch { return null; }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string }}) {
  try {
    const payload: any = await getSessionPayload(req);
    if (!payload || typeof payload.sub !== "string") return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
    const xUserId = payload.sub;
    const id = params.id;
    await connectDB();
    const doc = await ScheduledPost.findOne({ _id: id, xUserId });
    if (!doc) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    await ScheduledPost.deleteOne({ _id: id });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/scheduler/delete", err);
    return NextResponse.json({ ok: false, error: "server_error", detail: String(err) }, { status: 500 });
  }
}
