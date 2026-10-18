import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const usernameSchema = z.string().trim().min(1).max(100).regex(/^\S+$/, "Username cannot contain spaces").transform(value => value.toLowerCase());
export const passwordSchema = z.string().min(1).max(256);
const iterations = 600_000;

async function derive(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return Buffer.from(await crypto.subtle.deriveBits({
    name: "PBKDF2", hash: "SHA-256", iterations, salt: Buffer.from(salt, "hex"),
  }, key, 256));
}

export async function hashVoterPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `pbkdf2-sha256$${iterations}$${salt}$${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyVoterPassword(password: string, stored: string | null | undefined) {
  // Perform the same expensive derivation for unknown usernames as for valid ones.
  const match = /^pbkdf2-sha256\$600000\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(stored ?? "");
  const actual = await derive(password, match?.[1] ?? "0".repeat(32));
  return timingSafeEqual(actual, Buffer.from(match?.[2] ?? "0".repeat(64), "hex")) && Boolean(match);
}
