"use client";

import { useEffect, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FlowMedia } from "@/lib/types";
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

export function MediaThumb({ media, className = "h-28" }: { media?: FlowMedia; className?: string }) {
  if (!media?.url) return null;
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
}: {
  value?: FlowMedia;
  onChange: (media: FlowMedia | undefined) => void;
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
      toast.success(media.kind === "animation" ? "GIF attached" : "Image attached");
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
    const file = [...event.dataTransfer.files].find(isImageFile);
    if (file) void upload(file);
  };

  return (
    <div className="space-y-2">
      <Label>Image or GIF</Label>
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
          <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">
            Drop a JPEG, PNG, WebP, or GIF here
          </p>
        ) : null}
      </div>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
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
          placeholder="https://…/image.png or .gif"
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
        JPEG/PNG/WebP send as a Telegram photo. GIF sends as an animation. Uploads stay on this
        server; HTTPS URLs are stored as-is.
      </p>
    </div>
  );
}
