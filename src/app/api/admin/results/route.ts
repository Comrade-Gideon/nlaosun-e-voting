import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { db } from "@/lib/db";

const schema=z.object({publish:z.boolean()});

export async function PUT(request:Request){
  if(!await isAdminAuthenticated())return NextResponse.json({message:"Unauthorized"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({message:"Invalid result publication request."},{status:400});
  try{
    const election=await db.election.findFirst({where:{status:"PUBLISHED"}});
    if(!election)return NextResponse.json({message:"No published election was found."},{status:404});
    if(parsed.data.publish&&election.closesAt>new Date())return NextResponse.json({message:"Results cannot be published before voting closes."},{status:409});
    const updated=await db.election.update({where:{id:election.id},data:{resultsPublishedAt:parsed.data.publish?new Date():null}});
    revalidatePath("/results");revalidatePath("/admin/results");revalidatePath("/");
    return NextResponse.json({published:Boolean(updated.resultsPublishedAt),publishedAt:updated.resultsPublishedAt});
  }catch(error){
    console.error("[admin/results] publish failed",error instanceof Error?error.name:"unknown");
    return NextResponse.json({message:"The election database could not be reached. Please try again."},{status:503});
  }
}
