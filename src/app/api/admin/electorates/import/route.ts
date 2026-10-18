import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { db, withDatabaseRetry } from "@/lib/db";
import { importElectorateCsv, parseElectorateCsv } from "@/lib/electorate-csv";

export async function POST(request: Request) {
  if (!await isAdminAuthenticated()) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) return NextResponse.json({ message: "Choose a CSV file." }, { status: 400 });
  if (file.size > 5_000_000) return NextResponse.json({ message: "CSV must be 5MB or smaller." }, { status: 413 });
  const text = await file.text();
  try { parseElectorateCsv(text); }
  catch (error) { return NextResponse.json({ message: (error as Error).message }, { status: 400 }); }
  let imported = 0;
  try {
    const result = await importElectorateCsv(text, async details => {
      await withDatabaseRetry(() => db.voter.upsert({
        where: { username: details.username }, update: details, create: details,
      }));
      imported++;
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ message: `The electorate database is temporarily unavailable${imported ? ` (${imported} voters were saved before the error)` : ""}. Please try the upload again.` }, { status: 503 });
  }
}
