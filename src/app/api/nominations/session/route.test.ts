import { expect, it, vi } from "vitest";

vi.mock("@/lib/nominations", () => ({
  currentNomination: vi.fn(async () => null),
  isEditable: vi.fn(() => false),
}));
import { POST } from "./route";

const nomination = {
  institution: "State Library", phone: "08012345678", currentPosition: "Librarian",
  permanentAddress: "12 Library Road, Osogbo", pka: "Librarian", tagline: "Libraries for all",
  biography: "A".repeat(50), manifesto: "A".repeat(400), mission: "A".repeat(400), vision: "A".repeat(400),
  priorities: ["Access", "Training", "Service"],
  guarantors: [{ name: "First Guarantor", email: "first@example.com" }, { name: "Second Guarantor", email: "second@example.com" }],
  passportData: "a".repeat(20), passportName: "photo.png",
  signatureData: "b".repeat(20), signatureName: "signature.png", declarationsAccepted: true,
};
const submit = (body: object) => POST(new Request("https://example.com/api/nominations/session", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}));

it.each([{}, { studentIdData: null, studentIdName: null, identificationData: null, identificationName: null }])(
  "accepts submission fields without membership or identification uploads: %j", async (files) => {
    const response = await submit({ ...nomination, ...files });
    // Reaching the session check proves field validation accepted the submission.
    expect(response.status).toBe(410);
    expect((await response.json()).message).toContain("no longer open");
  },
);

it("still requires a signature", async () => {
  const response = await submit({ ...nomination, signatureData: null });
  expect(response.status).toBe(400);
  expect((await response.json()).issues.signatureData).toBeDefined();
});
