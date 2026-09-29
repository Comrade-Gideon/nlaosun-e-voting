import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { db, withDatabaseRetry } from "@/lib/db";
import { hashSurname, normalizePhone } from "@/lib/security";

function cells(line: string) {
  const result: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"') {
      value += '"';
      index++;
    } else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      result.push(value.trim());
      value = "";
    } else value += character;
  }
  result.push(value.trim());
  return result;
}

export async function POST(request: Request) {
  if (!await isAdminAuthenticated()) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) return NextResponse.json({ message: "Choose a CSV file." }, { status: 400 });
  if (file.size > 5_000_000) return NextResponse.json({ message: "CSV must be 5MB or smaller." }, { status: 413 });

  const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return NextResponse.json({ message: "CSV has no voter rows." }, { status: 400 });
  const headers = cells(lines[0]).map((value) => value.toLowerCase().replace(/[^a-z]/g, ""));
  const index = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  // Friendly headings ("Phone Number") and the database's own column names
  // ("matriculationNumber", which now holds the phone number, "displayName") are
  // both accepted, so a list exported from the database can be uploaded as is.
  const indexes = {
    phone: index("phonenumber", "phoneno", "phone", "mobilenumber", "mobile", "telephone", "gsm", "matriculationnumber", "matricno", "matric"),
    fullName: index("fullname", "displayname", "studentname", "name"),
    surname: index("surname", "lastname"),
    surnameHash: index("surnamenormalizedhash"),
    eligible: index("eligible"),
  };
  if (indexes.phone < 0 || indexes.fullName < 0 || (indexes.surname < 0 && indexes.surnameHash < 0)) {
    return NextResponse.json({ message: "CSV requires Phone Number, Full Name and Surname columns (Eligible is optional)." }, { status: 400 });
  }

  let imported = 0;
  const errors: string[] = [];
  const cell = (data: string[], column: number) => (column < 0 ? "" : data[column]?.trim() ?? "");
  try {
    for (let row = 1; row < lines.length; row++) {
      const data = cells(lines[row]);
      const rawPhone = cell(data, indexes.phone);
      const phoneNumber = normalizePhone(rawPhone);
      const displayName = cell(data, indexes.fullName);
      const surname = cell(data, indexes.surname);
      const storedHash = cell(data, indexes.surnameHash).toLowerCase();
      if (!rawPhone || !displayName) {
        errors.push(`Row ${row + 1}: missing phone number or full name`);
        continue;
      }
      if (!phoneNumber) {
        errors.push(`Row ${row + 1}: "${rawPhone.slice(0, 30)}" is not a valid phone number`);
        continue;
      }
      // A surname hash is only usable if this system made it (HMAC-SHA256 with
      // SESSION_SECRET, 64 hex characters), i.e. a re-upload of our own export.
      // Anything else could never match what the voter types at sign-in.
      const surnameNormalizedHash = surname ? hashSurname(surname) : /^[0-9a-f]{64}$/.test(storedHash) ? storedHash : "";
      if (!surnameNormalizedHash) {
        errors.push(`Row ${row + 1}: add the voter's surname (a Surname column is needed; surname hashes from elsewhere cannot be used)`);
        continue;
      }
      const eligibleText = cell(data, indexes.eligible).toLowerCase();
      const eligible = !["false", "no", "0", "n"].includes(eligibleText);
      const details = {
        surnameNormalizedHash,
        displayName,
        eligible,
      };
      await withDatabaseRetry(() => db.voter.upsert({
        where: { phoneNumber },
        update: details,
        create: { phoneNumber, ...details },
      }));
      imported++;
    }
  } catch (error) {
    // Logged so the terminal shows the real cause; the admin sees the safe message.
    console.error("[electorates/import] failed", { imported, error: error instanceof Error ? `${error.name}: ${error.message.slice(0, 300)}` : String(error) });
    return NextResponse.json({ message: `The electorate database is temporarily unavailable${imported ? ` (${imported} voters were saved before the error)` : ""}. Please try the upload again.` }, { status: 503 });
  }
  return NextResponse.json({ imported, errors: errors.slice(0, 20) });
}
