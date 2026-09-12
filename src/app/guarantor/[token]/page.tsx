import { GuarantorPortal } from "@/components/guarantor-portal";

export const dynamic = "force-dynamic";

export default async function GuarantorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <GuarantorPortal token={token} />;
}
