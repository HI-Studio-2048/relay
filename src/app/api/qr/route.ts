import QRCode from "qrcode";

/** QR code as SVG, rendered locally (links are not sent to a third-party QR service). */
export async function GET(request: Request) {
  const data = new URL(request.url).searchParams.get("data") ?? "";
  if (!data || data.length > 2000) return new Response("data is required (max 2000 chars)", { status: 400 });
  const svg = await QRCode.toString(data, { type: "svg", margin: 1, width: 180, errorCorrectionLevel: "M" });
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=86400" } });
}
