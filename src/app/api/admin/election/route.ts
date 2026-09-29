import { revalidatePath } from "next/cache";
import{NextResponse}from"next/server";import{z}from"zod";import{isAdminAuthenticated}from"@/lib/admin-auth";import{db}from"@/lib/db";
const schema=z.object({id:z.string(),title:z.string().trim().min(5).max(150),opensAt:z.coerce.date(),closesAt:z.coerce.date(),showCountdown:z.boolean()}).refine(data=>data.closesAt>data.opensAt,{message:"Closing time must follow opening time."});
export async function PUT(request:Request){if(!await isAdminAuthenticated())return NextResponse.json({message:"Unauthorized"},{status:401});const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({message:parsed.error.issues[0]?.message??"Invalid election settings."},{status:400});const election=await db.election.update({where:{id:parsed.data.id},data:{title:parsed.data.title,opensAt:parsed.data.opensAt,closesAt:parsed.data.closesAt,showCountdown:parsed.data.showCountdown}});
  // Public pages are cached for 5 minutes; without this they kept showing the old
  // voting times after an edit (and one more stale copy while rebuilding).
  for(const path of ["/","/election","/results","/candidates"])revalidatePath(path);
  return NextResponse.json(election)}

