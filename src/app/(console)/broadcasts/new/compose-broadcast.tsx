"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client";

type Tag = { id: string; name: string };

export function ComposeBroadcast({
  botId,
  initialTags,
  initialAudience,
  initialEveryone,
}: {
  botId: string;
  initialTags: Tag[];
  initialAudience: number;
  /** Everyone who has not unsubscribed. */
  initialEveryone: number;
}) {
  const [tags] = useState(initialTags);
  const [mode, setMode] = useState<"all" | "tag">("all");
  const [tagId, setTagId] = useState(initialTags[0]?.id ?? "");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [audience, setAudience] = useState(initialAudience);
  const shown = mode === "all" ? initialEveryone : audience;

  const onTag = async (next: string) => {
    setTagId(next);
    try {
      const data = await api<{ contacts: unknown[] }>(`/api/contacts?botId=${botId}&tagId=${next}`);
      setAudience(data.contacts.length);
    } catch {
      setAudience(0);
    }
  };

  const create = async () => {
    try {
      const data = await api<{ broadcast: { id: string } }>("/api/broadcasts", {
        method: "POST",
        body: JSON.stringify({ botId, audience: mode, tagId: mode === "tag" ? tagId : null, name, text }),
      });
      window.location.href = `/broadcasts/${data.broadcast.id}`;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create draft");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="font-heading text-3xl tracking-tight">Compose broadcast</h1>
        <p className="text-sm text-muted-foreground">
          Send to everyone who is subscribed, or narrow it to one tag. This step only saves a draft — send is a
          separate confirm.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Audience and copy</CardTitle>
          <CardDescription>
            {shown} contact{shown === 1 ? "" : "s"} will receive this. Unsubscribed contacts are always skipped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Audience</Label>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm">
                <input type="radio" name="audience" checked={mode === "all"} onChange={() => setMode("all")} />
                Everyone ({initialEveryone})
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm">
                <input
                  type="radio"
                  name="audience"
                  checked={mode === "tag"}
                  disabled={tags.length === 0}
                  onChange={() => setMode("tag")}
                />
                Contacts with a tag
              </label>
            </div>
          </div>
          {mode === "tag" ? (
            <div className="space-y-1">
              <Label>Tag</Label>
              <select
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={tagId}
                onChange={(e) => void onTag(e.target.value)}
              >
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label>Internal name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="April follow-up" />
          </div>
          <div className="space-y-1">
            <Label>Message</Label>
            <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Formatting: **bold**, __italic__, ~~strike~~, `code`, [link](https://…). Variables: {"{{name}}"},{" "}
              {"{{email}}"}, {"{{field:key}}"}.
            </p>
          </div>
          <Button onClick={() => void create()} disabled={(mode === "tag" && !tagId) || !text.trim()}>
            Save draft for confirm
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
