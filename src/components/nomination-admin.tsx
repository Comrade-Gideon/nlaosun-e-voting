"use client";
import Image from "next/image";
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileText,
  Link2,
  Printer,
  RotateCcw,
  Trash2,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
type Position = { id: string; title: string };
type Invitation = {
  id: string;
  candidateName: string;
  matriculationNumber: string;
  position: string;
  status: string;
  expiresAt: string;
  submittedAt: string | null;
  reviewNote: string;
};
type Review = Invitation & {
  phone: string;
  level: string;
  cgpa: string;
  permanentAddress: string;
  pka: string;
  tagline: string;
  biography: string;
  manifesto: string;
  mission: string;
  vision: string;
  priorities: string[];
  passportData: string | null;
  passportName: string | null;
  studentIdData: string | null;
  studentIdName: string | null;
  transcriptData: string | null;
  transcriptName: string | null;
  signatureData: string | null;
  signatureName: string | null;
  declarationsAccepted: boolean;
};
async function body(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: "The server returned an invalid response." };
  }
}
export function NominationAdmin({
  positions,
  invitations,
}: {
  positions: Position[];
  invitations: Invitation[];
}) {
  const router = useRouter();
  const printRef = useRef<HTMLElement>(null);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [note, setNote] = useState("");
  const [validity, setValidity] = useState("14");
  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setLink("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/admin/nominations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await body(response);
    if (response.ok) {
      setLink(result.link);
      event.currentTarget.reset();
      setValidity("14");
      router.refresh();
    } else setError(result.message);
    setBusy(false);
  }
  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  async function revoke(id: string) {
    if (!confirm("Revoke this candidate link?")) return;
    const response = await fetch(
      `/api/admin/nominations?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    const result = await body(response);
    if (!response.ok) return alert(result.message);
    router.refresh();
  }
  async function removeCandidate(item: Invitation) {
    if (!confirm(`Delete ${item.candidateName}? This cannot be undone.`))
      return;
    const response = await fetch(
      `/api/admin/nominations?id=${encodeURIComponent(item.id)}&action=deleteCandidate`,
      { method: "DELETE" },
    );
    const result = await body(response);
    if (!response.ok) return alert(result.message);
    setReview(null);
    router.refresh();
  }
  async function openReview(id: string) {
    setReviewBusy(true);
    setError("");
    const response = await fetch(
      `/api/admin/nominations?id=${encodeURIComponent(id)}`,
    );
    const result = await body(response);
    setReviewBusy(false);
    if (!response.ok) return setError(result.message);
    setReview(result);
    setNote(result.reviewNote || "");
  }
  async function decide(action: "APPROVE" | "REJECT") {
    if (!review) return;
    if (action === "REJECT" && note.trim().length < 5)
      return alert("Enter a clear correction reason for the candidate.");
    if (
      action === "APPROVE" &&
      !confirm("Approve and publish this candidate immediately?")
    )
      return;
    setReviewBusy(true);
    const response = await fetch(
      `/api/admin/nominations?id=${encodeURIComponent(review.id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "REJECT" ? { action, note } : { action },
        ),
      },
    );
    const result = await body(response);
    setReviewBusy(false);
    if (!response.ok) return alert(result.message);
    setReview(null);
    setNote("");
    router.refresh();
  }
  function printCandidate() {
    if (!printRef.current) return;
    const printable = printRef.current.cloneNode(true) as HTMLElement;
    printable
      .querySelectorAll(
        ".admin-print-candidate,.review-documents,.nomination-review-actions,.review-close",
      )
      .forEach((element) => element.remove());
    const popup = window.open("", "_blank", "width=980,height=760");
    if (!popup) return alert("Allow pop-ups to print this candidate form.");
    popup.document.write(
      `<!doctype html><html><head><title>${review?.candidateName || "Candidate"} - Nomination Form</title><style>body{font-family:Raleway,Arial,sans-serif;color:#111;margin:32px}header{display:flex;justify-content:space-between;border-bottom:2px solid #800000;padding-bottom:16px}h2{margin:4px 0}.review-candidate-profile{display:grid;grid-template-columns:180px 1fr;gap:24px;align-items:center;padding:24px 0}.review-candidate-profile img{width:180px;height:180px;object-fit:cover;border-radius:10px}.review-candidate-profile dl{display:grid;grid-template-columns:1fr 1fr;gap:12px}.review-candidate-profile dl div{padding:10px;background:#f7f7f7}.review-candidate-profile dt{font-size:11px;color:#666;text-transform:uppercase}.review-candidate-profile dd{margin:4px 0 0;font-weight:700}.review-text,.review-priorities{border-top:1px solid #ddd;padding:15px 0;break-inside:avoid}.review-text p{white-space:pre-wrap;line-height:1.55}.review-text small{color:#666}.previous-review-note{padding:14px;background:#fff8e7}@media print{body{margin:16mm}.review-text p{font-size:10pt}}</style></head><body>${printable.outerHTML}</body></html>`,
    );
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 300);
  }
  const state = (item: Invitation) =>
    item.status === "DRAFT" && new Date(item.expiresAt) < new Date()
      ? "EXPIRED"
      : item.status;
  return (
    <>
      <div className="nomination-admin-grid">
        <form className="admin-card nomination-link-form" onSubmit={generate}>
          <div className="nomination-card-title">
            <UserPlus />
            <div>
              <h2>Generate Candidate Link</h2>
              <p>
                Name and matriculation number will be locked on the
                candidate&apos;s form.
              </p>
            </div>
          </div>
          <label>
            Candidate Full Name
            <input
              name="candidateName"
              required
              placeholder="e.g. Amaka Chukwu"
            />
          </label>
          <label>
            Matriculation Number
            <input
              name="matriculationNumber"
              required
              placeholder="e.g. NAL/23/1048"
            />
          </label>
          <div className="form-grid">
            <label>
              Position
              <select name="positionId" required defaultValue="">
                <option value="" disabled>
                  Select position
                </option>
                {positions.map((position) => (
                  <option value={position.id} key={position.id}>
                    {position.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Link validity
              <select
                name="validDays"
                value={validity}
                onChange={(event) => setValidity(event.target.value)}
              >
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="CUSTOM">Set date and time</option>
              </select>
            </label>
          </div>
          {validity === "CUSTOM" && (
            <label>
              Link expiry date and time (WAT)
              <input name="customExpiresAt" type="datetime-local" required />
              <small>The candidate will see a live hours-and-minutes countdown on every form step.</small>
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button className="button wide" disabled={busy || !positions.length}>
            <Link2 />
            {busy ? "Generating…" : "Generate Secure Link"}
          </button>
          {link && (
            <div className="generated-link">
              <strong>Copy this link now</strong>
              <p>The raw link cannot be recovered after leaving this page.</p>
              <div>
                <input readOnly value={link} />
                <button type="button" onClick={copy}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </form>
        <section className="admin-card nomination-links">
          <h2>Candidate Links</h2>
          <p>
            Review submissions, request corrections, and publish approved
            candidates.
          </p>
          {invitations.length ? (
            invitations.map((item) => (
              <article key={item.id}>
                <div>
                  <button
                    type="button"
                    className="candidate-name-review"
                    onClick={() => openReview(item.id)}
                    disabled={reviewBusy}
                  >
                    {item.candidateName}
                  </button>
                  <small>
                    {item.matriculationNumber} · {item.position}
                  </small>
                  {item.status === "REJECTED" && item.reviewNote && (
                    <small className="review-note">
                      Correction requested: {item.reviewNote}
                    </small>
                  )}
                </div>
                <span
                  className={`nomination-status ${state(item).toLowerCase()}`}
                >
                  {state(item) === "SUBMITTED" ? "PENDING REVIEW" : state(item)}
                </span>
                {state(item) === "DRAFT" && (
                  <button onClick={() => revoke(item.id)}>
                    <XCircle />
                    Revoke
                  </button>
                )}
                {["SUBMITTED", "APPROVED", "REJECTED"].includes(
                  state(item),
                ) && (
                  <button
                    className="review-link"
                    onClick={() => openReview(item.id)}
                    disabled={reviewBusy}
                  >
                    <Eye />
                    Review
                  </button>
                )}
                {["APPROVED", "REJECTED"].includes(state(item)) && (
                  <button onClick={() => removeCandidate(item)}>
                    <Trash2 />
                    Delete
                  </button>
                )}
              </article>
            ))
          ) : (
            <div className="empty-nominations">
              <RotateCcw />
              <p>No candidate links generated yet.</p>
            </div>
          )}
        </section>
      </div>
      {review && (
        <div
          className="nomination-review-overlay"
          role="dialog"
          aria-modal="true"
        >
          <section className="nomination-review-modal" ref={printRef}>
            <header>
              <div>
                <small>
                  {review.status === "SUBMITTED"
                    ? "PENDING REVIEW"
                    : review.status}
                </small>
                <h2>{review.candidateName}</h2>
                <p>
                  {review.matriculationNumber} · {review.position}
                </p>
              </div>
              <button
                className="review-close"
                onClick={() => setReview(null)}
                aria-label="Close review"
              >
                <X />
              </button>
            </header>
            <button className="admin-print-candidate" onClick={printCandidate}>
              <Printer />
              Print Candidate Form
            </button>
            <div className="review-candidate-profile">
              {review.passportData && (
                <Image
                  unoptimized
                  src={review.passportData}
                  width={180}
                  height={180}
                  alt={`${review.candidateName} passport`}
                />
              )}
              <dl>
                <ReviewItem label="Phone" value={review.phone} />
                <ReviewItem label="Part" value={review.level} />
                <ReviewItem label="CGPA" value={review.cgpa} />
                <ReviewItem label="Permanent Home Address" value={review.permanentAddress} />
                <ReviewItem label="PKA" value={review.pka || "—"} />
                <ReviewItem label="Slogan" value={review.tagline} />
              </dl>
            </div>
            <ReviewText title="Biography" value={review.biography} />
            <ReviewText title="Manifesto" value={review.manifesto} />
            <ReviewText title="Mission" value={review.mission} />
            <ReviewText title="Vision" value={review.vision} />
            <div className="review-priorities">
              <h3>Top Priorities</h3>
              <ol>
                {review.priorities.map((value) => (
                  <li key={value}>{value}</li>
                ))}
              </ol>
            </div>
            <div className="review-documents">
              <h3>Supporting Documents</h3>
              <DocumentLink
                label="Student ID"
                name={review.studentIdName}
                data={review.studentIdData}
              />
              <DocumentLink
                label="Academic Transcript"
                name={review.transcriptName}
                data={review.transcriptData}
              />
              <DocumentLink
                label="Signature"
                name={review.signatureName}
                data={review.signatureData}
              />
            </div>
            {review.reviewNote && (
              <div className="previous-review-note">
                <b>Review note</b>
                <p>{review.reviewNote}</p>
              </div>
            )}
            {review.status === "SUBMITTED" && (
              <footer className="nomination-review-actions">
                <label>
                  Reason for rejection / correction request
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Explain exactly what the candidate must correct…"
                  />
                </label>
                <div>
                  <button
                    className="reject-candidate"
                    onClick={() => decide("REJECT")}
                    disabled={reviewBusy}
                  >
                    <XCircle />
                    Reject & Reopen Form
                  </button>
                  <button
                    className="button"
                    onClick={() => decide("APPROVE")}
                    disabled={reviewBusy}
                  >
                    <CheckCircle2 />
                    Approve & Publish
                  </button>
                </div>
              </footer>
            )}
          </section>
        </div>
      )}
    </>
  );
}
function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function ReviewText({ title, value }: { title: string; value: string }) {
  return (
    <article className="review-text">
      <h3>{title}</h3>
      <p>{value}</p>
      <small>{value.length} characters</small>
    </article>
  );
}
function DocumentLink({
  label,
  name,
  data,
}: {
  label: string;
  name: string | null;
  data: string | null;
}) {
  return data ? (
    <article className="review-document">
      <div className="review-document-details">
        <FileText />
        <span>
          <b>{label}</b>
          <small>{name}</small>
        </span>
      </div>
      <div className="review-document-actions">
        <a href={data} target="_blank" rel="noreferrer">
          <Eye />
          Preview
        </a>
        <a href={`${data}${data.includes("?") ? "&" : "?"}download=1`} download={name || label}>
          <Download />
          Download
        </a>
      </div>
    </article>
  ) : (
    <p>{label}: Not uploaded</p>
  );
}
