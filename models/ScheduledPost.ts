
import mongoose, { Schema, model, models } from "mongoose";

const ScheduledPostSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // local User._id
    xUserId: { type: String, required: true, index: true }, // external X id
    text: { type: String }, // final tweet text (optional if generated on send)
    aiPrompt: { type: String }, // user provided prompt for AI generation
    generateWithAI: { type: Boolean, default: false },
    scheduledAt: { type: Date, required: true }, // absolute time (UTC)
    timezone: { type: String, default: "UTC" }, // optional tz string for display
    repeat: { type: String, enum: ["none", "daily"], default: "none" }, // simple recurrence
    status: { type: String, enum: ["pending", "queued", "posting", "posted", "failed", "cancelled"], default: "pending" },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: Number(process.env.SCHEDULER_MAX_RETRIES || 3) },
    lastError: { type: String },
    postedAt: { type: Date },
    response: { type: Schema.Types.Mixed }, // store provider response
    meta: { type: Schema.Types.Mixed }, // free-form meta (e.g., postingPreferences snapshot)
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

export const ScheduledPost = models.ScheduledPost || model("ScheduledPost", ScheduledPostSchema);
