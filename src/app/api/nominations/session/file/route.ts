import { NextResponse } from "next/server";
import {
  nominationFileConfig,
  storedFileResponse,
  type NominationFileField,
} from "@/lib/blob-storage";
import { currentNomination, isEditable } from "@/lib/nominations";

export async function GET(request: Request) {
  const field = new URL(request.url).searchParams.get("field") as NominationFileField;
  const config = nominationFileConfig[field];
  if (!config)
    return NextResponse.json({ message: "Unknown file." }, { status: 400 });

  const invite = await currentNomination();
  if (!isEditable(invite))
    return NextResponse.json({ message: "This link is no longer valid." }, { status: 410 });

  const value = invite![config.dataKey as keyof typeof invite];
  const name = invite![config.nameKey as keyof typeof invite];
  if (typeof value !== "string") return new Response("File not found.", { status: 404 });
  return storedFileResponse(value, typeof name === "string" ? name : field);
}
