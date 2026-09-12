import type { Metadata } from "next";
import { Raleway } from "next/font/google";
import "./globals.css";
import "./admin-blog.css";
import { getConfiguredSiteUrl } from "@/lib/site-url";
import openGraphImage from "./opengraph-nla-osun.png";

const raleway = Raleway({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: getConfiguredSiteUrl() ?? new URL("http://localhost:3000"),
  title: "NLA Osun State Chapter E-Voting",
  description: "Secure, transparent online voting for the Nigerian Library Association, Osun State Chapter.",
  icons: { icon: "/favicon.ico", shortcut: "/favicon.ico" },
  openGraph: {
    title: "NLA Osun State Chapter E-Voting",
    description: "Secure, transparent online voting for the Nigerian Library Association, Osun State Chapter.",
    images: [
      {
        url: openGraphImage.src,
        width: openGraphImage.width,
        height: openGraphImage.height,
        alt: "Nigerian Library Association, Osun State Chapter E-Voting Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NLA Osun State Chapter E-Voting",
    description: "Secure, transparent online voting for the Nigerian Library Association, Osun State Chapter.",
    images: [openGraphImage.src],
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={raleway.className} data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
