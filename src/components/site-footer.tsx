import Link from "next/link";
import { Logo } from "./logo";

const footerLinks = [
  ["/", "Home"], ["/candidates", "Candidates"], ["/election", "Election Schedule"],
  ["/#faq", "FAQs"], ["/#support", "Contact"], ["/about", "Privacy Policy"],
] as const;

export function SiteFooter() {
  return <footer><Logo/><nav className="footer-nav">{footerLinks.map(([href, label]) => <Link href={href} key={label}>{label}</Link>)}</nav><p className="copyright">© 2026 Nigerian Library Association, Osun State Chapter. All rights reserved.</p></footer>;
}
