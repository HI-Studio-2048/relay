"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client";
import { RULE_ACTIONS, RULE_TRIGGERS, type RuleAction, type RuleTrigger } from "@/lib/rule-types";

export function CreateRuleForm({
  botId,
  sequences,
  tags,
  flows,
}: {
  botId: string;
  sequences: string[];
  tags: string[];
  flows: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<RuleTrigger>("tag_applied");
  const [triggerValue, setTriggerValue] = useState(tags[0] ?? "lead");
  const [actionType, setActionType] = useState<RuleAction>("subscribe_sequence");
  const [actionValue, setActionValue] = useState(sequences[0] ?? "");
  const [busy, setBusy] = useState(false);

  const trigger = RULE_TRIGGERS.find((item) => item.value === triggerType)!;
  const action = RULE_ACTIONS.find((item) => item.value === actionType)!;

  const suggestionsFor = (kind: string): string[] => {
    if (kind === "Tag name") return tags;
    if (kind === "Sequence name") return sequences;
    return [];
  };

  const onActionType = (next: RuleAction) => {
    setActionType(next);
    const meta = RULE_ACTIONS.find((item) => item.value === next)!;
    if (meta.valueLabel === "Flow") setActionValue(flows[0]?.id ?? "");
    else if (meta.valueLabel === "Sequence name") setActionValue(sequences[0] ?? "");
    else if (meta.valueLabel === "Tag name") setActionValue(tags[0] ?? "");
    else setActionValue("");
  };

  const save = async () => {
    if (!name.trim() || !actionValue.trim()) return;
    setBusy(true);
    try {
      await api("/api/rules", {
        method: "POST",
        body: JSON.stringify({ botId, name, triggerType, triggerValue: triggerType === "contact_created" ? "" : triggerValue, actionType, actionValue }),
      });
      toast.success("Rule created");
      setName("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create rule");
    } finally {
      setBusy(false);
    }
  };

  const select = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";

  return (
    <div className="grid gap-3 lg:grid-cols-6">
      <div className="space-y-1">
        <Label>Name</Label>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Lead → welcome drip" />
      </div>
      <div className="space-y-1">
        <Label>When</Label>
        <select className={select} value={triggerType} onChange={(event) => setTriggerType(event.target.value as RuleTrigger)}>
          {RULE_TRIGGERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className={trigger.value === "contact_created" ? "hidden" : "space-y-1"}>
        <Label>{trigger.valueLabel}</Label>
        <Input
          list="relay-rule-trigger-values"
          value={trigger.value === "contact_created" ? "" : triggerValue}
          onChange={(event) => setTriggerValue(event.target.value)}
          placeholder={
            trigger.value === "goal_reached"
              ? "Any goal"
              : trigger.valueLabel === "Field key"
                ? "company"
                : trigger.valueLabel === "List name"
                  ? "newsletter"
                  : "lead (empty = any)"
          }
        />
        <datalist id="relay-rule-trigger-values">
          {suggestionsFor(trigger.valueLabel).map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </div>
      <div className="space-y-1">
        <Label>Then</Label>
        <select className={select} value={actionType} onChange={(event) => onActionType(event.target.value as RuleAction)}>
          {RULE_ACTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label>{action.valueLabel}</Label>
        {action.valueLabel === "Flow" ? (
          <select className={select} value={actionValue} onChange={(event) => setActionValue(event.target.value)}>
            {flows.length === 0 ? <option value="">No flows yet</option> : null}
            {flows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.name}
              </option>
            ))}
          </select>
        ) : (
          <>
            <Input
              list="relay-rule-action-values"
              value={actionValue}
              onChange={(event) => setActionValue(event.target.value)}
              placeholder={action.valueLabel === "Message" ? "New lead: {{name}} {{email}}" : action.valueLabel === "Sequence name" ? "welcome_drip" : "vip"}
            />
            <datalist id="relay-rule-action-values">
              {suggestionsFor(action.valueLabel).map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </>
        )}
      </div>
      <div className="flex items-end">
        <Button type="button" onClick={() => void save()} disabled={busy || !actionValue.trim()}>
          {busy ? "Saving…" : "Create rule"}
        </Button>
      </div>
    </div>
  );
}
