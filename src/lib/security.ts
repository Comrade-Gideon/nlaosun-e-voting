import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const VOTING_COOKIE = "naliss_voting_session";
export const SESSION_TTL_MS = 15 * 60 * 1000;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return value;
}

export function normalizeMatric(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeSurname(value: string) {
  return value.trim().toLocaleLowerCase("en-NG").replace(/\s+/g, " ");
}

export function secureHash(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function hashSurname(value: string) {
  return secureHash(`surname:${normalizeSurname(value)}`);
}

export function hashesEqual(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function issueToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return secureHash(`session:${token}`);
}

export function receiptCode() {
  return `NAL-${randomBytes(9).toString("hex").toUpperCase()}`;
}


/** Guarantor bearer tokens contain 256 random bits; their digest must be portable
 * between app instances sharing the database, regardless of session secrets. */
export function issueGuarantorToken() {
  return `g1_${issueToken()}`;
}

export function hashGuarantorToken(token: string) {
  return token.startsWith("g1_")
    ? createHash("sha256").update(`guarantor:${token}`).digest("hex")
    : hashToken(token); // Preserve existing invitations signed with this secret.
}
