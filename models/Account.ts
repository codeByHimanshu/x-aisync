import mongoose, { Schema, model, models } from "mongoose";

const UserSchema = new Schema(
  {
    xUserId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true },
  },
  { timestamps: true }
);

export const User = models.User || model("User", UserSchema);


const AccountSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    xUserId: { type: String, required: true, unique: true, index: true },
    username: { type: String },
    oauth: {
      accessTokenEnc: { type: String },
      refreshTokenEnc: { type: String },
      expiresAt: { type: Date },
    },
  },
  { timestamps: true }
);

export const Account = models.Account || model("Account", AccountSchema);
