"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarCheck, CircleHelp, MessageSquareText, Radio, Search, ShieldCheck, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { plainTextFromMarkdown } from "@/components/markdown-content";

type Post = { id: string; title: string; body: string; category: string; featuredImage: string | null; publishedAt: string | null };
const PAGE_SIZE = 6;

const categoryStyle = (category: string) => {
  const value = category.toLowerCase();
  if (value.includes("security")) return { tone: "gold", Icon: ShieldCheck };
  if (value.includes("community")) return { tone: "green", Icon: Users };
  if (value.includes("guide")) return { tone: "pink", Icon: CircleHelp };
  if (value.includes("update")) return { tone: "pink", Icon: Radio };
  if (value.includes("news")) return { tone: "slate", Icon: MessageSquareText };
  return { tone: "pink", Icon: CalendarCheck };
};

const excerpt = (body: string, length: number) => {
  const paragraph = plainTextFromMarkdown(body.split(/\n\s*\n|\n/).find(Boolean)?.trim() ?? body.trim());
  return paragraph.length > length ? `${paragraph.slice(0, length).trim()}…` : paragraph;
};

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Lagos" }).format(new Date(value)) : "Recently published";

export function AnnouncementDirectory({ posts }: { posts: Post[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const categories = useMemo(() => [...new Set(posts.map(post => post.category))].sort(), [posts]);
  const filtered = useMemo(() => posts.filter(post => {
    const matchesCategory = !category || post.category === category;
    const haystack = `${post.title} ${post.body} ${post.category}`.toLowerCase();
    return matchesCategory && haystack.includes(query.trim().toLowerCase());
  }), [posts, query, category]);
  const featured = filtered[0];
  const remaining = filtered.slice(1);
  const pageCount = Math.max(1, Math.ceil(remaining.length / PAGE_SIZE));
  const visible = remaining.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const updateQuery = (value: string) => { setQuery(value); setPage(1); };
  const updateCategory = (value: string) => { setCategory(value); setPage(1); };

  return <>
    <div className="announcement-filter">
      <label><Search /><input value={query} onChange={event => updateQuery(event.target.value)} placeholder="Search announcements and articles..." /></label>
      <select value={category} onChange={event => updateCategory(event.target.value)} aria-label="Filter posts by category"><option value="">All Categories</option>{categories.map(item => <option value={item} key={item}>{item}</option>)}</select>
    </div>

    {featured ? <article className="announcement-feature">
      <div className="announcement-feature-art">
        {featured.featuredImage ? <Image unoptimized fill sizes="(max-width: 760px) 100vw, 1000px" src={featured.featuredImage} alt="" /> : <><div className="feature-rings"><Radio /></div><span>Featured</span></>}
      </div>
      <div className="announcement-feature-copy">
        <div className="feature-meta"><span>{featured.category}</span><small>Featured story</small></div>
        <h2>{featured.title}</h2>
        <p>{excerpt(featured.body, 280)}</p>
        <div className="feature-footer"><div className="feature-author"><b>NA</b><span><strong>NLA Osun Communications</strong><small>{formatDate(featured.publishedAt)} · 5 min read</small></span></div><Link href={`/announcements/${featured.id}`}>Read More <ArrowRight /></Link></div>
      </div>
    </article> : <section className="announcement-empty"><Search /><h2>No matching posts</h2><p>Try another search term or category.</p></section>}

    {featured && <><div className="announcement-latest-title"><div><h2>Latest from NLA Osun</h2><p>Published announcements and community stories</p></div><span>Showing {remaining.length} published {remaining.length === 1 ? "post" : "posts"}</span></div>
      <div className="announcement-card-grid">{visible.map(post => { const { tone, Icon } = categoryStyle(post.category); return <article className="announcement-tile" key={post.id}>
        <div className={`announcement-tile-art ${tone}`}>{post.featuredImage ? <Image unoptimized fill sizes="(max-width: 760px) 100vw, 33vw" src={post.featuredImage} alt="" /> : <Icon />}</div>
        <div className="announcement-tile-copy"><span className={`category-badge ${tone}`}>{post.category}</span><h3>{post.title}</h3><p>{excerpt(post.body, 135)}</p><div><small>{formatDate(post.publishedAt)}</small><Link href={`/announcements/${post.id}`}>Read More <ArrowRight /></Link></div></div>
      </article> })}</div>
      {pageCount > 1 && <nav className="announcement-pagination" aria-label="Announcement pages"><button disabled={page === 1} onClick={() => setPage(page - 1)}><ArrowLeft />Previous</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map(number => <button className={page === number ? "active" : ""} onClick={() => setPage(number)} key={number}>{number}</button>)}<button disabled={page === pageCount} onClick={() => setPage(page + 1)}>Next<ArrowRight /></button></nav>}
    </>}
  </>;
}
