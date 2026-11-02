import { expect, it } from "vitest";
import { hashVoterPassword, verifyVoterPassword } from "./voter-credentials";
import { parseElectorateCsv } from "./electorate-csv";

it("salts passwords and preserves case and surrounding spaces", async () => {
  const password = " SecretPassword! ";
  const first = await hashVoterPassword(password);
  expect(await hashVoterPassword(password)).not.toBe(first);
  expect(first).toMatch(/^pbkdf2-sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  expect(first).not.toContain(password);
  expect(await verifyVoterPassword(password, first)).toBe(true);
  expect(await verifyVoterPassword(password.trim(), first)).toBe(false);
  expect(await verifyVoterPassword(password.toLowerCase(), first)).toBe(false);
  expect(await verifyVoterPassword(password, null)).toBe(false);
  expect(await verifyVoterPassword(password, "invalid")).toBe(false);
}, 20_000);

it("rejects hashes in the old 600,000-iteration and WASM Argon2 formats", async () => {
  const legacyPbkdf2 = "pbkdf2-sha256$600000$00112233445566778899aabbccddeeff$d9c7e1c68e5202547145a04feb16e46059e9900736db08c2d08572c4b1bfc27f";
  const unsupportedArgon2 = "$argon2id$v=19$m=19456,t=2,p=1$MDEyMzQ1Njc4OWFiY2RlZg$MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY";
  expect(await verifyVoterPassword("LegacySyntheticPass", legacyPbkdf2)).toBe(false);
  expect(await verifyVoterPassword("AnyPassword", unsupportedArgon2)).toBe(false);
}, 20_000);

it("handles BOM, quoted names, escaped quotes and exact password whitespace", () => {
  const parsed = parseElectorateCsv('\uFEFFusername,password,fullname\r\nVoter1," pass,""word"" ","Full, Name"\r\n');
  expect(parsed.errors).toEqual([]);
  expect(parsed.credentials).toEqual([{ username: "voter1", password: ' pass,"word" ', displayName: "Full, Name" }]);
});

it("skips duplicate usernames and invalid rows without disclosing passwords", () => {
  const result = parseElectorateCsv("username,password,fullname\nvoter,secret,Full Name\nVOTER,another,Other Name\nmissing,,Name\n");
  expect(result.credentials).toHaveLength(1);
  expect(result.errors).toHaveLength(2);
  expect(result.errors.join()).not.toContain("secret");
});
