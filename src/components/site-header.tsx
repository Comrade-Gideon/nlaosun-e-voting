"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, CircleUserRound, Home, Info, LogIn, Menu, Users, Vote, X } from "lucide-react";
import { Logo } from "./logo";

const links = [
  ["/", "Home", Home], ["/election", "Election", Vote], ["/candidates", "Candidates", Users],
  ["/announcements", "Announcements", Bell], ["/results", "Results", BarChart3], ["/about", "About", Info],
] as const;

export function SiteHeader() {
  const pathname=usePathname();
  const [open,setOpen]=useState(false);
  const [voterName,setVoterName]=useState("");
  useEffect(()=>{let active=true;fetch("/api/auth/session").then(response=>response.ok?response.json():null).then(data=>{if(active&&data?.authenticated)setVoterName(data.voterName)}).catch(()=>{});return()=>{active=false}},[]);
  const accountLabel=voterName||"Vote Now";
  const AccountIcon=voterName?CircleUserRound:LogIn;
  return <header className="site-header"><Logo /><nav className={open?"open":""}>{links.map(([href, label, Icon]) => <Link onClick={()=>setOpen(false)}className={pathname===href||href!=="/"&&pathname.startsWith(href)?"active":""}href={href}key={href}><Icon size={18}/>{label}</Link>)}<Link onClick={()=>setOpen(false)}className="nav-login"href={voterName?"/vote":"/login"}><AccountIcon size={18}/>{accountLabel}</Link></nav><Link className="button compact header-cta voter-account" href={voterName?"/vote":"/login"}><AccountIcon size={18}/>{accountLabel}</Link><button className="mobile-menu-toggle"onClick={()=>setOpen(!open)}aria-expanded={open}aria-label={open?"Close navigation menu":"Open navigation menu"}>{open?<X/>:<Menu/>}</button></header>;
}
