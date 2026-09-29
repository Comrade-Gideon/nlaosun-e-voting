import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), count: vi.fn(), publishPhoto: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated: async () => true }));
vi.mock("@/lib/db", () => ({ db: {
  nominationInvite: { findUnique: mocks.findUnique },
  guarantor: { count: mocks.count },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/blob-storage", () => ({ publishCandidatePhoto: mocks.publishPhoto }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { PATCH } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findUnique.mockResolvedValue({ id: "nomination", status: "SUBMITTED", passportData: "private-photo" });
});
const approve = () => PATCH(new Request("https://example.com/api/admin/nominations?id=nomination", {
  method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "APPROVE" }),
}));

it.each([0, 1])("blocks publication with %i completed guarantors", async (completed) => {
  mocks.count.mockResolvedValue(completed);
  const response = await approve();
  expect(response.status).toBe(409);
  expect((await response.json()).message).toContain("Both guarantors");
  expect(mocks.count).toHaveBeenCalledWith({ where: { nominationId: "nomination", submittedAt: { not: null } } });
  expect(mocks.publishPhoto).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("rechecks completion inside the publishing transaction", async () => {
  mocks.count.mockResolvedValue(2);
  mocks.publishPhoto.mockResolvedValue("https://example.com/photo.png");
  const create = vi.fn();
  mocks.transaction.mockImplementation(async (operation) => operation({
    nominationInvite: { findUnique: mocks.findUnique },
    guarantor: { count: async () => 1 },
    candidate: { create },
  }));
  expect((await approve()).status).toBe(409);
  expect(create).not.toHaveBeenCalled();
});
