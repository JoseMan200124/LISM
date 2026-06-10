import { PublicQrView } from "@/components/public-qr-view";

export default async function PublicQrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicQrView token={token} />;
}
