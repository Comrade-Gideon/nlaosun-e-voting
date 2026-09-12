"use client";
import Image from "next/image";
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileText,
  CalendarClock,
  Link2,
  LockKeyhole,
  Printer,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
type Position = { id: string; title: string };
type NominationWindow = { opensAt: string | null; closesAt: string | null };

/** datetime-local wants wall-clock WAT, not the browser's local zone. */
const watLocal = (value: string | null) => {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
};

function windowState(nominationWindow: NominationWindow) {
  if (!nominationWindow.opensAt || !nominationWindow.closesAt) return "closed" as const;
  const now = Date.now();
  if (now < new Date(nominationWindow.opensAt).getTime()) return "upcoming" as const;
  if (now > new Date(nominationWindow.closesAt).getTime()) return "closed" as const;
  return "open" as const;
}
type GuarantorSummary = {
  id: string;
  name: string;
  email: string;
  invited: boolean;
  completed: boolean;
};
type Invitation = {
  id: string;
  candidateName: string;
  email: string;
  lrcnNumber: string | null;
  position: string;
  status: string;
  expiresAt: string;
  submittedAt: string | null;
  reviewNote: string;
  guarantors: GuarantorSummary[];
};
type Review = Invitation & {
  phone: string;
  currentPosition: string;
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
  identificationData: string | null;
  identificationName: string | null;
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
  nominationWindow,
  shareLink,
}: {
  positions: Position[];
  invitations: Invitation[];
  nominationWindow: NominationWindow;
  shareLink: string;
}) {
  const router = useRouter();
  const printRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [note, setNote] = useState("");
  const openState = windowState(nominationWindow);
  async function saveWindow(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/nominations/window", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "SET",
        opensAt: `${form.get("opensAt")}+01:00`,
        closesAt: `${form.get("closesAt")}+01:00`,
      }),
    });
    const result = await body(response);
    if (response.ok) {
      setNotice("Nomination window saved in West Africa Time (WAT).");
      router.refresh();
    } else setError(result.message);
    setBusy(false);
  }
  async function closeNow() {
    if (!confirm("Close nominations now? The shared link will stop accepting entries.")) return;
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/admin/nominations/window", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "CLOSE" }),
    });
    const result = await body(response);
    if (response.ok) {
      setNotice("Nominations are now closed.");
      router.refresh();
    } else setError(result.message);
    setBusy(false);
  }
  async function resendGuarantor(guarantor: GuarantorSummary) {
    setError("");
    setNotice("");
    const response = await fetch("/api/admin/nominations/guarantors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ guarantorId: guarantor.id }),
    });
    const result = await body(response);
    if (!response.ok) return setError(result.message);
    setNotice(
      result.sent
        ? `A new link was emailed to ${guarantor.email}.`
        : `${result.error} Link for ${guarantor.name}: ${result.link}`,
    );
    router.refresh();
  }
  async function copy() {
    await navigator.clipboard.writeText(shareLink);
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
      `<!doctype html><html><head><title>${review?.candidateName || "Candidate"} - Nomination Form</title><style>body{font-family:Raleway,Arial,sans-serif;color:#111;margin:32px}header{display:flex;justify-content:space-between;border-bottom:2px solid #0f7a3d;padding-bottom:16px}h2{margin:4px 0}.review-candidate-profile{display:grid;grid-template-columns:180px 1fr;gap:24px;align-items:center;padding:24px 0}.review-candidate-profile img{width:180px;height:180px;object-fit:cover;border-radius:10px}.review-candidate-profile dl{display:grid;grid-template-columns:1fr 1fr;gap:12px}.review-candidate-profile dl div{padding:10px;background:#f7f7f7}.review-candidate-profile dt{font-size:11px;color:#666;text-transform:uppercase}.review-candidate-profile dd{margin:4px 0 0;font-weight:700}.review-text,.review-priorities{border-top:1px solid #ddd;padding:15px 0;break-inside:avoid}.review-text p{white-space:pre-wrap;line-height:1.55}.review-text small{color:#666}.previous-review-note{padding:14px;background:#fff8e7}@media print{body{margin:16mm}.review-text p{font-size:10pt}}</style></head><body>${printable.outerHTML}</body></html>`,
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
        <form className="admin-card nomination-link-form" onSubmit={saveWindow}>
          <div className="nomination-card-title">
            <CalendarClock />
            <div>
              <h2>Nomination Window</h2>
              <p>
                Every candidate uses the same nomination link. Set the period it
                accepts entries; outside it the link is closed automatically.
              </p>
            </div>
          </div>
          <p className={`nomination-window-state ${openState}`}>
            {openState === "open"
              ? "Nominations are OPEN — the shared link is accepting entries."
              : openState === "upcoming"
                ? "Nominations are SCHEDULED — the link opens at the time below."
                : "Nominations are CLOSED — the shared link is not accepting entries."}
          </p>
          <div className="form-grid">
            <label>
              Nominations Open (WAT)
              <input
                type="datetime-local"
                name="opensAt"
                required
                defaultValue={watLocal(nominationWindow.opensAt)}
              />
            </label>
            <label>
              Nominations Close (WAT)
              <input
                type="datetime-local"
                name="closesAt"
                required
                defaultValue={watLocal(nominationWindow.closesAt)}
              />
            </label>
          </div>
          {error && <p className="error">{error}</p>}
          {notice && <p className="notice">{notice}</p>}
          <button className="button wide" disabled={busy || !positions.length}>
            <CalendarClock />
            {busy ? "Saving…" : "Save Nomination Window"}
          </button>
          {!positions.length && (
            <small>Add positions to the election before opening nominations.</small>
          )}
          <button
            type="button"
            className="nomination-close-now"
            onClick={closeNow}
            disabled={busy || openState === "closed"}
          >
            <LockKeyhole />
            Close nominations now
          </button>
          <div className="generated-link">
            <strong>Shared candidate link</strong>
            <p>Publish this one link. Every candidate fills the form through it.</p>
            <div>
              <input readOnly value={shareLink} />
              <button type="button" onClick={copy}>
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <a href={shareLink} target="_blank" rel="noreferrer">
              <Link2 />
              Open the nomination form
            </a>
          </div>
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
                    {item.email} · {item.position}
                    {item.lrcnNumber ? ` · LRCN ${item.lrcnNumber}` : ""}
                  </small>
                  {item.guarantors.length > 0 && (
                    <ul className="guarantor-progress">
                      {item.guarantors.map((g) => (
                        <li key={g.id}>
                          <span>
                            {g.name} — {g.completed ? "completed" : g.invited ? "invited" : "not sent"}
                          </span>
                          {!g.completed && (
                            <button type="button" onClick={() => resendGuarantor(g)}>
                              Resend link
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
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
                  {review.email} · {review.position}
                  {review.lrcnNumber ? ` · LRCN ${review.lrcnNumber}` : " · Not LRCN certified"}
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
                <ReviewItem label="Current Position at Place of Work" value={review.currentPosition || "—"} />
                <ReviewItem label="LRCN Certified" value={review.lrcnNumber ? `Yes — ${review.lrcnNumber}` : "No"} />
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
                name={review.identificationName}
                data={review.identificationData}
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
