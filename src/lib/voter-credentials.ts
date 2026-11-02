import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { argon2id, createSHA256, pbkdf2 } from "hash-wasm";

export const usernameSchema = z.string().trim().min(1).max(100).regex(/^\S+$/, "Username cannot contain spaces").transform(value => value.toLowerCase());
export const passwordSchema = z.string().min(1).max(256);
const ARGON2_MEMORY_KIB = 19_456;
const ARGON2_ITERATIONS = 2;
const ARGON2_PARALLELISM = 1;
const ARGON2_PREFIX = `$argon2id$v=19$m=${ARGON2_MEMORY_KIB},t=${ARGON2_ITERATIONS},p=${ARGON2_PARALLELISM}$`;
const LEGACY_PBKDF2_ITERATIONS = 600_000;
const LEGACY_PBKDF2_PATTERN = /^pbkdf2-sha256\$600000\$([a-f0-9]{32})\$([a-f0-9]{64})$/;
const ARGON2ID_PATTERN = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

async function deriveArgon2id(password: string, salt: Uint8Array) {
  return argon2id({
    password,
    salt,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY_KIB,
    parallelism: ARGON2_PARALLELISM,
    hashLength: 32,
    outputType: "binary",
  });
}

export async function hashVoterPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await deriveArgon2id(password, salt);
  const saltText = salt.toString("base64").replace(/=+$/, "");
  const hashText = Buffer.from(derived).toString("base64").replace(/=+$/, "");
  return `${ARGON2_PREFIX}${saltText}$${hashText}`;
}

function equalDerivedKey(actual: Uint8Array, expected: Uint8Array) {
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

async function verifyArgon2id(password: string, stored: string) {
  const match = ARGON2ID_PATTERN.exec(stored);
  if (!match) return false;
  const salt = Buffer.from(match[1], "base64");
  const expected = Buffer.from(match[2], "base64");
  if (salt.length !== 16 || expected.length !== 32) return false;
  return equalDerivedKey(await deriveArgon2id(password, salt), expected);
}

async function verifyLegacyPbkdf2(password: string, stored: string) {
  const match = LEGACY_PBKDF2_PATTERN.exec(stored);
  if (!match) return false;
  const actual = await pbkdf2({
    password,
    salt: Buffer.from(match[1], "hex"),
    iterations: LEGACY_PBKDF2_ITERATIONS,
    hashLength: 32,
    hashFunction: createSHA256(),
    outputType: "binary",
  });
  return equalDerivedKey(actual, Buffer.from(match[2], "hex"));
}

export async function verifyVoterPassword(password: string, stored: string | null | undefined) {
  if (typeof stored !== "string") {
    // Keep a password-dependent KDF cost for unknown usernames.
    await deriveArgon2id(password, new Uint8Array(16));
    return false;
  }
  if (stored.startsWith("$argon2id$")) return verifyArgon2id(password, stored);
  return verifyLegacyPbkdf2(password, stored);
}

export async function verifyVoterPasswordForLogin(password: string, stored: string | null | undefined) {
  const valid = await verifyVoterPassword(password, stored);
  const isLegacyHash = typeof stored === "string" && LEGACY_PBKDF2_PATTERN.test(stored);
  return {
    valid,
    replacementHash: valid && isLegacyHash ? await hashVoterPassword(password) : undefined,
  };
}
