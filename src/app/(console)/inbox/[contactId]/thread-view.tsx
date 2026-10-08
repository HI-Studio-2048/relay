"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CHANNELS } from "@/lib/channels/types";
import { api } from "@/lib/client";
import { initials } from "@/lib/inbox";
import { displayName } from "@/lib/lead-capture";
import { cn } from "@/lib/utils";
import type { ContactRecord } from "@/lib/types";
import { useInbox } from "../inbox-shell";

type Message = {
  id: string;
  direction: string;
  source: string;
  body: string;
  createdAt: string;
};

type Automation = { status: "active" | "paused" | "completed" | "idle"; flowId: string | null; flowName: string | null };
type FlowOption = { id: string; name: string };
type Tag = { id: string; name: string };
type Field = { key: string; label: string };

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function ThreadView({
  botId,
  contactId,
  initialContact,
  initialMessages,
  initialTags,
  initialFields,
}: {
  botId: string;
  contactId: string;
  initialContact: ContactRecord;
  initialMessages: Message[];
  initialTags: Tag[];
  initialFields: Field[];
}) {
  const { goTo, refresh: refreshList, channel } = useInbox();
  const [contact, setContact] = useState(initialContact);
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [notes, setNotes] = useState(initialContact.notes ?? "");
  const [sending, setSending] = useState(false);
  const [automation, setAutomation] = useState<Automation>({ status: "idle", flowId: null, flowName: null });
  const [flowOptions, setFlowOptions] = useState<FlowOption[]>([]);
  const [flowToSend, setFlowToSend] = useState("");
  const [tags, setTags] = useState(initialTags);
  const [newTag, setNewTag] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const savedNotes = useRef(initialContact.notes ?? "");

  const load = async () => {
    const data = await api<{
      contact: ContactRecord;
      messages: Message[];
      automation?: Automation;
      flows?: FlowOption[];
    }>(`/api/inbox/${contactId}`);
    setContact(data.contact);
    setMessages(data.messages);
    // Only replace the note if the agent is not mid-edit.
    setNotes((current) => (current === savedNotes.current ? (data.contact.notes ?? "") : current));
    savedNotes.current = data.contact.notes ?? "";
    if (data.automation) setAutomation(data.automation);
    if (data.flows) {
      setFlowOptions(data.flows);
      setFlowToSend((current) => current || data.flows?.[0]?.id || "");
    }
  };

  useEffect(() => {
    const initial = setTimeout(() => void load().catch(() => undefined), 0);
    const id = setInterval(() => void load().catch(() => undefined), 4000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    // Land in the composer so a reply is one keystroke away after ↑/↓.
    composer.current?.focus();
  }, [contactId]);

  const run = async (work: () => Promise<unknown>, failure: string) => {
    try {
      await work();
      await load();
      void refreshList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failure);
    }
  };

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api(`/api/inbox/${contactId}/reply`, { method: "POST", body: JSON.stringify({ text }) });
      setText("");
      await load();
      void refreshList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const setStatus = (inboxStatus: "open" | "closed") =>
    run(
      () => api(`/api/contacts/${contact.id}`, { method: "PATCH", body: JSON.stringify({ inboxStatus }) }),
      "Update failed",
    );

  const closeAndNext = async () => {
    await setStatus("closed");
    if (!goTo(1)) toast.message("Queue clear — no more open conversations");
  };

  const sendFlow = () =>
    run(
      () => api(`/api/inbox/${contactId}/send-flow`, { method: "POST", body: JSON.stringify({ flowId: flowToSend }) }),
      "Could not send flow",
    );

  const toggleTag = async (tag: Tag) => {
    const has = contact.tags.includes(tag.name);
    await run(
      () =>
        has
          ? api(`/api/contacts/${contact.id}/tags?tagId=${tag.id}`, { method: "DELETE" })
          : api(`/api/contacts/${contact.id}/tags`, { method: "POST", body: JSON.stringify({ tagId: tag.id }) }),
      "Tag update failed",
    );
  };

  const addTag = async () => {
    const name = newTag.trim().toLowerCase();
    if (!name) return;
    await run(async () => {
      let tag = tags.find((item) => item.name === name);
      if (!tag) {
        const created = await api<{ tag: Tag }>("/api/tags", { method: "POST", body: JSON.stringify({ botId, name }) });
        tag = created.tag;
        const added = created.tag;
        setTags((current) => [...current, added]);
      }
      await api(`/api/contacts/${contact.id}/tags`, { method: "POST", body: JSON.stringify({ tagId: tag.id }) });
      setNewTag("");
    }, "Could not add tag");
  };

  const saveNotes = () => {
    if (notes === savedNotes.current) return;
    void run(() => api(`/api/contacts/${contact.id}`, { method: "PATCH", body: JSON.stringify({ notes }) }), "Could not save note");
  };

  const name = displayName(contact);
  const closed = contact.inboxStatus === "closed";

  return (
    <div className="relative flex min-h-0 flex-1">
      {/* Thread */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f8fa]">
        <header className="flex items-center gap-3 border-b border-[#e5e7eb] bg-white px-4 py-2.5">
          <Link href="/inbox" className="text-xs text-[#6b7280] hover:text-[#1b1f24] lg:hidden">
            ← All
          </Link>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#eef1f4] text-xs font-semibold">
            {initials(name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[#1b1f24]">{name}</p>
            <p className="flex items-center gap-1.5 truncate text-[11px] text-[#6b7280]">
              <span className="inline-block size-1.5 rounded-full" style={{ background: CHANNELS[channel].color }} />
              {CHANNELS[channel].label}
              {contact.username ? ` · @${contact.username}` : ""}
              {automation.status === "paused"
                ? ` · Automation paused${automation.flowName ? ` in ${automation.flowName}` : ""}`
                : automation.status === "active"
                  ? ` · In flow${automation.flowName ? ` ${automation.flowName}` : ""}`
                  : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {automation.status === "paused" ? (
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => void run(() => api(`/api/inbox/${contactId}/resume`, { method: "POST" }), "Could not resume")}
              >
                Resume automation
              </Button>
            ) : null}
            {closed ? (
              <Button variant="outline" size="sm" type="button" onClick={() => void setStatus("open")}>
                Reopen
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" type="button" onClick={() => void setStatus("closed")}>
                  Close
                </Button>
                <Button size="sm" type="button" onClick={() => void closeAndNext()}>
                  Close &amp; next
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="xl:hidden"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((value) => !value)}
            >
              Details
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <p className="text-sm text-[#6b7280]">No messages in this thread yet.</p>
          ) : (
            messages.map((message, index) => {
              const previous = messages[index - 1];
              const showDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
              const outbound = message.direction === "outbound";
              return (
                <div key={message.id}>
                  {showDay ? (
                    <p className="my-3 text-center text-[10px] font-medium tracking-wide text-[#8b95a1] uppercase">
                      {dayLabel(message.createdAt)}
                    </p>
                  ) : null}
                  <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.06)]",
                        outbound ? "rounded-br-md bg-[#0084ff] text-white" : "rounded-bl-md bg-white text-[#1b1f24]",
                      )}
                    >
                      <p className="break-words whitespace-pre-wrap">{message.body}</p>
                      <p className={cn("mt-1 text-[10px]", outbound ? "text-white/70" : "text-[#8b95a1]")}>
                        {outbound ? (message.source === "agent" ? "You" : message.source) : name} ·{" "}
                        {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottom} />
        </div>

        <div className="border-t border-[#e5e7eb] bg-white p-3">
          <Textarea
            ref={composer}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`Reply on ${CHANNELS[channel].label}…  (Enter to send)`}
            rows={2}
            className="resize-none"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {flowOptions.length > 0 ? (
              <div className="flex items-center gap-1">
                <select
                  aria-label="Flow to send"
                  className="h-7 rounded-lg border border-input bg-background px-2 text-xs"
                  value={flowToSend}
                  onChange={(event) => setFlowToSend(event.target.value)}
                >
                  {flowOptions.map((flow) => (
                    <option key={flow.id} value={flow.id}>
                      {flow.name}
                    </option>
                  ))}
                </select>
                <Button variant="outline" size="sm" type="button" disabled={sending} onClick={() => void sendFlow()}>
                  Send flow
                </Button>
              </div>
            ) : null}
            <span className="ml-auto text-[11px] text-[#8b95a1]">Replying pauses automation for this contact</span>
            <Button onClick={() => void send()} disabled={sending || !text.trim()} size="sm">
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </div>

      {/* Contact panel */}
      <aside
        className={cn(
          "w-[300px] shrink-0 overflow-y-auto border-l border-[#e5e7eb] bg-white xl:block",
          detailsOpen ? "absolute inset-y-0 right-0 z-10 max-w-[90%] shadow-lg xl:static xl:max-w-none xl:shadow-none" : "hidden",
        )}
      >
        <div className="space-y-5 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-[#eaf3ff] text-sm font-semibold text-[#0084ff]">
              {initials(name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-[#1b1f24]">{name}</p>
              <p className="truncate text-[11px] text-[#6b7280]">
                {closed ? "Closed" : "Open"} · {CHANNELS[channel].label} id {contact.telegramUserId}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              className="xl:hidden"
              aria-label="Close details"
              onClick={() => setDetailsOpen(false)}
            >
              <X />
            </Button>
          </div>

          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-[#6b7280]">Email</dt>
              <dd className="truncate text-right">{contact.email ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[#6b7280]">Phone</dt>
              <dd className="truncate text-right">{contact.phone ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[#6b7280]">Subscribed</dt>
              <dd className="text-right">{contact.unsubscribed ? "No (opted out)" : "Yes"}</dd>
            </div>
            {initialFields.map((field) => (
              <div key={field.key} className="flex justify-between gap-2">
                <dt className="truncate text-[#6b7280]">{field.label}</dt>
                <dd className="truncate text-right">{contact.customFields[field.key] || "—"}</dd>
              </div>
            ))}
          </dl>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b95a1] uppercase">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {tags.length === 0 ? <p className="text-xs text-[#6b7280]">No tags yet.</p> : null}
              {tags.map((tag) => {
                const on = contact.tags.includes(tag.name);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => void toggleTag(tag)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs",
                      on ? "border-[#0084ff] bg-[#eaf3ff] text-[#0084ff]" : "border-[#e5e7eb] text-[#6b7280] hover:bg-[#f7f8fa]",
                    )}
                  >
                    #{tag.name}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-1.5">
              <Input
                value={newTag}
                placeholder="New tag"
                onChange={(event) => setNewTag(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addTag();
                  }
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={() => void addTag()} disabled={!newTag.trim()}>
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b95a1] uppercase">Notes</p>
            <Textarea
              rows={4}
              value={notes}
              placeholder="Internal note — never sent to the contact"
              onChange={(event) => setNotes(event.target.value)}
              onBlur={saveNotes}
            />
          </div>

          <Button render={<Link href={`/contacts/${contact.id}`} />} variant="outline" size="sm" className="w-full">
            Open full CRM record
          </Button>
        </div>
      </aside>
    </div>
  );
}
