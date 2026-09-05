"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { PanelHeader } from "@/components/chrome/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GrowthLinkView } from "@/app/(console)/growth/growth-link-card";
import { api } from "@/lib/client";
import { slugifyName } from "@/lib/growth";
import { cn } from "@/lib/utils";

export function FlowSharePanel({
  botId,
  flowId,
  flowName,
  links,
}: {
  botId: string;
  flowId: string;
  flowName: string;
  links: GrowthLinkView[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(flowName);
  const [slug, setSlug] = useState(slugifyName(flowName));
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Copied ${label}`);
    } catch {
      toast.error("Could not copy");
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api("/api/growth-links", {
        method: "POST",
        body: JSON.stringify({
          botId,
          name,
          slug: slug.trim() || undefined,
          flowId,
        }),
      });
      setName(flowName);
      setSlug(slugifyName(flowName));
      setSlugTouched(false);
      router.refresh();
      toast.success("Share link created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create share link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="shrink-0 border-b border-[#e5e7eb] bg-white lg:flex lg:h-full lg:w-80 lg:flex-col lg:border-b-0 lg:border-l">
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:hidden">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[#1b1f24]">Share links</p>
          <p className="truncate text-[12px] text-[#6b7280]">
            {links.length === 0
              ? "Create a short URL for this flow"
              : `${links.length} link${links.length === 1 ? "" : "s"} tied to this flow`}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-[#e5e7eb] bg-white text-[#1b1f24]"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide" : "Show"}
        </Button>
      </div>
      <div className={cn("space-y-4 px-4 pb-4 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:p-4", !open && "hidden lg:flex")}>
        <PanelHeader
          tone="action"
          icon={Link2}
          label="Share"
          title="Share this flow"
          description="Creates a growth link with this flow as linked_flow_id. The short URL counts a click, then opens Telegram."
        />
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="flow-share-name" className="text-[13px] font-medium text-[#1b1f24]">
              Name
            </Label>
            <Input
              id="flow-share-name"
              placeholder="Lead capture share"
              className="border-[#e5e7eb] bg-white text-[#1b1f24] placeholder:text-[#6b7280]"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!slugTouched) setSlug(slugifyName(event.target.value));
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="flow-share-slug" className="text-[13px] font-medium text-[#1b1f24]">
              Start param
            </Label>
            <Input
              id="flow-share-slug"
              placeholder="lead_capture"
              className="border-[#e5e7eb] bg-white text-[#1b1f24] placeholder:text-[#6b7280]"
              value={slug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value);
              }}
            />
          </div>
          <Button
            type="button"
            disabled={busy || !name.trim()}
            className="bg-[#0084ff] text-white hover:bg-[#0076e6] disabled:bg-[#0084ff]/40"
            onClick={() => void create()}
          >
            {busy ? "Creating…" : "Create share link"}
          </Button>
        </div>
        {links.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#e5e7eb] bg-[#f4f6f8] px-3 py-4 text-[13px] leading-snug text-[#6b7280]">
            No share links for this flow yet. Create one to copy the short URL, t.me start link, and QR.
          </p>
        ) : (
          <div className="space-y-3">
            {links.map((link) => (
              <div key={link.id} className="rounded-xl border border-[#e5e7eb] bg-[#f4f6f8] p-3">
                <p className="text-[13px] font-medium text-[#1b1f24]">{link.name}</p>
                <p className="mt-0.5 truncate text-[12px] text-[#6b7280]">
                  /start {link.slug} · {link.clickCount} click{link.clickCount === 1 ? "" : "s"} · {link.startCount}{" "}
                  start{link.startCount === 1 ? "" : "s"}
                </p>
                <p className="mt-1 break-all text-[12px] text-[#1b1f24]">{link.shortUrl}</p>
                {link.telegramUrl ? (
                  <p className="mt-0.5 break-all text-[12px] text-[#6b7280]">{link.telegramUrl}</p>
                ) : (
                  <p className="mt-0.5 text-[12px] text-[#6b7280]">Connect a bot username to get a t.me start link.</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[#e5e7eb] bg-white text-[#1b1f24]"
                    onClick={() => void copy(link.shortUrl, "short URL")}
                  >
                    Copy short URL
                  </Button>
                  {link.telegramUrl ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-[#1b1f24]"
                      onClick={() => void copy(link.telegramUrl!, "t.me start link")}
                    >
                      Copy t.me
                    </Button>
                  ) : null}
                </div>
                <img
                  src={link.qrUrl}
                  alt={`QR for ${link.name}`}
                  width={120}
                  height={120}
                  className="mt-3 rounded-xl bg-white p-1 ring-1 ring-[#e5e7eb]"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
