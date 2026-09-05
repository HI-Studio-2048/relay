"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { PanelHeader } from "@/components/chrome/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client";
import { slugifyName } from "@/lib/growth";

type Option = { id: string; name: string };

export function CreateGrowthLinkForm({
  botId,
  tags,
  flows,
}: {
  botId: string;
  tags: Option[];
  flows: Option[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [tagName, setTagName] = useState("");
  const [flowId, setFlowId] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [busy, setBusy] = useState(false);

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
          tagName: tagName || null,
          flowId: flowId || null,
          utmSource: utmSource || null,
          utmMedium: utmMedium || null,
          utmCampaign: utmCampaign || null,
        }),
      });
      setName("");
      setSlug("");
      setSlugTouched(false);
      setTagName("");
      setFlowId("");
      setUtmSource("");
      setUtmMedium("");
      setUtmCampaign("");
      router.refresh();
      toast.success("Growth link created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <PanelHeader
        tone="action"
        icon={Link2}
        label="New link"
        title="Create a start param"
        description="Share the short URL or QR. /start attributes the contact and can kick a flow."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="growth-name" className="text-[13px] font-medium text-[#1b1f24]">
            Name
          </Label>
          <Input
            id="growth-name"
            placeholder="Instagram bio"
            className="border-[#e5e7eb] bg-white text-[#1b1f24] placeholder:text-[#6b7280]"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugTouched) setSlug(slugifyName(event.target.value));
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="growth-slug" className="text-[13px] font-medium text-[#1b1f24]">
            Start param
          </Label>
          <Input
            id="growth-slug"
            placeholder="ig_bio"
            className="border-[#e5e7eb] bg-white text-[#1b1f24] placeholder:text-[#6b7280]"
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="growth-tag" className="text-[13px] font-medium text-[#1b1f24]">
            Tag on start
          </Label>
          <Input
            id="growth-tag"
            list="growth-tag-options"
            placeholder="lead — or type a new tag"
            className="border-[#e5e7eb] bg-white text-[#1b1f24] placeholder:text-[#6b7280]"
            value={tagName}
            onChange={(event) => setTagName(event.target.value)}
          />
          <datalist id="growth-tag-options">
            {tags.map((tag) => (
              <option key={tag.id} value={tag.name} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <Label htmlFor="growth-flow" className="text-[13px] font-medium text-[#1b1f24]">
            Start this flow
          </Label>
          <select
            id="growth-flow"
            className="h-8 w-full rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-sm text-[#1b1f24] outline-none focus-visible:border-[#0084ff] focus-visible:ring-3 focus-visible:ring-[#0084ff]/20"
            style={{ colorScheme: "light" }}
            value={flowId}
            onChange={(event) => setFlowId(event.target.value)}
          >
            <option value="">Default /start flow</option>
            {flows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="utm-source" className="text-[13px] font-medium text-[#1b1f24]">
            UTM source
          </Label>
          <Input
            id="utm-source"
            className="border-[#e5e7eb] bg-white text-[#1b1f24] placeholder:text-[#6b7280]"
            value={utmSource}
            onChange={(event) => setUtmSource(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="utm-medium" className="text-[13px] font-medium text-[#1b1f24]">
            UTM medium
          </Label>
          <Input
            id="utm-medium"
            className="border-[#e5e7eb] bg-white text-[#1b1f24] placeholder:text-[#6b7280]"
            value={utmMedium}
            onChange={(event) => setUtmMedium(event.target.value)}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="utm-campaign" className="text-[13px] font-medium text-[#1b1f24]">
            UTM campaign
          </Label>
          <Input
            id="utm-campaign"
            className="border-[#e5e7eb] bg-white text-[#1b1f24] placeholder:text-[#6b7280]"
            value={utmCampaign}
            onChange={(event) => setUtmCampaign(event.target.value)}
          />
        </div>
      </div>
      <Button
        onClick={() => void create()}
        disabled={busy || !name.trim()}
        className="bg-[#0084ff] text-white hover:bg-[#0076e6] disabled:bg-[#0084ff]/40"
      >
        {busy ? "Creating…" : "Create link"}
      </Button>
    </div>
  );
}
