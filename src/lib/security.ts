import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const VOTING_COOKIE = "naliss_voting_session";
export const SESSION_TTL_MS = 15 * 60 * 1000;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return value;
}

/**
 * One canonical form per phone number, so the electorate list and what a voter
 * types always match: "0803 123 4567", "+234 803-123-4567", "2348031234567" and
 * "8031234567" all become "+2348031234567". Numbers already in international
 * form (leading +) keep their country code. Returns "" when it is not a number.
 */
export function normalizePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15 || /[a-z]/i.test(trimmed)) return "";
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("234") && digits.length === 13) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+234${digits.slice(1)}`;
  if (/^[789]\d{9}$/.test(digits)) return `+234${digits}`;
  return `+${digits}`;
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
