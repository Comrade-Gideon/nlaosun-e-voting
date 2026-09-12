"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LockKeyhole, Save, ShieldCheck, Upload } from "lucide-react";
import { safeUploadKey, uploadViaPresignedUrl } from "@/lib/upload-client";

type Draft = {
  institution: string;
  phone: string;
  recommendation: string;
  signatureData: string | null;
  signatureName: string | null;
};
type Invite = {
  uploadId: string;
  name: string;
  email: string;
  candidateName: string;
  candidateEmail: string;
  position: string;
  closesAt: string;
  recommendationRange: { min: number; max: number };
  draft: Draft;
};

const blank: Draft = {
  institution: "",
  phone: "",
  recommendation: "",
  signatureData: null,
  signatureName: null,
};

async function responseBody(response: Response) {
  const text = await response.text();
  if (!text) return { message: response.ok ? "" : "The server did not respond. Please try again." };
  try {
    return JSON.parse(text);
  } catch {
    return { message: "The server returned an invalid response. Please try again." };
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="nomination-page">
      <header>
        <div className="nomination-logo">
          <Image src="/nla-osun-logo.png" width={64} height={64} alt="Nigerian Library Association logo" priority />
          <span>
            <b>NLA Osun State Chapter</b>
            <small>Guarantor Form</small>
          </span>
        </div>
        <div>
          <span><LockKeyhole />Private link</span>
          <span><CheckCircle2 />Official electoral process</span>
        </div>
      </header>
      {children}
    </div>
  );
}

export function GuarantorPortal({ token }: { token: string }) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [data, setData] = useState<Draft>(blank);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<{ title: string; message: string } | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch(`/api/guarantor/${token}`);
      const body = await responseBody(response);
      if (cancelled) return;
      if (!response.ok) {
        setInvalid({
          title: body.code === "SUBMITTED" ? "Already completed" : "Link unavailable",
          message: body.message,
        });
        return;
      }
      setInvite(body as Invite);
      setData({ ...blank, ...(body as Invite).draft });
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Autosave so a guarantor writing a long recommendation cannot lose it.
  useEffect(() => {
    if (!invite || done) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      fetch(`/api/guarantor/${token}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }).catch(() => {});
    }, 1500);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [data, invite, done, token]);

  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    setData((current) => ({ ...current, [key]: value }));
    setError("");
    setNotice("");
  }

  async function attachSignature(file?: File) {
    if (!file || !invite) return;
    setBusy(true);
    setError("");
    try {
      const types = ["application/pdf", "image/png", "image/jpeg"];
      if (!types.includes(file.type)) throw new Error("Upload a PDF, JPG or PNG file.");
      if (file.size > 4_000_000) throw new Error("File must be 4MB or smaller.");

      const stored = await uploadViaPresignedUrl({
        endpoint: `/api/guarantor/${token}/upload`,
        key: `nominations/${invite.uploadId}/signature/${safeUploadKey(file.name, "signature")}`,
        field: "signature",
        file,
      });
      setData((current) => ({ ...current, signatureData: stored.key, signatureName: file.name }));
      setNotice("Signature uploaded securely.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The signature could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!invite) return;
    const length = data.recommendation.trim().length;
    const { min, max } = invite.recommendationRange;
    if (!data.institution.trim() || !data.phone.trim() || !data.signatureData || length < min || length > max) {
      setError(`Complete every field. The letter of recommendation must contain ${min}–${max} characters (currently ${length}).`);
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch(`/api/guarantor/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await responseBody(response);
    if (response.ok) setDone(body.candidateName ?? invite.candidateName);
    else setError(body.message);
    setBusy(false);
  }

  if (invalid)
    return (
      <Shell>
        <section className="nomination-invalid">
          <LockKeyhole />
          <h1>{invalid.title}</h1>
          <p>{invalid.message}</p>
          <Link className="button" href="/">Go to home page</Link>
        </section>
      </Shell>
    );

  if (done)
    return (
      <Shell>
        <section className="nomination-invalid">
          <CheckCircle2 />
          <h1>Thank you</h1>
          <p>Your guarantor section for <strong>{done}</strong> has been submitted to the Election Committee.</p>
          <Link className="button" href="/">Go to home page</Link>
        </section>
      </Shell>
    );

  if (!invite)
    return (
      <Shell>
        <section className="nomination-invalid">
          <span className="loading-dot" />
          <h1>Loading guarantor form…</h1>
        </section>
      </Shell>
    );

  const length = data.recommendation.trim().length;
  const { min, max } = invite.recommendationRange;

  const pct = Math.min(100, Math.round((length / min) * 100));
  const countState = length === 0 ? "" : length < min ? "short" : length > max ? "short" : "ok";

  return (
    <Shell>
      <main className="guarantor-card">
        <div className="nomination-title">
          <small>GUARANTOR SECTION</small>
          <h1>Recommend {invite.candidateName}</h1>
          <p>
            Complete the fields below. This link is private to you — the candidate
            cannot see or fill in this section.
          </p>
        </div>

        <div className="guarantor-context">
          <b>{invite.candidateName}</b>
          <span>{invite.candidateEmail}</span>
          <span>Contesting: {invite.position}</span>
        </div>

        <section className="nomination-section">
          <div className="nomination-two guarantor-readonly">
            <label>
              Your Name
              <input value={invite.name} readOnly />
            </label>
            <label>
              Your Email
              <input value={invite.email} readOnly />
            </label>
          </div>

          <label>
            Institution *
            <input
              value={data.institution}
              onChange={(event) => field("institution", event.target.value)}
              placeholder="e.g. Obafemi Awolowo University Library"
              maxLength={200}
            />
          </label>

          <label>
            Phone Number *
            <input
              value={data.phone}
              onChange={(event) => field("phone", event.target.value)}
              placeholder="+234 800 000 0000"
              maxLength={30}
            />
          </label>

          <label>
            Letter of Recommendation *
            <textarea
              value={data.recommendation}
              onChange={(event) => field("recommendation", event.target.value)}
              placeholder={`Why do you recommend ${invite.candidateName} for this office?`}
              maxLength={max}
            />
            <span className="guarantor-meter" aria-hidden="true">
              <i style={{ width: `${pct}%` }} />
            </span>
            <span className={`guarantor-count ${countState}`}>
              <span>{length} characters</span>
              <span>{length < min ? `${min - length} more needed` : `up to ${max}`}</span>
            </span>
          </label>

          <label className="upload-box">
            <Upload />
            {data.signatureName
              ? `Signature attached: ${data.signatureName} — choose another to replace it`
              : "Upload your signature — sign a blank sheet, then photograph or scan it"}
            <small>PDF, JPG or PNG · max 4MB</small>
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              onChange={(event) => attachSignature(event.target.files?.[0])}
            />
          </label>

          {error && <p className="error">{error}</p>}
          {notice && <p className="nomination-notice">{notice}</p>}
        </section>

        <div className="guarantor-actions">
          <small><Save />Your progress saves automatically</small>
          <button className="button" onClick={submit} disabled={busy}>
            <ShieldCheck />
            {busy ? "Submitting…" : "Submit Guarantor Form"}
          </button>
        </div>
      </main>
    </Shell>
  );
}
