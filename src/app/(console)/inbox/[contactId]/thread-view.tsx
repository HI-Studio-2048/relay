"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookmarkPlus, Sparkles, CheckCircle2, MessageCircle, PanelRight, Play, RotateCcw, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useBot } from "@/components/bot-provider";
import { ContactAvatar } from "@/components/chrome/avatar";
import { PlatformBadge } from "@/components/chrome/platform-badge";
import { useTeam } from "@/components/use-team";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { displayName } from "@/lib/lead-capture";
import { cn } from "@/lib/utils";
import type { ContactRecord } from "@/lib/types";

type Message = {
  id: string;
  direction: string;
  source: string;
  body: string;
  createdAt: string;
  author?: string | null;
};

type Automation = { status: "active" | "paused" | "completed" | "idle"; flowId: string | null; flowName: string | null };

type FlowOption = { id: string; name: string };

type SavedReply = { id: string; title: string; body: string };

type Assist = {
  suggestions: string[];
  summary: string;
  intent: string;
  sentiment: "positive" | "neutral" | "negative";
};

/** Inbox lines Relay writes for non-DM events. Shown as labeled cards instead of chat bubbles. */
const EVENT_PREFIX = /^\[(comment|story reply|public reply|mentioned you in their story)\]\s*/i;

function SourceLabel({ message }: { message: Message }) {
  if (message.direction === "inbound") return null;
  const label =
    message.source === "agent" ? message.author ?? "Team" : message.source === "broadcast" ? "Broadcast" : message.source === "ai" ? "AI" : "Bot";
  return <span className="font-medium">{label}</span>;
}

