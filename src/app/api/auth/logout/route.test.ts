import { beforeEach, expect, it, vi } from "vitest";
import { hashToken, VOTING_COOKIE } from "@/lib/security";

const mocks = vi.hoisted(() => ({ get: vi.fn(), delete: vi.fn(), updateMany: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.get, delete: mocks.delete }) }));
vi.mock("@/lib/db", () => ({ db: { votingSession: { updateMany: mocks.updateMany } } }));
import { POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SESSION_SECRET", "s".repeat(32));
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

it("expires only the caller's voting session and clears the voting cookie", async () => {
  mocks.get.mockReturnValue({ value: "session-token" });
  expect((await POST()).status).toBe(200);
  expect(mocks.updateMany).toHaveBeenCalledWith({ where: { tokenHash: hashToken("session-token") }, data: { expiresAt: new Date(0) } });
  expect(mocks.delete).toHaveBeenCalledWith(VOTING_COOKIE);
});

it("succeeds after voting has already removed the cookie", async () => {
  mocks.get.mockReturnValue(undefined);
  const response = await POST();
  expect(await response.json()).toEqual({ ok: true });
  expect(mocks.updateMany).not.toHaveBeenCalled();
  expect(mocks.delete).toHaveBeenCalledWith(VOTING_COOKIE);
});

it("returns a retryable error if session invalidation fails", async () => {
  mocks.get.mockReturnValue({ value: "session-token" });
  mocks.updateMany.mockRejectedValue(new Error("Database unavailable"));
  expect((await POST()).status).toBe(503);
  expect(mocks.delete).not.toHaveBeenCalled();
});
