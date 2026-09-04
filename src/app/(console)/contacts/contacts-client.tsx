"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useBot } from "@/components/bot-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";
import { displayName } from "@/lib/lead-capture";
import type { ContactRecord } from "@/lib/types";

type Tag = { id: string; name: string; color: string };

export function ContactsClient({
  initialBotId,
  initialContacts,
  initialTags,
}: {
  initialBotId: string | null;
  initialContacts: ContactRecord[];
  initialTags: Tag[];
}) {
  const { botId: selectedBotId } = useBot();
  const botId = selectedBotId ?? initialBotId;
  const [contacts, setContacts] = useState<ContactRecord[]>(initialContacts);
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState("");
  const [loading, setLoading] = useState(false);
  const [newTag, setNewTag] = useState("");

  const load = async () => {
    if (!botId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ botId });
      if (query) params.set("q", query);
      if (tagId) params.set("tagId", tagId);
      const [contactData, tagData] = await Promise.all([
        api<{ contacts: ContactRecord[] }>(`/api/contacts?${params}`),
        api<{ tags: Tag[] }>(`/api/tags?botId=${botId}`),
      ]);
      setContacts(contactData.contacts.filter(Boolean) as ContactRecord[]);
      setTags(tagData.tags);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load contacts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedBotId || selectedBotId === initialBotId) return;
    void load();
  }, [selectedBotId, tagId]);

  const addTag = async () => {
    if (!botId || !newTag.trim()) return;
    try {
      await api("/api/tags", {
        method: "POST",
        body: JSON.stringify({ botId, name: newTag }),
      });
      setNewTag("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add tag");
    }
  };

  if (!botId) {
    return <p className="text-sm text-muted-foreground">Connect a bot to see contacts.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Upserted on /start and inbound messages. Export includes CRM fields.
          </p>
        </div>
        <Button render={<a href={`/api/contacts/export?botId=${botId}`} />} variant="outline">
          Export CSV
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Search name, username, email, phone"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void load();
          }}
        />
        <select
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          value={tagId}
          onChange={(event) => setTagId(event.target.value)}
        >
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={() => void load()}>
          Search
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-48"
          placeholder="New tag"
          value={newTag}
          onChange={(event) => setNewTag(event.target.value)}
        />
        <Button variant="secondary" onClick={() => void addTag()}>
          Add tag
        </Button>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!loading && contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No contacts yet. Message the bot with /start or wait for inbound traffic.
        </p>
      ) : (
        <div className="divide-y rounded-xl ring-1 ring-foreground/10">
          {contacts.map((contact) => (
            <Link
              key={contact.id}
              href={`/contacts/${contact.id}`}
              className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{displayName(contact)}</p>
                <p className="text-xs text-muted-foreground">
                  {contact.email ?? "No email"} · {contact.phone ?? "No phone"}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {contact.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
