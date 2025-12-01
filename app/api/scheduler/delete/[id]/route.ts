// app/api/scheduler/delete/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/jwt";
import { connectDB } from "@/lib/mongodb";
import { ScheduledPost } from "@/models/ScheduledPost";
import { Types } from "mongoose";

async function getSessionPayload(req: NextRequest) {
  // Use req.cookies (stable on NextRequest in route handlers)
  const sess = req.cookies?.get("sess")?.value;
  if (!sess) return null;
  try {
    return await verifyJwt(decodeURIComponent(sess));
  } catch {
    return null;
  }
}

export async function DELETE(req: NextRequest, context: any) {
  try {
    // Resolve JWT session from the incoming request
    const payload: any = await getSessionPayload(req);
    if (!payload || typeof payload.sub !== "string") {
      return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
    }
    const xUserId = payload.sub;

    // IMPORTANT: await params inside the handler (do not destructure in params)
    const resolvedParams: { id?: string } = await context.params;
    const id = resolvedParams?.id;
    if (!id) {
      return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
    }

    await connectDB();

    // Convert to ObjectId if valid (prevents "not found" when _id is ObjectId)
    const _id = Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id;

    const doc = await ScheduledPost.findOne({ _id, xUserId });
    if (!doc) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    await ScheduledPost.deleteOne({ _id });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/scheduler/delete/[id] error:", err);
    return NextResponse.json(
      { ok: false, error: "server_error", detail: String(err) },
      { status: 500 }
    );
  }
}
