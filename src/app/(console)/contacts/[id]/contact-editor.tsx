"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client";
import { displayName } from "@/lib/lead-capture";
import type { ContactRecord } from "@/lib/types";

type Field = { id: string; key: string; label: string };
type Tag = { id: string; name: string };

export function ContactEditor({
  botId,
  initialContact,
  initialFields,
  initialTags,
}: {
  botId: string;
  initialContact: ContactRecord;
  initialFields: Field[];
  initialTags: Tag[];
}) {
  const [contact, setContact] = useState(initialContact);
  const [fields, setFields] = useState(initialFields);
  const [tags, setTags] = useState(initialTags);
  const [form, setForm] = useState({
    firstName: initialContact.firstName ?? "",
    lastName: initialContact.lastName ?? "",
    email: initialContact.email ?? "",
    phone: initialContact.phone ?? "",
  });
  const [custom, setCustom] = useState(initialContact.customFields);
  const [newField, setNewField] = useState({ key: "", label: "" });
  const [notes, setNotes] = useState(initialContact.notes ?? "");

  const load = async () => {
    const data = await api<{ contact: ContactRecord }>(`/api/contacts/${contact.id}`);
    setContact(data.contact);
    setForm({
      firstName: data.contact.firstName ?? "",
      lastName: data.contact.lastName ?? "",
      email: data.contact.email ?? "",
      phone: data.contact.phone ?? "",
    });
    setCustom(data.contact.customFields);
    setNotes(data.contact.notes ?? "");
    const [fieldData, tagData] = await Promise.all([
      api<{ fields: Field[] }>(`/api/fields?botId=${botId}`),
      api<{ tags: Tag[] }>(`/api/tags?botId=${botId}`),
    ]);
    setFields(fieldData.fields);
    setTags(tagData.tags);
  };

  const save = async () => {
    try {
      await api(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...form, customFields: custom, notes }),
      });
      await load();
      toast.success("Contact saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    }
  };

  const toggleTag = async (tag: Tag) => {
    try {
      if (contact.tags.includes(tag.name)) {
        await api(`/api/contacts/${contact.id}/tags?tagId=${tag.id}`, { method: "DELETE" });
      } else {
        await api(`/api/contacts/${contact.id}/tags`, {
          method: "POST",
          body: JSON.stringify({ tagId: tag.id }),
        });
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tag update failed");
    }
  };

  const addField = async () => {
    try {
      await api("/api/fields", {
        method: "POST",
        body: JSON.stringify({ botId, ...newField }),
      });
      setNewField({ key: "", label: "" });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add field");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl tracking-tight">{displayName(contact)}</h1>
          <p className="text-sm text-muted-foreground">
            tg {contact.telegramUserId}
            {contact.username ? ` · @${contact.username}` : ""}
          </p>
        </div>
        <Button render={<Link href={`/inbox/${contact.id}`} />} variant="outline">
          Open thread
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CRM fields</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>First name</Label>
            <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Last name</Label>
            <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          {fields.map((field) => (
            <div key={field.id} className="space-y-1">
              <Label>{field.label}</Label>
              <Input
                value={custom[field.key] ?? ""}
                onChange={(e) => setCustom({ ...custom, [field.key]: e.target.value })}
              />
            </div>
          ))}
          <div className="space-y-1 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Internal note"
            />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={() => void save()}>Save contact</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button key={tag.id} type="button" onClick={() => void toggleTag(tag)}>
              <Badge variant={contact.tags.includes(tag.name) ? "default" : "outline"}>{tag.name}</Badge>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add custom field</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="key (company)"
            value={newField.key}
            onChange={(e) => setNewField({ ...newField, key: e.target.value })}
          />
          <Input
            placeholder="Label"
            value={newField.label}
            onChange={(e) => setNewField({ ...newField, label: e.target.value })}
          />
          <Button variant="secondary" onClick={() => void addField()}>
            Add field
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
