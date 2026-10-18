import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { importElectorateCsv } from "../src/lib/electorate-csv";

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: npm run db:import-voters -- private/user_credentials.csv");
  const text = await readFile(path, "utf8");
  const db = new PrismaClient();
  try {
    const result = await importElectorateCsv(text, details => db.voter.upsert({
      where: { username: details.username }, update: details, create: details,
    }));
    console.log(`Imported ${result.imported} voters. Skipped ${result.errors.length} rows.`);
    for (const error of result.errors) console.log(error);
    if (result.errors.length) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}

main().catch(() => {
  console.error("Voter import failed. Check the CSV format, database connection, and applied migrations.");
  process.exitCode = 1;
});
