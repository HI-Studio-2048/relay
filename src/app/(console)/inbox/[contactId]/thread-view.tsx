"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
};

type Automation = { status: "active" | "paused" | "completed" | "idle"; flowId: string | null; flowName: string | null };

type FlowOption = { id: string; name: string };

export function ThreadView({
  contactId,
  initialContact,
  initialMessages,
}: {
  contactId: string;
  initialContact: ContactRecord;
  initialMessages: Message[];
}) {
  const [contact, setContact] = useState(initialContact);
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [notes, setNotes] = useState(initialContact.notes ?? "");
  const [sending, setSending] = useState(false);
  const [automation, setAutomation] = useState<Automation>({ status: "idle", flowId: null, flowName: null });
  const [flowOptions, setFlowOptions] = useState<FlowOption[]>([]);
  const [flowToSend, setFlowToSend] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const load = async () => {
    const data = await api<{
      contact: ContactRecord;
      messages: Message[];
      automation?: Automation;
      flows?: FlowOption[];
    }>(`/api/inbox/${contactId}`);
    setContact(data.contact);
    setMessages(data.messages);
    setNotes(data.contact.notes ?? "");
    if (data.automation) setAutomation(data.automation);
    if (data.flows) {
      setFlowOptions(data.flows);
      setFlowToSend((current) => current || data.flows?.[0]?.id || "");
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
      await api(`/api/inbox/${contactId}/send-flow`, {
        method: "POST",
        body: JSON.stringify({ flowId: flowToSend }),
      });
      toast.success("Flow sent");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send flow");
    } finally {
      setSending(false);
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
  }, [contactId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api(`/api/inbox/${contactId}/reply`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setText("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl tracking-tight">{displayName(contact)}</h1>
          <p className="text-xs text-muted-foreground">
            {contact.email ?? "No email"} · {contact.phone ?? "No phone"}
            {automation.status === "paused"
              ? ` · Automation paused${automation.flowName ? ` in ${automation.flowName}` : ""}`
              : automation.status === "active"
                ? ` · In flow${automation.flowName ? ` ${automation.flowName}` : ""}`
                : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {automation.status === "paused" ? (
            <Button variant="outline" size="sm" type="button" onClick={() => void resumeAutomation()}>
              Resume automation
            </Button>
          ) : null}
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
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() =>
              void api(`/api/contacts/${contact.id}`, {
                method: "PATCH",
                body: JSON.stringify({ inboxStatus: contact.inboxStatus === "closed" ? "open" : "closed" }),
              })
                .then(() => load())
                .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Update failed"))
            }
          >
            {contact.inboxStatus === "closed" ? "Reopen" : "Close"}
          </Button>
          <Button render={<Link href={`/contacts/${contact.id}`} />} variant="outline" size="sm">
            CRM
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl p-3 ring-1 ring-foreground/10">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages in this thread yet.</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                message.direction === "outbound"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-muted",
              )}
            >
              <p className="whitespace-pre-wrap">{message.body}</p>
              <p className="mt-1 text-[10px] opacity-70">
                {message.source} · {new Date(message.createdAt).toLocaleTimeString()}
              </p>
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Reply as HI Studio…"
          rows={2}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <Button onClick={() => void send()} disabled={sending || !text.trim()}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Notes</p>
        <Textarea
          rows={2}
          value={notes}
          placeholder="Internal note — not sent to Telegram"
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => {
            if (notes === (contact.notes ?? "")) return;
            void api(`/api/contacts/${contact.id}`, {
              method: "PATCH",
              body: JSON.stringify({ notes }),
            })
              .then(() => load())
              .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not save note"));
          }}
        />
      </div>
    </div>
  );
}
