// lib/crypto.ts
// Edge-safe token encryption using Web Crypto API (crypto.subtle).
// Works in Next Edge runtime and Node v18+ (global `crypto.subtle` available).

const IV_BYTE_LENGTH = 12; // AES-GCM recommended IV length

function base64Encode(bytes: Uint8Array): string {
  // Use btoa/atob in browser/edge, Buffer in Node
  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  } else {
    // Node environment
    return Buffer.from(bytes).toString("base64");
  }
}

function base64Decode(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } else {
    // Node environment
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
}

async function deriveKeyFromSecret(secret: string): Promise<CryptoKey> {
  // Convert secret string to bytes
  const enc = new TextEncoder().encode(secret);
  // Hash to 32 bytes (SHA-256)
  const hash = await crypto.subtle.digest("SHA-256", enc);
  // Import raw key for AES-GCM
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/**
 * Encrypt a UTF-8 string and return base64(iv || ciphertext).
 * @param plain plaintext string
 * @returns base64 string
 */
export async function encryptToken(plain: string): Promise<string> {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error("ENCRYPTION_KEY is not set");

  const key = await deriveKeyFromSecret(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
  const data = new TextEncoder().encode(plain);

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    data
  );

  const cipherBytes = new Uint8Array(cipherBuffer);
  const out = new Uint8Array(iv.length + cipherBytes.length);
  out.set(iv, 0);
  out.set(cipherBytes, iv.length);

  return base64Encode(out);
}

/**
 * Decrypt a value produced by encryptToken (base64(iv || ciphertext)) and return UTF-8 string.
 * @param encryptedB64 base64 string produced by encryptToken
 * @returns decrypted plaintext
 */
export async function decryptToken(encryptedB64: string): Promise<string> {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error("ENCRYPTION_KEY is not set");

  const raw = base64Decode(encryptedB64);
  if (raw.length <= IV_BYTE_LENGTH) throw new Error("Invalid encrypted data");

  const iv = raw.slice(0, IV_BYTE_LENGTH);
  const cipher = raw.slice(IV_BYTE_LENGTH);

  const key = await deriveKeyFromSecret(secret);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    cipher
  );

  return new TextDecoder().decode(plainBuffer);
}
