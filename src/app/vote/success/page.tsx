import Link from "next/link";
import { VoterLogoutButton } from "@/components/voter-logout-button";
import "./success.css";

export default function SuccessPage() {
  return <main className="success">
    <div>
      <h1>Ballot submitted</h1>
      <p>Your vote has been recorded successfully.</p>
      <div className="success-actions">
        <Link className="button" href="/">Return home</Link>
        <VoterLogoutButton />
      </div>
    </div>
  </main>;
}
