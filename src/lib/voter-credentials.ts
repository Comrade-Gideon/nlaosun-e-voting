import { z } from "zod";

export const usernameSchema = z.string().trim().min(1).max(100).regex(/^\S+$/, "Username cannot contain spaces").transform(value => value.toLowerCase());
export const passwordSchema = z.string().min(1).max(256);

export function verifyVoterPassword(submitted: string, stored: string | null | undefined) {
  return typeof stored === "string" && submitted === stored;
}
