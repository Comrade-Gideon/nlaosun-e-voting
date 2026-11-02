import { z } from "zod";

export const usernameSchema = z.string().trim().min(1).max(100).regex(/^\S+$/, "Username cannot contain spaces").transform(value => value.toLowerCase());
export const passwordSchema = z.string().min(1).max(256);

// Cloudflare Workers rejects PBKDF2 operations above 100,000 iterations.
// Use its native Web Crypto implementation at the supported maximum; this also
// avoids hash-wasm's dynamic WebAssembly compilation, which Workers blocks.
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const HASH_PREFIX = `pbkdf2-sha256$${PBKDF2_ITERATIONS}$`;
const HASH_PATTERN = /^pbkdf2-sha256\$100000\$([a-f0-9]{32})\$([a-f0-9]{64})$/;

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string) {
  if (!/^(?:[a-f0-9]{2})+$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function derive(password: string, salt: Uint8Array) {
  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations: PBKDF2_ITERATIONS },
    key,
    HASH_BYTES * 8,
  ));
}

function constantTimeEqual(actual: Uint8Array, expected: Uint8Array) {
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
  return difference === 0;
}

export async function hashVoterPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derive(password, salt);
  return `${HASH_PREFIX}${toHex(salt)}$${toHex(derived)}`;
}

export async function verifyVoterPassword(password: string, stored: string | null | undefined) {
  const match = typeof stored === "string" ? HASH_PATTERN.exec(stored) : null;
  if (!match) {
    // Keep the same KDF cost for unknown users and unsupported hash formats.
    await derive(password, new Uint8Array(SALT_BYTES));
    return false;
  }
  const salt = fromHex(match[1]);
  const expected = fromHex(match[2]);
  if (!salt || !expected || salt.length !== SALT_BYTES || expected.length !== HASH_BYTES) return false;
  return constantTimeEqual(await derive(password, salt), expected);
}
