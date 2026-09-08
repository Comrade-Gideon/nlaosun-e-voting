import { Newspaper } from "lucide-react";
import { AnnouncementDirectory } from "@/components/announcement-directory";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { db } from "@/lib/db";

// Cached and revalidated on a timer so public traffic costs a fixed number of
// database reads per hour instead of one per visitor. Candidate edits, nomination
// approvals and results publication all call revalidatePath already, so those
// changes still appear immediately; only untouched data can be up to 5 min stale.
export const revalidate = 300;

export default async function Announcements() {
  const posts = await db.announcement.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    select: { id: true, title: true, body: true, category: true, featuredImage: true, publishedAt: true },
  });
  const serialised = posts.map(post => ({ ...post, publishedAt: post.publishedAt?.toISOString() ?? null }));

  return <>
    <SiteHeader />
    <main className="page announcements-page">
      <section className="announcements-heading">
        <div><span><Newspaper />NALISS UPDATES</span><h1>Announcements &amp; Blog</h1><p>Stay informed with the latest election news, important announcements, and stories from the NALISS community.</p></div>
        <strong><i />Election updates live</strong>
      </section>
      <AnnouncementDirectory posts={serialised} />
    </main>
    <SiteFooter />
  </>;
}
