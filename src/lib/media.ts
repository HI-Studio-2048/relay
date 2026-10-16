import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { mediaFiles } from "@/lib/db/schema";
import { log } from "@/lib/logger";
import { ALLOWED, MEDIA_KIND_LABEL, MediaError, resolveUploadMime } from "@/lib/media-kinds";
import type { FlowMedia, FlowMediaKind } from "@/lib/types";

export * from "@/lib/media-kinds";

export type StoredMedia = {
  id: string;
  mime: string;
  filename: string;
  kind: FlowMediaKind;
  size: number;
};

export function mediaDir(): string {
  return process.env.MEDIA_DIR?.trim() || path.join(process.cwd(), ".data", "media");
}

export function toFlowMedia(record: StoredMedia): FlowMedia {
  return {
    id: record.id,
    url: `/api/media/${record.id}`,
    kind: record.kind,
    mime: record.mime,
    filename: record.filename,
  };
}

function metaPath(id: string) {
  return path.join(mediaDir(), `${id}.json`);
}

function binPath(id: string) {
  return path.join(mediaDir(), `${id}.bin`);
}

export async function saveMediaFile(input: {
  bytes: Uint8Array;
  mime: string;
  filename: string;
}): Promise<StoredMedia> {
  const mime = resolveUploadMime(input.mime, input.filename);
  const spec = ALLOWED[mime];
  if (!spec) {
    throw new MediaError("Upload an image, GIF, MP4 video, MP3/OGG audio, or a PDF/Office/text file");
  }
  if (input.bytes.byteLength === 0) throw new MediaError("File is empty");
  if (input.bytes.byteLength > spec.max) {
    throw new MediaError(`${MEDIA_KIND_LABEL[spec.kind]} must be ${Math.round(spec.max / 1024 / 1024)} MB or smaller`);
  }

  const id = crypto.randomUUID().replace(/-/g, "");
  const record: StoredMedia = {
    id,
    mime,
    filename: sanitizeFilename(input.filename, spec.ext),
    kind: spec.kind,
    size: input.bytes.byteLength,
  };

  const db = await getDb();
  await db.insert(mediaFiles).values({ ...record, bytes: input.bytes });
  return record;
}

export async function readMediaFile(id: string): Promise<{ record: StoredMedia; bytes: Uint8Array }> {
  if (!/^[a-f0-9]{8,64}$/i.test(id)) throw new MediaError("Unknown media");
  const db = await getDb();
  const [row] = await db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).limit(1);
  if (row) {
    const record: StoredMedia = { id: row.id, mime: row.mime, filename: row.filename, kind: row.kind as FlowMediaKind, size: row.size };
    return { record, bytes: row.bytes };
  }
  // Uploads from before media moved into the database, where a volume kept them.
  try {
    const [metaRaw, bytes] = await Promise.all([readFile(metaPath(id), "utf8"), readFile(binPath(id))]);
    const record = JSON.parse(metaRaw) as StoredMedia;
    return { record, bytes };
  } catch {
    throw new MediaError("Media not found");
  }
}

const REMOTE_TIMEOUT_MS = 15_000;

/**
 * Keep our own copy of something a person sent. Platform links (Instagram's CDN) expire, so the
 * inbox would lose the picture otherwise. Returns null when it can't be fetched or isn't a type we
 * keep; the caller falls back to the remote link.
 */
export async function saveRemoteMedia(url: string, filename?: string | null): Promise<StoredMedia | null> {
  if (!/^https:\/\//i.test(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS), redirect: "follow" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const name = filename || new URL(url).pathname.split("/").pop() || "attachment";
    const mime = resolveUploadMime((response.headers.get("content-type") ?? "").split(";")[0]!.trim(), name);
    const spec = ALLOWED[mime];
    if (!spec) return null;
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > spec.max) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > spec.max) return null;
    return await saveMediaFile({ bytes, mime, filename: name });
  } catch (error) {
    log.warn("Could not keep a copy of received media", error instanceof Error ? error.message : error);
    return null;
  }
}

function sanitizeFilename(name: string, ext: string): string {
  const base = name.replace(/[/\\]/g, "").replace(/[^\w.\- ()]/g, "_").slice(0, 80);
  if (base.toLowerCase().endsWith(`.${ext}`)) return base || `media.${ext}`;
  return `${base || "media"}.${ext}`;
}
