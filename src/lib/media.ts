import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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

  await mkdir(mediaDir(), { recursive: true });
  await writeFile(binPath(id), input.bytes);
  await writeFile(metaPath(id), JSON.stringify(record));
  return record;
}

export async function readMediaFile(id: string): Promise<{ record: StoredMedia; bytes: Uint8Array }> {
  if (!/^[a-f0-9]{8,64}$/i.test(id)) throw new MediaError("Unknown media");
  try {
    const [metaRaw, bytes] = await Promise.all([readFile(metaPath(id), "utf8"), readFile(binPath(id))]);
    const record = JSON.parse(metaRaw) as StoredMedia;
    return { record, bytes };
  } catch {
    throw new MediaError("Media not found");
  }
}

function sanitizeFilename(name: string, ext: string): string {
  const base = name.replace(/[/\\]/g, "").replace(/[^\w.\- ()]/g, "_").slice(0, 80);
  if (base.toLowerCase().endsWith(`.${ext}`)) return base || `media.${ext}`;
  return `${base || "media"}.${ext}`;
}
