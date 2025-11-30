// models/DailyPostCount.ts
import mongoose, { Schema, model, models } from "mongoose";

const DailyPostCountSchema = new Schema(
  {
    xUserId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true }, // ISO date yyyy-mm-dd (UTC or user's timezone depending on usage)
    count: { type: Number, default: 0 },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

export const DailyPostCount = models.DailyPostCount || model("DailyPostCount", DailyPostCountSchema);
