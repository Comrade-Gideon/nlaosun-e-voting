import { PrismaClient } from "@prisma/client";
import { createHmac } from "node:crypto";

const db = new PrismaClient();
const secret = process.env.SESSION_SECRET!;
const hashSurname = (value: string) => createHmac("sha256", secret).update(`surname:${value.trim().toLowerCase()}`).digest("hex");

const positions = [
  ["President", "president", "Leads the association and represents all members before the department."],
  ["Vice President", "vice-president", "Assists the President and steps in when the office is vacant."],
  ["General Secretary", "general-secretary", "Handles correspondence, records and official documentation."],
  ["Assistant General Secretary", "assistant-general-secretary", "Supports the General Secretary in record-keeping duties."],
  ["Financial Secretary", "financial-secretary", "Keeps accurate records of association income and expenditure."],
  ["Social Director", "social-director", "Creates programmes that strengthen the student community."],
  ["Welfare Director", "welfare-director", "Champions student welfare and inclusive support."],
  ["Public Relations Officer", "public-relations-officer", "Coordinates public communications for the association."],
  ["Sports Director", "sports-director", "Coordinates sporting activities, competitions, and student fitness initiatives."],
] as const;

const candidateSeed = [
  { name: "Adaeze Okonkwo", slug: "adaeze-okonkwo", position: "president", level: "400 Level", tagline: "Leadership rooted in service." },
  { name: "Emeka Okafor", slug: "emeka-okafor", position: "president", level: "400 Level", tagline: "Leadership that listens, service that lasts." },
  { name: "Chioma Adeyemi", slug: "chioma-adeyemi", position: "vice-president", level: "300 Level", tagline: "Together we build a stronger NALISS." },
  { name: "Tunde Balogun", slug: "tunde-balogun", position: "general-secretary", level: "400 Level", tagline: "Organised, accountable, transparent." },
  { name: "Aisha Bello", slug: "aisha-bello", position: "financial-secretary", level: "300 Level", tagline: "Every kobo counts, every member matters." },
  { name: "Ngozi Eze", slug: "ngozi-eze", position: "sports-director", level: "200 Level", tagline: "Stronger together through sport." },
  { name: "Fatima Sani", slug: "fatima-sani", position: "public-relations-officer", level: "300 Level", tagline: "Amplifying every student voice." },
] as const;

async function main() {
  await db.adminSession.deleteMany();
  await db.vote.deleteMany();
  await db.ballot.deleteMany();
  await db.votingSession.deleteMany();
  await db.candidate.deleteMany();
  await db.position.deleteMany();
  await db.announcement.deleteMany();
  await db.election.deleteMany();
  await db.voter.deleteMany();

  const election = await db.election.create({
    data: {
      slug: "naliss-2026-departmental-election",
      title: "NALISS 2026 Departmental Election",
      description: "Cast your vote for the next executive council of the association.",
      opensAt: new Date("2026-08-01T08:00:00+01:00"),
      closesAt: new Date("2026-12-31T18:00:00+01:00"),
      status: "PUBLISHED",
      positions: {
        create: positions.map(([title, slug, description], sortOrder) => ({ title, slug, description, sortOrder: sortOrder + 1 })),
      },
      announcements: {
        create: [{ title: "Election portal is open", body: "Eligible NALISS students may verify their identity and cast one ballot before voting closes.", status: "PUBLISHED", publishedAt: new Date() }],
      },
    },
    include: { positions: true },
  });

  const positionBySlug = new Map(election.positions.map((position) => [position.slug, position.id]));
  await db.candidate.createMany({
    data: candidateSeed.map(({ position, ...candidate }) => ({
      ...candidate,
      positionId: positionBySlug.get(position)!,
      department: "Library & Information Science",
      biography: `${candidate.name} is a committed Library and Information Science student with a record of service, academic engagement, and student advocacy.`,
      manifesto: "A practical programme built on transparency, inclusion, access to learning resources, and measurable progress for every member.",
      vision: "A united, empowered, and forward-thinking NALISS community where every student has information, opportunity, and a voice.",
      mission: "To serve with integrity, communicate openly, and turn student priorities into accountable action.",
      priorities: JSON.stringify(["Expand access to departmental study resources", "Strengthen student welfare support", "Publish regular open progress reports", "Create mentorship and career opportunities"]),
    })),
  });

  await db.voter.createMany({
    data: [
      { phoneNumber: "+2348030000001", surnameNormalizedHash: hashSurname("Okafor"), displayName: "Chinedu Okafor" },
      { phoneNumber: "+2348030000002", surnameNormalizedHash: hashSurname("Bello"), displayName: "Maryam Bello" },
    ],
  });

  console.log("Seeded NALISS election. Demo voter: NALISS/2023/001 / Okafor");
}

main().finally(() => db.$disconnect());