function Bubble({ message }: { message: Message }) {
  const outbound = message.direction === "outbound";
  const event = message.body.match(EVENT_PREFIX);
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (message.body.startsWith("[button] ")) {
    return (
      <div className="flex justify-start">
        <span className="rounded-full bg-white px-3 py-1 text-[12px] text-[#1b1f24] ring-1 ring-[#0084ff]/40">
          <span className="text-[#6b7280]">Tapped</span> {message.body.slice("[button] ".length)}
          <span className="ml-2 text-[10px] text-[#8b95a1]">{time}</span>
        </span>
      </div>
    );
  }
  if (event) {
    const kind = event[1]!.toLowerCase();
    const text = message.body.replace(EVENT_PREFIX, "");
    return (
      <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
        <div className="max-w-[80%] rounded-xl border border-dashed border-[#c5cdd6] bg-white px-3 py-2 text-[13px]">
          <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-[#7b61ff]">
            <MessageCircle className="size-3" />
            {kind === "comment"
              ? "Commented on your post"
              : kind === "public reply"
                ? "Public reply under the comment"
                : kind === "story reply"
                  ? "Replied to your story"
                  : "Mentioned you in their story"}
          </p>
          {text ? <p className="whitespace-pre-wrap text-[#1b1f24]">{text}</p> : null}
          <p className="mt-1 text-[10px] text-[#8b95a1]">{time}</p>
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-[13px]",
          outbound
            ? message.source === "agent"
              ? "rounded-br-md bg-[#0084ff] text-white"
              : "rounded-br-md bg-[#e7f1ff] text-[#1b1f24]"
            : "rounded-bl-md bg-white text-[#1b1f24] ring-1 ring-[#e5e7eb]",
        )}
      >
        <p className="break-words whitespace-pre-wrap">{message.body}</p>
        <p className={cn("mt-1 flex gap-1 text-[10px]", outbound && message.source === "agent" ? "text-white/75" : "text-[#8b95a1]")}>
          <SourceLabel message={message} />
          {outbound ? "·" : null}
          {time}
        </p>
      </div>
    </div>
  );
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export function ThreadView({
  contactId,
  initialContact,
  initialMessages,
}: {
  contactId: string;
  initialContact: ContactRecord;
  initialMessages: Message[];
}) {
  const { botId } = useBot();
  const [contact, setContact] = useState(initialContact);
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [notes, setNotes] = useState(initialContact.notes ?? "");
  const [sending, setSending] = useState(false);
  const [automation, setAutomation] = useState<Automation>({ status: "idle", flowId: null, flowName: null });
  const [flowOptions, setFlowOptions] = useState<FlowOption[]>([]);
  const [flowToSend, setFlowToSend] = useState("");
  const [saved, setSaved] = useState<SavedReply[]>([]);
  const [showProfile, setShowProfile] = useState(true);
  const [newTag, setNewTag] = useState("");
  const [assist, setAssist] = useState<Assist | null>(null);
  const [assisting, setAssisting] = useState(false);
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const { team } = useTeam();
  const bottom = useRef<HTMLDivElement>(null);

  const load = async () => {
    const data = await api<{
      contact: ContactRecord;
      messages: Message[];
      automation?: Automation;
      flows?: FlowOption[];
      assignedTo?: string | null;
    }>(`/api/inbox/${contactId}`);
    setContact(data.contact);
    setAssignedTo(data.assignedTo ?? null);
    setMessages(data.messages);
    setNotes((current) => (current === (contact.notes ?? "") ? data.contact.notes ?? "" : current));
    if (data.automation) setAutomation(data.automation);
    if (data.flows) {
      setFlowOptions(data.flows);
      setFlowToSend((current) => current || data.flows?.[0]?.id || "");
    }
  };

  useEffect(() => {
    // First refresh runs on the next tick so the effect body itself does not set state.
    const initial = setTimeout(() => void load().catch(() => undefined), 0);
    const id = setInterval(() => void load().catch(() => undefined), 4000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll is keyed by contact only
  }, [contactId]);

  useEffect(() => {
    if (!botId) return;
    const timer = setTimeout(
      () =>
        void api<{ replies: SavedReply[] }>(`/api/saved-replies?botId=${botId}`)
          .then((data) => setSaved(data.replies))
          .catch(() => undefined),
      0,
    );
    return () => clearTimeout(timer);
  }, [botId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const slashQuery = text.startsWith("/") ? text.slice(1).toLowerCase() : null;
  const slashMatches = useMemo(
    () =>
      slashQuery === null
        ? []
        : saved.filter(
            (reply) => reply.title.toLowerCase().includes(slashQuery) || reply.body.toLowerCase().includes(slashQuery),
          ),
    [saved, slashQuery],
  );

  const patchContact = async (patch: Record<string, unknown>) => {
    try {
      const data = await api<{ contact: ContactRecord }>(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setContact(data.contact);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    }
  };

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api(`/api/inbox/${contactId}/reply`, { method: "POST", body: JSON.stringify({ text }) });
      setText("");
      setAssist(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const suggest = async () => {
    setAssisting(true);
    try {
      const data = await api<{ assist: Assist }>(`/api/inbox/${contactId}/assist`, { method: "POST" });
      setAssist(data.assist);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI is unavailable");
    } finally {
      setAssisting(false);
    }
  };

  const saveAsReply = async () => {
    if (!botId || !text.trim()) return;
    const title = window.prompt("Name this saved reply", text.trim().split(/\s+/).slice(0, 4).join(" "));
    if (!title?.trim()) return;
    try {
      const data = await api<{ reply: SavedReply }>("/api/saved-replies", {
        method: "POST",
        body: JSON.stringify({ botId, title, body: text }),
      });
      setSaved((current) => [...current, data.reply].sort((a, b) => a.title.localeCompare(b.title)));
      toast.success("Saved — type / to use it");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    }
  };

  const resumeAutomation = async () => {
    try {
      await api(`/api/inbox/${contactId}/resume`, { method: "POST" });
      toast.success("Automation resumed");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resume");
    }
  };

  const sendFlow = async () => {
    if (!flowToSend) return;
    setSending(true);
    try {
      await api(`/api/inbox/${contactId}/send-flow`, { method: "POST", body: JSON.stringify({ flowId: flowToSend }) });
      toast.success("Flow sent");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send flow");
    } finally {
      setSending(false);
    }
  };

  const name = displayName(contact);
  const visibleFields = Object.entries(contact.customFields).filter(([key]) => !key.startsWith("_"));
  let lastDay = "";

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-[#e5e7eb] bg-white px-3 py-2.5 md:px-4">
          <Link href="/inbox" className="text-[#6b7280] md:hidden" aria-label="Back to conversations">
            <ArrowLeft className="size-4" />
          </Link>
          <ContactAvatar name={name} src={contact.avatarUrl} platform={contact.platform} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-[#1b1f24]">{name}</p>
            <p className="flex items-center gap-1.5 truncate text-[11px] text-[#6b7280]">
              <PlatformBadge platform={contact.platform} />
              {contact.username ? `@${contact.username}` : null}
              {automation.status === "paused" ? (
                <span className="text-amber-600">Bot paused</span>
              ) : automation.status === "active" ? (
                <span className="text-[#00a344]">In {automation.flowName ?? "a flow"}</span>
              ) : null}
            </p>
          </div>
          {team.length > 0 ? (
            <select
              aria-label="Assigned to"
              value={assignedTo ?? ""}
              onChange={(event) => {
                const memberId = event.target.value || null;
                setAssignedTo(memberId);
                void api(`/api/inbox/${contactId}/assign`, { method: "POST", body: JSON.stringify({ memberId }) }).catch(() =>
                  toast.error("Could not assign"),
                );
              }}
              className="hidden rounded-lg border border-[#e5e7eb] bg-white px-2 py-1 text-[12px] sm:block"
            >
              <option value="">Unassigned</option>
              {team.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          ) : null}
          {automation.status === "paused" ? (
            <Button variant="outline" size="sm" onClick={() => void resumeAutomation()}>
              <Play className="size-3.5" />
              <span className="hidden sm:inline">Resume bot</span>
            </Button>
          ) : null}
          <Button
            variant={contact.inboxStatus === "closed" ? "outline" : "default"}
            size="sm"
            onClick={() => void patchContact({ inboxStatus: contact.inboxStatus === "closed" ? "open" : "closed" })}
          >
            {contact.inboxStatus === "closed" ? <RotateCcw className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
            <span className="hidden sm:inline">{contact.inboxStatus === "closed" ? "Reopen" : "Done"}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden xl:inline-flex"
            aria-label="Toggle profile"
            onClick={() => setShowProfile((value) => !value)}
          >
            <PanelRight className="size-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#f4f6f8] px-3 py-4 md:px-6">
          {messages.length === 0 ? (
            <p className="text-center text-[13px] text-[#6b7280]">No messages yet.</p>
          ) : (
            messages.map((message) => {
              const day = dayLabel(message.createdAt);
              const divider = day !== lastDay;
              lastDay = day;
              return (
                <div key={message.id} className="space-y-2">
                  {divider ? (
                    <p className="py-1 text-center text-[11px] font-medium text-[#8b95a1]">{day}</p>
                  ) : null}
                  <Bubble message={message} />
                </div>
              );
            })
          )}
          <div ref={bottom} />
        </div>

        <div className="relative border-t border-[#e5e7eb] bg-white p-3">
          {slashQuery !== null ? (
            <div className="absolute right-3 bottom-full left-3 mb-2 max-h-60 overflow-y-auto rounded-xl bg-white p-1 shadow-lg ring-1 ring-[#e5e7eb]">
              {slashMatches.length === 0 ? (
                <p className="px-3 py-2 text-[12px] text-[#6b7280]">
                  {saved.length === 0 ? "No saved replies yet. Write one, then click the bookmark to save it." : "No saved reply matches."}
                </p>
              ) : (
                slashMatches.map((reply) => (
                  <button
                    key={reply.id}
                    type="button"
                    className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#f4f6f8]"
                    onClick={() => setText(reply.body)}
                  >
                    <p className="text-[13px] font-medium text-[#1b1f24]">/{reply.title}</p>
                    <p className="truncate text-[12px] text-[#6b7280]">{reply.body}</p>
                  </button>
                ))
              )}
            </div>
          ) : null}
          {assist ? (
            <div className="mb-2 space-y-1.5">
              <p className="flex items-center gap-1.5 text-[11px] text-[#6b7280]">
                <Sparkles className="size-3 text-[#d946ef]" />
                <span className="font-medium text-[#1b1f24]">{assist.intent}</span>·
                <span
                  className={cn(
                    assist.sentiment === "negative" ? "text-red-600" : assist.sentiment === "positive" ? "text-[#00a344]" : "",
                  )}
                >
                  {assist.sentiment}
                </span>
                · {assist.summary}
                <button type="button" className="ml-auto text-[#8b95a1] hover:text-[#1b1f24]" onClick={() => setAssist(null)} aria-label="Dismiss">
                  <X className="size-3" />
                </button>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {assist.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setText(suggestion)}
                    className="max-w-full rounded-xl bg-[#fdf4ff] px-2.5 py-1.5 text-left text-[12px] text-[#1b1f24] ring-1 ring-[#f0abfc] hover:bg-[#fae8ff]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={`Reply to ${contact.firstName ?? name}… (/ for saved replies)`}
              rows={2}
              className="max-h-40 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-[13px] outline-none focus:border-[#0084ff]"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (slashQuery !== null && slashMatches[0]) setText(slashMatches[0].body);
                  else void send();
                }
                if (event.key === "Escape" && slashQuery !== null) setText("");
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Suggest replies with AI"
              title="Suggest replies with AI"
              disabled={assisting}
              onClick={() => void suggest()}
            >
              <Sparkles className={cn("size-4 text-[#d946ef]", assisting && "animate-pulse")} />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Save as reply" disabled={!text.trim()} onClick={() => void saveAsReply()}>
              <BookmarkPlus className="size-4" />
            </Button>
            <Button size="icon" aria-label="Send" onClick={() => void send()} disabled={sending || !text.trim()}>
              <Send className="size-4" />
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-[#8b95a1]">
            Sending pauses the bot for {contact.firstName ?? "this person"} until you resume it.
          </p>
        </div>
      </div>

      {showProfile ? (
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-[#e5e7eb] bg-white xl:block">
          <div className="flex flex-col items-center gap-2 border-b border-[#e5e7eb] px-4 py-5 text-center">
            <ContactAvatar name={name} src={contact.avatarUrl} platform={contact.platform} className="size-14" />
            <p className="font-heading text-[15px] text-[#1b1f24]">{name}</p>
            <PlatformBadge platform={contact.platform} />
            <Link href={`/contacts/${contact.id}`} className="text-[12px] text-[#0084ff] hover:underline">
              Open full profile
            </Link>
          </div>

          <section className="space-y-2 border-b border-[#e5e7eb] p-4">
            <p className="text-[11px] font-semibold tracking-wide text-[#8b95a1] uppercase">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 rounded-full bg-[#f1ecff] px-2 py-0.5 text-[12px] text-[#5f3dc4]">
                  {tag}
                  <button
                    type="button"
                    aria-label={`Remove ${tag}`}
                    onClick={() => void patchContact({ tags: contact.tags.filter((item) => item !== tag) })}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!newTag.trim()) return;
                  void patchContact({ tags: [...contact.tags, newTag.trim()] });
                  setNewTag("");
                }}
              >
                <input
                  value={newTag}
                  onChange={(event) => setNewTag(event.target.value)}
                  placeholder="+ tag"
                  className="w-20 rounded-full border border-dashed border-[#c5cdd6] px-2 py-0.5 text-[12px] outline-none focus:border-[#7b61ff]"
                />
              </form>
            </div>
          </section>

          <section className="space-y-1.5 border-b border-[#e5e7eb] p-4 text-[13px]">
            <p className="text-[11px] font-semibold tracking-wide text-[#8b95a1] uppercase">Details</p>
            <p className="flex justify-between gap-2">
              <span className="text-[#6b7280]">Email</span>
              <span className="truncate">{contact.email ?? "—"}</span>
            </p>
            <p className="flex justify-between gap-2">
              <span className="text-[#6b7280]">Phone</span>
              <span className="truncate">{contact.phone ?? "—"}</span>
            </p>
            {visibleFields.map(([key, value]) => (
              <p key={key} className="flex justify-between gap-2">
                <span className="text-[#6b7280]">{key}</span>
                <span className="truncate">{value}</span>
              </p>
            ))}
            {(contact.subscriptions ?? []).length > 0 ? (
              <p className="flex justify-between gap-2">
                <span className="text-[#6b7280]">Lists</span>
                <span className="truncate">{contact.subscriptions?.join(", ")}</span>
              </p>
            ) : null}
            {contact.unsubscribed ? <p className="text-[12px] text-amber-600">Unsubscribed from broadcasts</p> : null}
          </section>

          <section className="space-y-2 border-b border-[#e5e7eb] p-4">
            <p className="text-[11px] font-semibold tracking-wide text-[#8b95a1] uppercase">Automation</p>
            <p className="text-[13px] text-[#1b1f24]">
              {automation.status === "paused"
                ? `Paused${automation.flowName ? ` in ${automation.flowName}` : ""}`
                : automation.status === "active"
                  ? `Running ${automation.flowName ?? "a flow"}`
                  : "Not in a flow"}
            </p>
            {flowOptions.length > 0 ? (
              <div className="flex gap-1.5">
                <select
                  aria-label="Flow to send"
                  className="min-w-0 flex-1 rounded-lg border border-[#e5e7eb] bg-white px-2 py-1 text-[12px]"
                  value={flowToSend}
                  onChange={(event) => setFlowToSend(event.target.value)}
                >
                  {flowOptions.map((flow) => (
                    <option key={flow.id} value={flow.id}>
                      {flow.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline" disabled={sending} onClick={() => void sendFlow()}>
                  Send
                </Button>
              </div>
            ) : null}
          </section>

          <section className="space-y-2 p-4">
            <p className="text-[11px] font-semibold tracking-wide text-[#8b95a1] uppercase">Notes</p>
            <textarea
              rows={4}
              value={notes}
              placeholder="Only your team sees this"
              onChange={(event) => setNotes(event.target.value)}
              onBlur={() => {
                if (notes !== (contact.notes ?? "")) void patchContact({ notes });
              }}
              className="w-full resize-none rounded-lg border border-[#e5e7eb] bg-[#fffbea] px-2.5 py-2 text-[13px] outline-none focus:border-[#ffb800]"
            />
          </section>
        </aside>
      ) : null}
    </div>
  );
}
