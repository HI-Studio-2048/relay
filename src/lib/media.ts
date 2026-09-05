import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FlowMedia, FlowMediaKind } from "@/lib/types";

export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaError";
  }
}

const PHOTO_MAX = 8 * 1024 * 1024;
const GIF_MAX = 15 * 1024 * 1024;

const ALLOWED: Record<string, { kind: FlowMediaKind; ext: string; max: number }> = {
  "image/jpeg": { kind: "photo", ext: "jpg", max: PHOTO_MAX },
  "image/jpg": { kind: "photo", ext: "jpg", max: PHOTO_MAX },
  "image/png": { kind: "photo", ext: "png", max: PHOTO_MAX },
  "image/webp": { kind: "photo", ext: "webp", max: PHOTO_MAX },
  "image/gif": { kind: "animation", ext: "gif", max: GIF_MAX },
};

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

export function classifyMedia(mime: string, filename = ""): FlowMediaKind {
  const lower = filename.toLowerCase();
  if (mime === "image/gif" || lower.endsWith(".gif")) return "animation";
  return "photo";
}

export function telegramSendMethod(media: FlowMedia): "sendPhoto" | "sendAnimation" {
  return media.kind === "animation" ? "sendAnimation" : "sendPhoto";
}

export function telegramMediaField(media: FlowMedia): "photo" | "animation" {
  return media.kind === "animation" ? "animation" : "photo";
}

export function parseStoredMediaUrl(url: string): { type: "local"; id: string } | { type: "remote"; url: string } | null {
  const local = url.match(/^\/api\/media\/([a-f0-9]{8,64})$/i);
  if (local?.[1]) return { type: "local", id: local[1].toLowerCase() };
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return { type: "remote", url: parsed.toString() };
  } catch {
    return null;
  }
  return null;
}

export function mediaFromPublicUrl(raw: string): FlowMedia {
  const trimmed = raw.trim();
  const parsed = parseStoredMediaUrl(trimmed);
  if (!parsed || parsed.type !== "remote") {
    throw new MediaError("Use an https:// image or GIF URL");
  }
  const pathname = new URL(parsed.url).pathname;
  const kind = classifyMedia("", pathname);
  const filename = pathname.split("/").filter(Boolean).at(-1);
  return { url: parsed.url, kind, filename };
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
  const spec = ALLOWED[input.mime];
  if (!spec) {
    throw new MediaError("Upload a JPEG, PNG, WebP, or GIF");
  }
  if (input.bytes.byteLength === 0) throw new MediaError("File is empty");
  if (input.bytes.byteLength > spec.max) {
    throw new MediaError(
      spec.kind === "animation" ? "GIF must be 15 MB or smaller" : "Image must be 8 MB or smaller",
    );
  }

  const id = crypto.randomUUID().replace(/-/g, "");
  const record: StoredMedia = {
    id,
    mime: input.mime === "image/jpg" ? "image/jpeg" : input.mime,
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

export function mediaCaption(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 1024);
}

export function outboundPreview(text: string, media?: FlowMedia): string {
  if (!media) return text;
  const tag = media.kind === "animation" ? "[gif]" : "[photo]";
  return text.trim() ? `${tag} ${text}` : tag;
}

function sanitizeFilename(name: string, ext: string): string {
  const base = name.replace(/[/\\]/g, "").replace(/[^\w.\- ()]/g, "_").slice(0, 80);
  if (base.toLowerCase().endsWith(`.${ext}`)) return base || `media.${ext}`;
  return `${base || "media"}.${ext}`;
}
