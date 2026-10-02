"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Clock, Megaphone, Users } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/chrome/panel";
import { PageHeader } from "@/components/chrome/page-header";
import { SegmentBuilder, type SegmentOptions } from "@/components/segment-builder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client";
import type { ChannelId } from "@/lib/channels/types";
import { EMPTY_SEGMENT, type Segment } from "@/lib/segments";
import { cn } from "@/lib/utils";

type Tag = { id: string; name: string };

const META_WINDOW_CHANNELS: ChannelId[] = ["zernio", "instagram", "messenger", "whatsapp"];

export function ComposeBroadcast({
  botId,
  channel,
  tags,
  flows,
  options,
  initialEveryone,
}: {
  botId: string;
  channel: ChannelId;
  tags: Tag[];
  flows: { id: string; name: string }[];
  options: SegmentOptions;
  initialEveryone: number;
}) {
  const [mode, setMode] = useState<"all" | "tag">("all");
  const [tagId, setTagId] = useState(tags[0]?.id ?? "");
  const [segment, setSegment] = useState<Segment>(EMPTY_SEGMENT);
  const [content, setContent] = useState<"text" | "flow">("text");
  const [flowId, setFlowId] = useState(flows[0]?.id ?? "");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [abTest, setAbTest] = useState(false);
  const [textB, setTextB] = useState("");
  const [goal, setGoal] = useState("");
  const [drafting, setDrafting] = useState(false);

  const draft = async () => {
    if (!goal.trim()) return;
    setDrafting(true);
    try {
      const data = await api<{ a: string; b: string }>("/api/broadcasts/draft", { method: "POST", body: JSON.stringify({ botId, goal }) });
      setText(data.a);
      setTextB(data.b);
      setAbTest(true);
      toast.success("Two versions written — edit them, then A/B test");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI is unavailable");
    } finally {
      setDrafting(false);
    }
  };
  const [preview, setPreview] = useState<{ count: number; sample: string[] }>({ count: initialEveryone, sample: [] });
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      void api<{ count: number; sample: string[] }>("/api/broadcasts/preview", {
        method: "POST",
        body: JSON.stringify({ botId, tagId: mode === "tag" ? tagId : null, segment }),
      })
        .then(setPreview)
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [botId, mode, tagId, segment]);

  const hasWindowRule = segment.conditions.some((condition) => condition.kind === "active" && condition.op === "within" && condition.hours <= 24);

  const create = async () => {
    setSaving(true);
    try {
      const data = await api<{ broadcast: { id: string } }>("/api/broadcasts", {
        method: "POST",
        body: JSON.stringify({
          botId,
          audience: mode,
          tagId: mode === "tag" ? tagId : null,
          segment,
          name,
          text: content === "text" ? text : "",
          textB: content === "text" && abTest ? textB : null,
          flowId: content === "flow" ? flowId : null,
        }),
      });
      router.push(`/broadcasts/${data.broadcast.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create draft");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        eyebrow="Broadcasts"
        title="Compose broadcast"
        icon={Megaphone}
        tone="action"
        description="Pick who gets it, write the message (or send a whole flow), then confirm or schedule on the next screen. Unsubscribed contacts are always skipped."
      />

      <Panel
        tone="input"
        icon={Users}
        label="Audience"
        title={`${preview.count} contact${preview.count === 1 ? "" : "s"} match`}
        description={preview.sample.length ? `Including ${preview.sample.join(", ")}${preview.count > preview.sample.length ? "…" : ""}` : undefined}
      >
        <div className="flex flex-wrap gap-2">
          {(["all", "tag"] as const).map((value) => (
            <button
              key={value}
              type="button"
              disabled={value === "tag" && tags.length === 0}
              onClick={() => setMode(value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13px] ring-1",
                mode === value ? "bg-[#eef6ff] text-[#0b63c5] ring-[#0084ff]" : "bg-white text-[#6b7280] ring-[#e5e7eb]",
              )}
            >
              {value === "all" ? `Everyone subscribed (${initialEveryone})` : "Contacts with a tag"}
            </button>
          ))}
          {mode === "tag" ? (
            <select
              aria-label="Tag"
              className="rounded-lg border border-[#e5e7eb] bg-white px-2 py-1.5 text-[13px]"
              value={tagId}
              onChange={(event) => setTagId(event.target.value)}
            >
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <SegmentBuilder value={segment} options={options} onChange={setSegment} />
        {META_WINDOW_CHANNELS.includes(channel) && !hasWindowRule ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            Instagram, Messenger and WhatsApp only deliver free-form messages to people who wrote to you in the last
            24 hours.{" "}
            <button
              type="button"
              className="font-medium underline"
              onClick={() => setSegment({ ...segment, conditions: [...segment.conditions, { kind: "active", op: "within", hours: 24 }] })}
            >
              Add that condition
            </button>
          </p>
        ) : null}
      </Panel>

      <Panel tone="content" icon={Megaphone} label="Content">
        <div className="flex gap-2">
          {(["text", "flow"] as const).map((value) => (
            <button
              key={value}
              type="button"
              disabled={value === "flow" && flows.length === 0}
              onClick={() => setContent(value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13px] ring-1",
                content === value ? "bg-[#eef6ff] text-[#0b63c5] ring-[#0084ff]" : "bg-white text-[#6b7280] ring-[#e5e7eb]",
              )}
            >
              {value === "text" ? "Message" : "Send a flow"}
            </button>
          ))}
        </div>
        {content === "text" ? (
          <div className="space-y-1">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="✨ What is it for? e.g. fall sale, 20% off this weekend only"
                className="h-8 flex-1 rounded-lg border border-[#f0abfc] bg-[#fdf4ff] px-2.5 text-[13px] outline-none focus:border-[#d946ef]"
              />
              <Button type="button" size="sm" variant="outline" disabled={drafting || !goal.trim()} onClick={() => void draft()}>
                {drafting ? "Writing…" : "Write it with AI"}
              </Button>
            </div>
            <Textarea rows={6} value={text} onChange={(event) => setText(event.target.value)} placeholder="Hey {{first_name|there}}! …" />
            <p className="text-[11px] text-muted-foreground">
              Variables: {"{{first_name}}"}, {"{{email}}"}, any custom field like {"{{company}}"}, with fallbacks {"{{first_name|there}}"}.
            </p>
            <label className="flex items-center gap-2 pt-1 text-[13px]">
              <input type="checkbox" checked={abTest} onChange={(event) => setAbTest(event.target.checked)} />
              A/B test a second version (half the audience each; compare reply rates)
            </label>
            {abTest ? (
              <Textarea rows={4} value={textB} onChange={(event) => setTextB(event.target.value)} placeholder="Version B — try a different hook or offer" />
            ) : null}
          </div>
        ) : (
          <div className="space-y-1">
            <select
              aria-label="Flow"
              className="w-full rounded-lg border border-[#e5e7eb] bg-white px-2 py-1.5 text-[13px]"
              value={flowId}
              onChange={(event) => setFlowId(event.target.value)}
            >
              {flows.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Each person starts the flow from its first step — buttons, questions and delays all work.
            </p>
          </div>
        )}
      </Panel>

      <Panel tone="stop" icon={Clock} label="Name">
        <div className="space-y-1">
          <Label htmlFor="broadcast-name">Internal name</Label>
          <Input id="broadcast-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="April follow-up" />
        </div>
      </Panel>

      <Button
        onClick={() => void create()}
        disabled={saving || (mode === "tag" && !tagId) || (content === "text" ? !text.trim() || (abTest && !textB.trim()) : !flowId) || preview.count === 0}
      >
        {saving ? "Saving…" : `Review and confirm (${preview.count})`}
      </Button>
    </div>
  );
}
