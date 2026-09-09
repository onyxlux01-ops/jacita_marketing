import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getKey() {
  const raw = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SOCIAL_TOKEN_ENCRYPTION_KEY is required to store social tokens securely"
    );
  }
  // Accept 64-char hex, base64 of 32 bytes, or 32-byte utf8
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  try {
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) return b64;
  } catch {
    // fall through
  }
  const buf = Buffer.from(raw, "utf8");
  if (buf.length !== 32) {
    throw new Error(
      "SOCIAL_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64, hex, or utf8)"
    );
  }
  return buf;
}

export function encryptSecret(plaintext: string) {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptSecret(input: {
  ciphertext: string;
  iv: string;
  authTag: string;
}) {
  const key = getKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(input.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function hasTokenEncryptionKey() {
  return Boolean(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY);
}
