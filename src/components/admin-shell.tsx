"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Bell, BookOpen, ClipboardPenLine, ExternalLink, LayoutDashboard, LogOut, Mail, Settings, Upload } from "lucide-react";

const links = [
  ["/admin", "Dashboard", LayoutDashboard],
  ["/admin/nominations", "Candidate Links", ClipboardPenLine],
  ["/admin/electorates", "Electorates", Upload],
  ["/admin/settings", "Election Settings", Settings],
  ["/admin/results", "Vote Monitor / Results", BarChart3],
  ["/admin/announcements", "Announcements / Blog", BookOpen],
  ["/admin/emails", "Email Candidates", Mail],
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const isActive = (href: string) => path === href || (href !== "/admin" && path.startsWith(`${href}/`));

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand">
        <Image src="/nla-osun-logo.png" width={58} height={58} alt="Nigerian Library Association emblem" />
        <span><b>NLA (Osun State Chapter)</b><small>Election Committee</small></span>
      </div>
      <small className="menu-label">MAIN MENU</small>
      <nav className="admin-navigation" aria-label="Admin navigation">
        {links.map(([href, label, Icon]) => <Link className={isActive(href) ? "active" : ""} href={href} key={href} aria-current={isActive(href) ? "page" : undefined} title={label}>
          <Icon aria-hidden="true" /><span>{label}</span>
        </Link>)}
        <Link href="/" title="View website"><ExternalLink aria-hidden="true" /><span>View Website</span></Link>
      </nav>
      <button onClick={logout}><LogOut aria-hidden="true" />Logout</button>
    </aside>
    <section className="admin-main">
      <header>
        <span>NLA (Osun State Chapter)　›　<b>{links.find(([href]) => isActive(href))?.[1] ?? "Dashboard"}</b></span>
        <div><Bell aria-hidden="true" /><span className="admin-avatar">AU</span><b>Admin User<small>Administrator</small></b></div>
      </header>
      {children}
    </section>
  </div>;
}
