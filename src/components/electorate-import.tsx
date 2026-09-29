"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// The exact layout the importer expects, so nobody has to rebuild it by hand.
const TEMPLATE = "Phone Number,Full Name,Surname,Eligible\r\n08031234567,Adebayo Tunde,Adebayo,true\r\n";
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;

type Result = { tone: "notice" | "error"; text: string; details: string[] };

export function ElectorateImport() {
  const router = useRouter();
  const [file, setFile] = useState<File>();
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) { setResult({ tone: "error", text: "Choose a CSV file first.", details: [] }); return; }
    setBusy(true);
    setResult(null);
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch("/api/admin/electorates/import", { method: "POST", body: form });
      const text = await response.text();
      let body: { imported?: number; errors?: string[]; message?: string } = {};
      try { body = JSON.parse(text); } catch { body = { message: "The server returned an invalid response." }; }
      if (!response.ok) {
        setResult({ tone: "error", text: body.message ?? "The electorate list could not be imported.", details: [] });
        return;
      }
      const imported = body.imported ?? 0;
      const skipped = body.errors ?? [];
      // Skipped rows used to be reported only as a count inside a neutral notice,
      // so an upload that imported nobody looked like a success. Show why.
      setResult({
        tone: imported === 0 || skipped.length ? "error" : "notice",
        text: imported === 0
          ? `No voters were imported.${skipped.length ? " Every row was skipped:" : " The file has no voter rows."}`
          : `Imported ${imported} voter${imported === 1 ? "" : "s"}.${skipped.length ? ` ${skipped.length} row${skipped.length === 1 ? " was" : "s were"} skipped:` : ""}`,
        details: skipped,
      });
      if (imported) router.refresh();
    } catch {
      setResult({ tone: "error", text: "The electorate service is temporarily unavailable. Please try again.", details: [] });
    } finally {
      setBusy(false);
    }
  }

  return <section className="admin-card">
    <h2>Upload Electorate List</h2>
    <p>Required columns: Phone Number, Full Name, Surname. Optional: Eligible. Any other columns are ignored. Numbers may be written as 0803…, +234 803… or 234803….</p>
    <a className="template-download" href={TEMPLATE_HREF} download="electorate-template.csv">Download CSV template</a>
    <label className="upload-box">{file?.name ?? "Drag and drop is supported by your browser, or click to browse"}<input type="file" accept=".csv,text/csv" onChange={e => { setFile(e.target.files?.[0]); setResult(null); }} /></label>
    <button className="button wide" onClick={upload} disabled={busy}>{busy ? "Uploading…" : "Upload CSV File"}</button>
    {result && <div className={result.tone} role={result.tone === "error" ? "alert" : "status"}>
      <p>{result.text}</p>
      {result.details.length > 0 && <ul>{result.details.map(detail => <li key={detail}>{detail}</li>)}</ul>}
    </div>}
  </section>;
}
