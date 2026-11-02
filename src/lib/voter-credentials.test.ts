import { expect, it } from "vitest";
import { hashVoterPassword, verifyVoterPassword, verifyVoterPasswordForLogin } from "./voter-credentials";
import { parseElectorateCsv } from "./electorate-csv";

it("salts passwords and preserves case and surrounding spaces", async () => {
  const password = " SecretPassword! ";
  const first = await hashVoterPassword(password);
  expect(await hashVoterPassword(password)).not.toBe(first);
  expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  expect(first).not.toContain(password);
  expect(await verifyVoterPassword(password, first)).toBe(true);
  expect(await verifyVoterPassword(password.trim(), first)).toBe(false);
  expect(await verifyVoterPassword(password.toLowerCase(), first)).toBe(false);
  expect(await verifyVoterPassword(password, null)).toBe(false);
  expect(await verifyVoterPassword(password, "invalid")).toBe(false);
}, 20_000);

it("verifies existing PBKDF2 hashes and returns an Argon2id replacement after successful login", async () => {
  const legacy = "pbkdf2-sha256$600000$00112233445566778899aabbccddeeff$d9c7e1c68e5202547145a04feb16e46059e9900736db08c2d08572c4b1bfc27f";
  expect(await verifyVoterPassword("LegacySyntheticPass", legacy)).toBe(true);
  expect(await verifyVoterPassword("IncorrectSyntheticPass", legacy)).toBe(false);

  const login = await verifyVoterPasswordForLogin("LegacySyntheticPass", legacy);
  expect(login.valid).toBe(true);
  expect(login.replacementHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  expect(await verifyVoterPassword("LegacySyntheticPass", login.replacementHash)).toBe(true);
  expect(await verifyVoterPasswordForLogin("IncorrectSyntheticPass", legacy)).toEqual({ valid: false, replacementHash: undefined });
}, 30_000);

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
