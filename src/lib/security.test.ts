import { afterEach, describe, expect, it, vi } from "vitest";
import { hashGuarantorToken, hashToken, issueGuarantorToken, normalizePhone, normalizeSurname } from "./security";

describe("identity normalization", () => {
  it("normalizes Nigerian phone numbers written any common way to one form", () => {
    for (const value of ["08031234567", "0803 123 4567", "+234 803-123-4567", "2348031234567", "8031234567", "(0803) 123.4567"])
      expect(normalizePhone(value)).toBe("+2348031234567");
  });
  it("keeps other countries' international numbers and rejects non-numbers", () => {
    expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
    expect(normalizePhone("NALISS/2023/001")).toBe("");
    expect(normalizePhone("12345")).toBe("");
  });
  it("normalizes surname casing and whitespace", () => {
    expect(normalizeSurname("  Oko  NKWỌ ")).toBe("oko nkwọ");
  });
});


afterEach(() => vi.unstubAllEnvs());

describe("guarantor invitation tokens", () => {
  it("validates new tokens across instances with different session secrets", () => {
    const token = issueGuarantorToken();
    expect(token).toMatch(/^g1_[A-Za-z0-9_-]{43}$/);
    vi.stubEnv("SESSION_SECRET", "a".repeat(32));
    const stored = hashGuarantorToken(token);
    vi.stubEnv("SESSION_SECRET", "b".repeat(32));
    expect(hashGuarantorToken(token)).toBe(stored);
    expect(hashGuarantorToken(issueGuarantorToken())).not.toBe(stored);
  });

  it("preserves validation of existing tokens with the original secret", () => {
    vi.stubEnv("SESSION_SECRET", "a".repeat(32));
    expect(hashGuarantorToken("existing-token")).toBe(hashToken("existing-token"));
  });
});
