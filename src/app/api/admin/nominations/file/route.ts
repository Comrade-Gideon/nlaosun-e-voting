import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import {
  nominationFileConfig,
  storedFileResponse,
  type NominationFileField,
} from "@/lib/blob-storage";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated()))
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const field = url.searchParams.get("field") as NominationFileField;
  const config = nominationFileConfig[field];
  if (!id || !config)
    return NextResponse.json({ message: "Invalid file request." }, { status: 400 });

  try {
    const invite = await db.nominationInvite.findUnique({ where: { id } });
    if (!invite)
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    const value = invite[config.dataKey as keyof typeof invite];
    const name = invite[config.nameKey as keyof typeof invite];
    if (typeof value !== "string")
      return new Response("File not found.", { status: 404 });
    return await storedFileResponse(
      value,
      typeof name === "string" ? name : field,
      url.searchParams.get("download") === "1" ? "attachment" : "inline",
    );
  } catch (error) {
    console.error(`Nomination file ${field} for ${id} could not be served.`, error);
    return NextResponse.json(
      { message: "The nomination file could not be retrieved." },
      { status: 502 },
    );
  }
}
