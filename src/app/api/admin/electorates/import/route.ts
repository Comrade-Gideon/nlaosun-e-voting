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
  let passwords: string[];
  try { passwords = parseElectorateCsv(text).credentials.map(({ password }) => password); }
  catch (error) { return NextResponse.json({ message: (error as Error).message }, { status: 400 }); }
  let imported = 0;
  let stage = "database upsert";
  try {
    const result = await importElectorateCsv(text, async details => {
      stage = "database upsert";
      await withDatabaseRetry(() => db.voter.upsert({
        where: { username: details.username }, update: details, create: details,
      }));
      imported++;
      stage = "database upsert";
    });
    return NextResponse.json(result);
  } catch (error) {
    const dbError = error as {
      name?: string;
      code?: string;
      message?: string;
    };
    let safeMessage = dbError?.message
      ?.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[redacted database URL]")
      ?.replace(/(password|pass|secret|token|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
      ?.slice(0, 300);
    for (const password of passwords) {
      if (password) safeMessage = safeMessage?.replaceAll(password, "[redacted password]");
    }

    console.error("[Electorate Import Failed]", {
      name: dbError?.name,
      code: dbError?.code,
      message: safeMessage,
      stage,
      imported,
    });

    return NextResponse.json({
      code: "ELECTORATE_IMPORT_FAILED",
      stage,
      error: {
        name: dbError?.name ?? "Error",
        code: dbError?.code,
        message: safeMessage ?? "No error message was provided.",
      },
      message: `The electorate database is temporarily unavailable${imported ? ` (${imported} voters were saved before the error)` : ""}. Please try the upload again.`,
    }, { status: 503 });
  }
}
