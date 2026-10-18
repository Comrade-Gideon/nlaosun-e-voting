import { expect, it } from "vitest";
import { hashVoterPassword, verifyVoterPassword } from "./voter-credentials";
import { parseElectorateCsv } from "./electorate-csv";

it("salts passwords and preserves case and surrounding spaces", async () => {
  const password = " SecretPassword! ";
  const first = await hashVoterPassword(password);
  expect(await hashVoterPassword(password)).not.toBe(first);
  expect(await verifyVoterPassword(password, first)).toBe(true);
  expect(await verifyVoterPassword(password.trim(), first)).toBe(false);
  expect(await verifyVoterPassword(password.toLowerCase(), first)).toBe(false);
  expect(await verifyVoterPassword(password, null)).toBe(false);
  expect(await verifyVoterPassword(password, "invalid")).toBe(false);
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
