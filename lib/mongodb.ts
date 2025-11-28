// lib/mongoose.ts
import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI!;
if (!MONGO_URI) throw new Error("MONGO_URI is missing");

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;

  try {
    const db = await mongoose.connect(MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME || "xaisync",
    });

    isConnected = db.connections[0].readyState === 1;
    console.log("📌 MongoDB Connected (Mongoose)");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    throw err;
  }
}
