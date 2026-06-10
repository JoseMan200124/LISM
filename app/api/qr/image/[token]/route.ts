import QRCode from "qrcode";
import { publicScanUrl } from "@/lib/qr-security";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const svg = await QRCode.toString(publicScanUrl(request, token), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 360,
  });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
