"use client";

import { useEffect, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MEDIA_ACCEPT, MEDIA_KIND_LABEL, isVisualMedia } from "@/lib/media-kinds";
import type { FlowMedia, FlowMediaKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export async function uploadMediaFile(file: File): Promise<FlowMedia> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/media", { method: "POST", body });
  const data = (await response.json()) as { media?: FlowMedia; error?: string };
  if (!response.ok || !data.media) throw new Error(data.error || "Upload failed");
  return data.media;
}

export async function attachMediaUrl(url: string): Promise<FlowMedia> {
  const response = await fetch("/api/media", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = (await response.json()) as { media?: FlowMedia; error?: string };
  if (!response.ok || !data.media) throw new Error(data.error || "Could not attach URL");
  return data.media;
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(gif|png|jpe?g|webp)$/i.test(file.name);
}

/** Anything the upload route accepts: images, GIFs, video, audio, and documents. */
export function isMediaFile(file: File): boolean {
  if (isImageFile(file)) return true;
  if (/^(video|audio)\//.test(file.type)) return true;
  return /\.(mp4|mov|mp3|m4a|ogg|wav|pdf|zip|txt|csv|docx?|xlsx|pptx)$/i.test(file.name);
}

const ACCEPT_BY_KIND: Record<FlowMediaKind, string> = {
  photo: "image/jpeg,image/png,image/webp,image/gif",
  animation: "image/gif",
  video: "video/mp4,video/quicktime",
  audio: "audio/mpeg,audio/mp4,audio/ogg,audio/wav",
  document: MEDIA_ACCEPT,
};

const HINT_BY_KIND: Record<FlowMediaKind, string> = {
  photo: "Drop a JPEG, PNG, WebP, or GIF here",
  animation: "Drop a GIF here",
  video: "Drop an MP4 or MOV here",
  audio: "Drop an MP3, M4A, OGG, or WAV here",
  document: "Drop a PDF, Office, text, or zip file here",
};

export function MediaThumb({ media, className = "h-28" }: { media?: FlowMedia; className?: string }) {
  if (!media?.url) return null;
  if (!isVisualMedia(media)) {
    return (
      <div className={cn("flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-xs", className, "h-auto")}>
        <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">
          {MEDIA_KIND_LABEL[media.kind] ?? "File"}
        </span>
        <span className="truncate">{media.filename || media.url}</span>
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden rounded-md bg-muted ${className}`}>
      {/* Preview of user-attached flow media; remote or local /api/media URLs. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={media.url} alt={media.filename || "Flow media"} className="h-full w-full object-cover" />
      <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">
        {media.kind === "animation" ? "GIF" : "Image"}
      </span>
    </div>
  );
}

export function MediaPicker({
  value,
  onChange,
  kind = "photo",
}: {
  value?: FlowMedia;
  onChange: (media: FlowMedia | undefined) => void;
  /** Which family of files this picker is for; controls the accept list and copy. */
  kind?: FlowMediaKind;
}) {
  const [url, setUrl] = useState(value?.url?.startsWith("https://") ? value.url : "");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  useEffect(() => {
    setUrl(value?.url?.startsWith("https://") ? value.url : "");
  }, [value?.url]);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const media = await uploadMediaFile(file);
      onChange(media);
      toast.success(`${MEDIA_KIND_LABEL[media.kind] ?? "Media"} attached`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const attachUrl = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const media = await attachMediaUrl(url);
      onChange(media);
      toast.success("Media URL attached");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not attach URL");
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const file = [...event.dataTransfer.files].find(isMediaFile);
    if (file) void upload(file);
  };

  const label = kind === "photo" ? "Image or GIF" : MEDIA_KIND_LABEL[kind];

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-lg border border-dashed p-2",
          over ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <MediaThumb media={value} />
        {!value ? (
          <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">{HINT_BY_KIND[kind]}</p>
        ) : null}
      </div>
      <input
        type="file"
        accept={ACCEPT_BY_KIND[kind]}
        disabled={busy}
        className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium file:text-foreground"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={kind === "photo" ? "https://…/image.png or .gif" : `https://…/file.${kind === "video" ? "mp4" : kind === "audio" ? "mp3" : "pdf"}`}
        />
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void attachUrl()}>
          Attach
        </Button>
      </div>
      {value ? (
        <Button type="button" size="xs" variant="ghost" onClick={() => onChange(undefined)}>
          Remove media
        </Button>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        {kind === "photo"
          ? "JPEG/PNG/WebP send as a Telegram photo. GIF sends as an animation."
          : kind === "video"
            ? "Sends as a Telegram video (MP4 recommended, up to 20 MB)."
            : kind === "audio"
              ? "Sends as a Telegram audio track (up to 20 MB)."
              : "Sends as a Telegram document (up to 20 MB)."}{" "}
        Uploads stay on this server; HTTPS URLs are stored as-is.
      </p>
    </div>
  );
}
