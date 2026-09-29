"use client";

import { Check, Edit3, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Electorate = {
  id: string;
  displayName: string;
  phoneNumber: string;
  eligible: boolean;
};

type Form = {
  displayName: string;
  phoneNumber: string;
  surname: string;
  eligible: boolean;
};

const empty: Form = {
  displayName: "",
  phoneNumber: "",
  surname: "",
  eligible: true,
};

async function body(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: "Invalid server response." };
  }
}

export function AdminElectorateList({ voters }: { voters: Electorate[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Electorate | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function field<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startEdit(voter: Electorate) {
    setEditing(voter);
    setAdding(false);
    setError("");
    setForm({
      displayName: voter.displayName,
      phoneNumber: voter.phoneNumber,
      surname: "",
      eligible: voter.eligible,
    });
  }

  function close() {
    setAdding(false);
    setEditing(null);
    setForm(empty);
    setError("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/electorates", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editing
        ? { ...form, id: editing.id, surname: form.surname || undefined }
        : form),
    });
    const result = await body(response);
    setBusy(false);
    if (!response.ok) return setError(result.message);
    close();
    router.refresh();
  }

  async function remove(voter: Electorate) {
    if (!confirm(`Remove ${voter.displayName} from the active electorate list? A submitted ballot will be preserved.`)) return;
    const response = await fetch(`/api/admin/electorates?id=${encodeURIComponent(voter.id)}`, { method: "DELETE" });
    const result = await body(response);
    if (!response.ok) return alert(result.message);
    if (result.disabled) alert(result.message);
    router.refresh();
  }

  return <section className="admin-card electorate-manager">
    <header>
      <div><h2>Electorate List</h2><p>Add, correct, enable, disable, or remove registered voters.</p></div>
      <button className="button add-electorate-button" onClick={() => { setAdding(true); setEditing(null); setForm(empty); }}><Plus />Add Electorate</button>
    </header>
    {(adding || editing) && <form className="electorate-form" onSubmit={save}>
      <div className="form-grid">
        <label>Full Name<input value={form.displayName} onChange={(event) => field("displayName", event.target.value)} required /></label>
        <label>Phone Number<input type="tel" inputMode="tel" autoComplete="off" placeholder="e.g. 0803 123 4567" value={form.phoneNumber} onChange={(event) => field("phoneNumber", event.target.value)} required /></label>
        <label>Surname {editing && <small>(leave blank to keep current)</small>}<input value={form.surname} onChange={(event) => field("surname", event.target.value)} required={!editing} /></label>
        <label className="eligible-check"><input type="checkbox" checked={form.eligible} onChange={(event) => field("eligible", event.target.checked)} />Eligible to vote</label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="electorate-form-actions">
        <button type="button" onClick={close}><X />Cancel</button>
        <button className="button" disabled={busy}><Check />{busy ? "Saving…" : editing ? "Save Corrections" : "Add Electorate"}</button>
      </div>
    </form>}
    <div className="electorate-table">
      <div className="electorate-table-head"><span>Name</span><span>Phone Number</span><span>Status</span><span>Actions</span></div>
      {voters.map((voter) => <div className="electorate-table-row" key={voter.id}>
        <b>{voter.displayName}</b><span>{voter.phoneNumber}</span>
        <small className={voter.eligible ? "eligible" : "disabled"}>{voter.eligible ? "Eligible" : "Disabled"}</small>
        <div><button onClick={() => startEdit(voter)}><Edit3 />Edit</button><button className="delete-action" onClick={() => remove(voter)}><Trash2 />Remove</button></div>
      </div>)}
    </div>
  </section>;
}
