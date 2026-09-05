import { fail, json, type RouteParams } from "@/lib/http";
import { readMediaFile } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const { record, bytes } = await readMediaFile(id);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": record.mime,
        "content-disposition": `inline; filename="${record.filename}"`,
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Media not found") {
      return json({ error: "Media not found" }, 404);
    }
    return fail(error);
  }
}
