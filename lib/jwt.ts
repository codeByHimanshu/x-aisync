// lib/jwt.ts
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const encoder = new TextEncoder();

function getSecretKey() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET not set");
  return encoder.encode(s);
}

/**
 * Sign a payload and return compact JWT.
 * payload should be a plain object (no Date).
 */
export async function signJwt(payload: Record<string, any>, expiresIn = "7d") {
  const alg = "HS256";
  const key = getSecretKey();
  const jw = new SignJWT(payload).setProtectedHeader({ alg });

  // set expiration: accepts seconds or string like "7d"
  // jose SignJWT only accepts numeric exp (seconds since epoch) via setExpirationTime
  jw.setExpirationTime(expiresIn);
  return await jw.sign(key);
}

/**
 * Verify a JWT and return its payload (as object)
 */
export async function verifyJwt(token: string): Promise<JWTPayload> {
  const key = getSecretKey();
  const { payload } = await jwtVerify(token, key);
  return payload;
}
