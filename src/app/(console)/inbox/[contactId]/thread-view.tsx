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
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = async () => {
    const data = await api<{ contact: ContactRecord; messages: Message[] }>(
      `/api/inbox/${contactId}`,
    );
    setContact(data.contact);
    setMessages(data.messages);
  };

  useEffect(() => {
    const id = setInterval(() => void load().catch(() => undefined), 4000);
    return () => clearInterval(id);
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
          </p>
        </div>
        <Button render={<Link href={`/contacts/${contact.id}`} />} variant="outline" size="sm">
          CRM
        </Button>
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
    </div>
  );
}
