import { requireUserId } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { mediaFromPublicUrl, saveMediaFile, toFlowMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireUserId();
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await readJson<{ url?: string }>(request);
      if (!body.url?.trim()) return json({ error: "url is required" }, 400);
      return json({ media: mediaFromPublicUrl(body.url) });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "file is required" }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const record = await saveMediaFile({
      bytes,
      mime: file.type || "application/octet-stream",
      filename: file.name || "upload",
    });
    return json({ media: toFlowMedia(record) });
  } catch (error) {
    return fail(error);
  }
}
