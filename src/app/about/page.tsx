import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  Megaphone,
  Quote,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const team: { name: string; role: string; duty: string | null; image: string | null; Icon: typeof Scale }[] = [
  {
    name: "Mr I. O.Mudashiru",
    role: "Chairman, NLA (Osun State Chapter) 2026 Election Committee",
    duty: "Provides electoral leadership and safeguards a fair, credible, and transparent election.",
    image: "/gideon-oluwatomiwa-ayodele.png",
    Icon: Scale,
  },
  {
    name: "Dr Yemisi Ojokuku",
    role: "General Secretary, NLA (Osun State Chapter) 2026 Election Committee",
    duty: "Serves the General Secretary of NLA (Osun State Chapter) 2026 Election Committee.",
    image: "/ayooluwa-gideon-oloyede.png",
    Icon: ClipboardCheck,
  },
  {
    name: "Abiodun Olusipe",
    role: "Member, NLA (Osun State Chapter) 2026 Election Committee",
    duty: "Coordinates official publicity and voter communication for the Election Committee.",
    image: "/Clean-Cut Portrait in White Shirt.png",
    Icon: Megaphone,
  },

];

export default function About() {
  return (
    <>
      <SiteHeader />
      <main className="page about-page">
        <section className="about-card">
          <div>
            <span className="about-chip">
              <Sparkles />
              About the committee
            </span>
            <h1>About NLA (Osun State Chapter)</h1>
            <p>
              The Election Committee of the Nigerian Library Association,
              Osun State Chapter administers a fair, secure, and credible
              chapter election. Through this verified e-voting platform, we
              protect every eligible voice and make every vote count.
            </p>
            <strong>
              <Quote />
              Advancing librarianship in Osun State
            </strong>
          </div>
          <div className="about-mark" aria-label="NLA (Osun State Chapter)">
            <ShieldCheck />
            <small>NLA Osun</small>
          </div>
        </section>

        <section className="about-team-heading">
          <div>
            <span>THE PEOPLE BEHIND THE ELECTION</span>
            <h2>Meet the Election Committee</h2>
          </div>
          <p>
            Officials committed to a transparent and credible chapter election.
          </p>
        </section>
        <div className="about-team-grid">
          {team.map(({ name, role, duty, image, Icon }) => (
            <article key={name ?? role}>
              <div className={`about-team-avatar${image ? " has-photo" : ""}`}>
                {image ? (
                  <Image
                    src={image}
                    className={name === "Dr Yemisi Ojokuku" ? "about-team-photo-fit" : undefined}
                    width={180}
                    height={180}
                    alt={`${name}, ${role}`}
                  />
                ) : (
                  <Icon />
                )}
              </div>
              <h3>{name ?? role}</h3>
              <span>{name ? role : "Electoral Commission"}</span>
              <p>{duty}</p>
            </article>
          ))}
        </div>

        <section className="about-cta">
          <div>
            <h2>Ready to make your voice count?</h2>
            <p>
              Review the candidates and participate in the NLA Osun State
              Chapter election.
            </p>
          </div>
          <Link href="/election">
            View Election <ArrowRight />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
