import Link from "next/link";
import { ArrowRight, CircleHelp, Compass, Home, X } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return <>
    <SiteHeader />
    <main className="not-found-page">
      <div className="not-found-symbol" aria-hidden="true"><div><Compass /></div><span><X /></span></div>
      <strong>404</strong>
      <h1>Page Not Found</h1>
      <p>Sorry, we could not find the page you are looking for. It may have been moved, deleted, or the address may be incorrect.</p>
      <div className="not-found-actions"><Link className="button" href="/"><Home />Back to Home</Link><Link href="/announcements">Return to Announcements <ArrowRight /></Link></div>
      <div className="not-found-help"><CircleHelp />Need help? Contact the Election Committee support team.</div>
    </main>
    <SiteFooter />
  </>;
}
