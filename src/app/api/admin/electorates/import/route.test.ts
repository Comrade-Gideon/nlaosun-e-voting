import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated: async () => true }));
vi.mock("@/lib/db", () => ({
  db: { voter: { upsert: mocks.upsert } },
  withDatabaseRetry: <T>(operation: () => Promise<T>) => operation(),
}));
import { POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SESSION_SECRET", "s".repeat(32));
  mocks.upsert.mockResolvedValue({});
});

function upload(csv: string) {
  const form = new FormData();
  form.set("file", new File([csv], "voters.csv", { type: "text/csv" }));
  return POST(new Request("https://example.com/api/admin/electorates/import", { method: "POST", body: form }));
}

it("imports the friendly layout and normalizes phone numbers", async () => {
  const response = await upload("Phone Number,Full Name,Surname\n0803 123 4567,Adebayo Tunde,Adebayo\n");
  expect(await response.json()).toEqual({ imported: 1, errors: [] });
  expect(mocks.upsert.mock.calls[0][0].where).toEqual({ phoneNumber: "+2348031234567" });
});

it("accepts database column names and eligible, and ignores other columns", async () => {
  const response = await upload("matriculationNumber,surname,displayName,eligible,department\n07062349871,Bello,Bello Maryam,false,LIS\n");
  expect(await response.json()).toEqual({ imported: 1, errors: [] });
  expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({ phoneNumber: "+2347062349871", displayName: "Bello Maryam", eligible: false });
  expect(mocks.upsert.mock.calls[0][0].create).not.toHaveProperty("department");
});

it("rejects surname hashes this system did not produce", async () => {
  const response = await upload("matriculationNumber,surnameNormalizedHash,displayName\n08031234567,3f2a8d9c4b71e6f0a8c5d2139e7b4a61,Adebayo Tunde\n");
  const body = await response.json();
  expect(body.imported).toBe(0);
  expect(body.errors[0]).toMatch(/surname/);
  expect(mocks.upsert).not.toHaveBeenCalled();
});
