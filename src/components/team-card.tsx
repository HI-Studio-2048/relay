"use client";

import { useState } from "react";
import { Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/chrome/panel";
import { useTeam } from "@/components/use-team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";

/** Settings card: who answers in Live Chat. AI hand-offs are assigned to whoever has the fewest open chats. */
export function TeamCard() {
  const { team, me, setMe, reload } = useTeam();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const add = async () => {
    try {
      const data = await api<{ member: { id: string } }>("/api/team", { method: "POST", body: JSON.stringify({ name, email }) });
      if (!me) setMe(data.member.id);
      setName("");
      setEmail("");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add");
    }
  };

  return (
    <Panel tone="input" icon={UsersRound} label="Team" title="Who answers in Live Chat">
      <ul className="divide-y divide-[#f0f2f4] text-[13px]">
        {team.map((member) => (
          <li key={member.id} className="flex items-center gap-2 py-2">
            <span className="flex size-7 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: member.color }}>
              {member.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="flex-1">
              <span className="font-medium text-[#1b1f24]">{member.name}</span>
              {member.email ? <span className="ml-1.5 text-[#6b7280]">{member.email}</span> : null}
              {me === member.id ? <span className="ml-1.5 rounded-full bg-[#eef6ff] px-1.5 text-[11px] text-[#0b63c5]">you</span> : null}
            </span>
            {me !== member.id ? (
              <Button size="sm" variant="ghost" onClick={() => setMe(member.id)}>
                This is me
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove ${member.name}`}
              onClick={() => {
                if (!window.confirm(`Remove ${member.name}? Their conversations become unassigned.`)) return;
                void api(`/api/team/${member.id}`, { method: "DELETE" }).then(() => {
                  if (me === member.id) setMe(null);
                  return reload();
                });
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Input className="w-40" value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" />
        <Input className="w-56" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email (optional)" />
        <Button onClick={() => void add()} disabled={!name.trim()}>
          Add teammate
        </Button>
      </div>
      <p className="text-[12px] text-[#6b7280]">
        Everyone shares one login; each person picks their name once per browser. Replies show who sent them, answering an
        unassigned chat claims it, and AI hand-offs go to whoever has the fewest open conversations.
      </p>
    </Panel>
  );
}
