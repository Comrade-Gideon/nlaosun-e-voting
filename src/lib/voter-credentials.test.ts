import { expect, it } from "vitest";
import { verifyVoterPassword } from "./voter-credentials";
import { parseElectorateCsv } from "./electorate-csv";

it("compares voter passwords exactly without trimming or case changes", () => {
  expect(verifyVoterPassword(" SecretPassword! ", " SecretPassword! ")).toBe(true);
  expect(verifyVoterPassword("SecretPassword!", " SecretPassword! ")).toBe(false);
  expect(verifyVoterPassword("secretpassword!", " SecretPassword! ")).toBe(false);
  expect(verifyVoterPassword("anything", null)).toBe(false);
});

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
