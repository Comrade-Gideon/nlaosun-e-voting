import { z } from "zod";
import { hashVoterPassword, passwordSchema, usernameSchema } from "./voter-credentials";

// Parse complete CSV records, including quoted commas, escaped quotes and newlines.
function records(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  const text = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      row.push(value);
      if (row.some(cell => cell.trim())) rows.push(row);
      row = []; value = "";
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else value += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(value);
  if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

const rowSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(150),
});
type Credential = z.infer<typeof rowSchema> & { eligible?: boolean };
export type VoterImportData = { username: string; passwordHash: string; displayName: string; eligible?: boolean };

export function parseElectorateCsv(text: string) {
  const rows = records(text);
  if (rows.length < 2) throw new Error("CSV has no voter rows.");
  const headers = rows[0].map(cell => cell.trim().toLowerCase().replace(/[^a-z]/g, ""));
  const indexes = ["username", "password", "fullname"].map(name => headers.indexOf(name));
  if (indexes.some(index => index < 0)) throw new Error("CSV requires username, password and fullname columns. Eligible is optional.");
  const eligibleIndex = headers.indexOf("eligible");
  const credentials: Credential[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const parsed = rowSchema.safeParse({ username: row[indexes[0]], password: row[indexes[1]], displayName: row[indexes[2]] });
    if (!parsed.success) {
      errors.push(`Row ${i + 1}: invalid or missing ${parsed.error.issues.map(issue => issue.path[0] === "displayName" ? "fullname" : String(issue.path[0])).join(", ")}`);
      continue;
    }
    if (seen.has(parsed.data.username)) { errors.push(`Row ${i + 1}: duplicate username in this CSV`); continue; }
    const eligible = row[eligibleIndex]?.trim().toLowerCase();
    if (eligible && !["true", "yes", "1", "y", "false", "no", "0", "n"].includes(eligible)) {
      errors.push(`Row ${i + 1}: Eligible must be true or false`); continue;
    }
    seen.add(parsed.data.username);
    credentials.push({ ...parsed.data, ...(eligible ? { eligible: ["true", "yes", "1", "y"].includes(eligible) } : {}) });
  }
  return { credentials, errors };
}

export async function importElectorateCsv(text: string, save: (data: VoterImportData) => Promise<unknown>) {
  const { credentials, errors } = parseElectorateCsv(text);
  let imported = 0;
  for (const { password, ...details } of credentials) {
    await save({ ...details, passwordHash: await hashVoterPassword(password) });
    imported++;
  }
  return { imported, errors: errors.slice(0, 20) };
}
