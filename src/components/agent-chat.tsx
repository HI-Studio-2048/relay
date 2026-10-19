"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { CanvasCard } from "@/components/chrome/tone";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";

type DraftLink = { kind: "flow" | "broadcast"; id: string; name: string; href: string; botName: string };

type ChatMessage = {
  id: string;
  role: string;
  body: string;
  meta?: { drafts?: DraftLink[] };
};

type AgentEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "draft"; draft: DraftLink }
  | { type: "error"; error: string }
  | { type: "done" };

function DraftLinks({ drafts }: { drafts: DraftLink[] }) {
  if (drafts.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {drafts.map((draft) => (
        <Link
          key={draft.id}
          href={draft.href}
          className="rounded-full bg-white px-2.5 py-1 text-[12px] font-medium text-[#0084ff] ring-1 ring-[#d6e6ff] hover:bg-[#f4f8ff]"
        >
          Open {draft.kind === "flow" ? "draft flow" : "broadcast draft"} · {draft.name}
        </Link>
      ))}
    </div>
  );
}

/** Overview growth agent. Drafts only: the user turns flows on and confirms broadcasts. */
export function AgentChat({ initialConfigured = null }: { initialConfigured?: boolean | null }) {
  // The server only knows about its own key when it renders this. An OpenRouter key saved on one of
  // the login's accounts also counts, so a false here waits for /api/agent to answer.
  const [configured, setConfigured] = useState<boolean | null>(initialConfigured === true ? true : null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [drafts, setDrafts] = useState<DraftLink[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      void api<{ configured: boolean; messages: ChatMessage[] }>("/api/agent")
        .then((data) => {
          setConfigured(data.configured);
          setMessages(data.messages);
          setDrafts(data.messages.flatMap((message) => message.meta?.drafts ?? []));
        })
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load the agent"));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, status, drafts]);

  const send = async () => {
    const message = text.trim();
    if (!message || busy || configured === false) return;
    setText("");
    setError("");
    setBusy(true);
    setStatus("Thinking…");
    const localId = `local-${Date.now()}`;
    const replyId = `${localId}-reply`;
    setMessages((current) => [...current, { id: localId, role: "user", body: message }, { id: replyId, role: "assistant", body: "" }]);
    let accepted = false;
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "The agent could not answer");
      }
      accepted = true;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const apply = (event: AgentEvent) => {
        if (event.type === "status") setStatus(event.text);
        if (event.type === "delta") {
          setStatus("");
          setMessages((current) =>
            current.map((item) => (item.id === replyId ? { ...item, body: item.body + event.text } : item)),
          );
        }
        if (event.type === "draft") setDrafts((current) => [...current, event.draft]);
        if (event.type === "error") throw new Error(event.error);
      };
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((item) => item.startsWith("data: "));
          if (!line) continue;
          apply(JSON.parse(line.slice(6)) as AgentEvent);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The agent could not answer");
      if (accepted) {
        // The question was saved; only drop the empty answer bubble.
        setMessages((current) => current.filter((item) => item.id !== replyId || item.body));
      } else {
        // Refused before anything was saved (rate limit, not set up): take it back out and keep the text.
        setMessages((current) => current.filter((item) => item.id !== localId && item.id !== replyId));
        setText(message);
      }
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  return (
    <CanvasCard className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 font-heading text-[15px] text-[#1b1f24]">
            <Sparkles className="size-4 text-[#d946ef]" />
            Growth agent
          </p>
          <p className="mt-1 max-w-2xl text-[12px] text-[#6b7280]">
            Ask it to draft a flow or look across every channel. It only saves drafts. Turning a flow on or confirming a broadcast stays with you.
          </p>
        </div>
      </div>
      {configured === false ? (
        <p className="rounded-xl bg-[#f8fafc] px-3 py-2 text-[13px] text-[#1b1f24] ring-1 ring-[#e5e7eb]">
          The growth agent needs a model key. Save an OpenRouter key on the{" "}
          <Link href="/ai" className="font-medium text-[#0084ff] hover:underline">
            AI assistant
          </Link>{" "}
          page, then reload this one.
        </p>
      ) : (
        <>
          <div ref={listRef} className="max-h-80 space-y-2 overflow-y-auto rounded-xl bg-[#f8fafc] p-3">
            {messages.length === 0 ? (
              <p className="text-[13px] text-[#6b7280]">
                Try “Build a flow that collects name, email, and phone” or “How do I convert the leads?”
              </p>
            ) : (
              messages.map((message) => (
                <div key={message.id} className={message.role === "user" ? "text-right" : ""}>
                  <p
                    className={
                      message.role === "user"
                        ? "inline-block max-w-[90%] rounded-2xl bg-[#1b1f24] px-3 py-2 text-left text-[13px] whitespace-pre-wrap text-white"
                        : "inline-block max-w-[90%] rounded-2xl bg-white px-3 py-2 text-left text-[13px] whitespace-pre-wrap text-[#1b1f24] ring-1 ring-[#e5e7eb]"
                    }
                  >
                    {message.body || (busy ? "…" : "")}
                  </p>
                </div>
              ))
            )}
            {status ? <p className="text-[12px] text-[#6b7280]">{status}</p> : null}
          </div>
          <DraftLinks drafts={drafts.slice(-6)} />
          {error ? <p className="text-[12px] text-red-600">{error}</p> : null}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Ask the agent…"
              aria-label="Message the growth agent"
              disabled={configured === null || busy}
              className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-[13px] outline-none placeholder:text-[#8b95a1] focus:border-[#0084ff]"
            />
            <Button type="submit" disabled={configured === null || busy || !text.trim()}>
              Send
            </Button>
          </form>
        </>
      )}
    </CanvasCard>
  );
}
