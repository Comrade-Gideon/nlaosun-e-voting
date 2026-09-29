import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ update: vi.fn(), lookup: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { guarantor: { update: mocks.update } },
  withDatabaseRetry: (operation: () => Promise<unknown>) => operation(),
  isTransientDatabaseError: () => false,
}));
vi.mock("@/lib/guarantors", () => ({
  guarantorByToken: mocks.lookup, RECOMMENDATION_MIN: 500, RECOMMENDATION_MAX: 1500,
}));
import { POST } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue({ id: "guarantor", submittedAt: null,
    nomination: { expiresAt: new Date(Date.now() + 86400000), candidateName: "Candidate" } });
  mocks.update.mockResolvedValue({});
});
it("accepts a complete recommendation without a signature", async () => {
  const response = await POST(new Request("https://example.com/api/guarantor/token", {
    method: "POST", body: JSON.stringify({ institution: "Library", phone: "08012345678", recommendation: "A".repeat(500) }),
  }), { params: Promise.resolve({ token: "token" }) });
  expect(response.status).toBe(201);
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: "guarantor" }, data: {
    institution: "Library", phone: "08012345678", recommendation: "A".repeat(500), submittedAt: expect.any(Date),
  } });
});
it("still rejects an incomplete recommendation", async () => {
  const response = await POST(new Request("https://example.com/api/guarantor/token", {
    method: "POST", body: JSON.stringify({ institution: "Library", phone: "08012345678", recommendation: "Short" }),
  }), { params: Promise.resolve({ token: "token" }) });
  expect(response.status).toBe(400);
  expect(mocks.update).not.toHaveBeenCalled();
});
