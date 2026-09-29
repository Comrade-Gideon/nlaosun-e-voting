import { afterEach, describe, expect, it, vi } from "vitest";
import { hashGuarantorToken, hashToken, issueGuarantorToken, normalizeMatric, normalizeSurname } from "./security";

describe("identity normalization", () => {
  it("normalizes matriculation numbers without changing punctuation", () => {
    expect(normalizeMatric(" naliss/2023/001 ")).toBe("NALISS/2023/001");
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
