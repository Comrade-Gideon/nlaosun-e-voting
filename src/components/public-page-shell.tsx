import { Hanken_Grotesk, Newsreader } from "next/font/google";
import type { ReactNode } from "react";
import "@/app/landing.css";
import "@/app/public-pages.css";

const headingFont = Newsreader({ subsets: ["latin"], display: "swap", variable: "--landing-serif" });
const bodyFont = Hanken_Grotesk({ subsets: ["latin"], display: "swap", variable: "--landing-sans" });

export function PublicPageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`landing ${headingFont.variable} ${bodyFont.variable} ${className}`}>{children}</div>;
}
