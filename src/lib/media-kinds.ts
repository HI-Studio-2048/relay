import type { FlowMedia, FlowMediaKind } from "@/lib/types";

/**
 * Browser-safe media helpers: kinds, mime tables, Telegram method mapping, previews.
 * Keep node:fs out of this file — client components import it.
 */

export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaError";
  }
}

const PHOTO_MAX = 8 * 1024 * 1024;
const GIF_MAX = 15 * 1024 * 1024;
/** Telegram bots can upload up to 50 MB; keep server memory in check with a lower cap. */
const FILE_MAX = 20 * 1024 * 1024;

export const ALLOWED: Record<string, { kind: FlowMediaKind; ext: string; max: number }> = {
  "image/jpeg": { kind: "photo", ext: "jpg", max: PHOTO_MAX },
  "image/jpg": { kind: "photo", ext: "jpg", max: PHOTO_MAX },
  "image/png": { kind: "photo", ext: "png", max: PHOTO_MAX },
  "image/webp": { kind: "photo", ext: "webp", max: PHOTO_MAX },
  "image/gif": { kind: "animation", ext: "gif", max: GIF_MAX },
  "video/mp4": { kind: "video", ext: "mp4", max: FILE_MAX },
  "video/quicktime": { kind: "video", ext: "mov", max: FILE_MAX },
  "audio/mpeg": { kind: "audio", ext: "mp3", max: FILE_MAX },
  "audio/mp4": { kind: "audio", ext: "m4a", max: FILE_MAX },
  "audio/ogg": { kind: "audio", ext: "ogg", max: FILE_MAX },
  "audio/wav": { kind: "audio", ext: "wav", max: FILE_MAX },
  "application/pdf": { kind: "document", ext: "pdf", max: FILE_MAX },
  "application/zip": { kind: "document", ext: "zip", max: FILE_MAX },
  "text/plain": { kind: "document", ext: "txt", max: FILE_MAX },
  "text/csv": { kind: "document", ext: "csv", max: FILE_MAX },
  "application/msword": { kind: "document", ext: "doc", max: FILE_MAX },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    kind: "document",
    ext: "docx",
    max: FILE_MAX,
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    kind: "document",
    ext: "xlsx",
    max: FILE_MAX,
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    kind: "document",
    ext: "pptx",
    max: FILE_MAX,
  },
};

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  pdf: "application/pdf",
  zip: "application/zip",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** Browser `accept` list for the media picker. */
export const MEDIA_ACCEPT = Object.keys(ALLOWED).join(",");

export const MEDIA_KIND_LABEL: Record<FlowMediaKind, string> = {
  photo: "Image",
  animation: "GIF",
  video: "Video",
  audio: "Audio",
  document: "File",
};

/** Browsers sometimes send an empty or octet-stream type; fall back to the filename. */
export function resolveUploadMime(mime: string, filename: string): string {
  const normalized = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (ALLOWED[normalized]) return normalized === "image/jpg" ? "image/jpeg" : normalized;
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return EXT_MIME[ext] ?? normalized;
}

export function classifyMedia(mime: string, filename = ""): FlowMediaKind {
  const lower = filename.toLowerCase();
  const normalized = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (normalized === "image/gif" || lower.endsWith(".gif")) return "animation";
  const byMime = ALLOWED[normalized]?.kind;
  if (byMime) return byMime;
  const ext = lower.split(".").pop() ?? "";
  const extMime = EXT_MIME[ext];
  if (extMime) return ALLOWED[extMime]?.kind ?? "photo";
  return "photo";
}

const SEND_METHOD: Record<FlowMediaKind, { method: TelegramMediaMethod; field: TelegramMediaFieldName }> = {
  photo: { method: "sendPhoto", field: "photo" },
  animation: { method: "sendAnimation", field: "animation" },
  video: { method: "sendVideo", field: "video" },
  audio: { method: "sendAudio", field: "audio" },
  document: { method: "sendDocument", field: "document" },
};

export type TelegramMediaMethod = "sendPhoto" | "sendAnimation" | "sendVideo" | "sendAudio" | "sendDocument";
export type TelegramMediaFieldName = "photo" | "animation" | "video" | "audio" | "document";

export function telegramSendMethod(media: FlowMedia): TelegramMediaMethod {
  return (SEND_METHOD[media.kind] ?? SEND_METHOD.photo).method;
}

export function telegramMediaField(media: FlowMedia): TelegramMediaFieldName {
  return (SEND_METHOD[media.kind] ?? SEND_METHOD.photo).field;
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
    throw new MediaError("Use an https:// image, GIF, video, audio, or file URL");
  }
  const pathname = new URL(parsed.url).pathname;
  const kind = classifyMedia("", pathname);
  const filename = pathname.split("/").filter(Boolean).at(-1);
  return { url: parsed.url, kind, filename };
}

export function mediaCaption(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 1024);
}

export function outboundPreview(text: string, media?: FlowMedia): string {
  if (!media) return text;
  const tag =
    media.kind === "animation"
      ? "[gif]"
      : media.kind === "video"
        ? "[video]"
        : media.kind === "audio"
          ? "[audio]"
          : media.kind === "document"
            ? `[file${media.filename ? ` ${media.filename}` : ""}]`
            : "[photo]";
  return text.trim() ? `${tag} ${text}` : tag;
}

export function isVisualMedia(media?: FlowMedia): boolean {
  return media?.kind === "photo" || media?.kind === "animation";
}
