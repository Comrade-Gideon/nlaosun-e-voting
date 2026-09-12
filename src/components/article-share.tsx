"use client";

import { Check, Link as LinkIcon, Mail } from "lucide-react";
import { useState } from "react";

export function ArticleShare({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return <div className="article-share"><span>Share</span><button type="button" onClick={copyLink} aria-label="Copy article link">{copied ? <Check /> : <LinkIcon />}</button><a aria-label="Share article by email" href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`Read this NLA Osun State Chapter update: ${title}`)}`}><Mail /></a></div>;
}
