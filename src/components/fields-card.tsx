"use client";

import { useCallback, useEffect, useState } from "react";
import { ListTree } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/chrome/panel";
import { api } from "@/lib/client";

type Field = { id: string; key: string; label: string; contacts: number; flows: number };

/** Settings → Fields: every custom field, where it is used, rename the label or delete it. */
export function FieldsCard({ botId }: { botId: string }) {
  const [fields, setFields] = useState<Field[] | null>(null);

  const load = useCallback(() => {
    api<{ fields: Field[] }>(`/api/fields?botId=${botId}&usage=1`)
      .then((data) => setFields(data.fields.sort((a, b) => a.key.localeCompare(b.key))))
      .catch(() => setFields([]));
  }, [botId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const rename = async (field: Field, label: string) => {
    if (!label.trim() || label === field.label) return;
    try {
      await api(`/api/fields/${field.id}`, { method: "PATCH", body: JSON.stringify({ label }) });
      setFields((current) => (current ?? []).map((item) => (item.id === field.id ? { ...item, label } : item)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename");
    }
  };

  const remove = async (field: Field) => {
    const warning = field.flows ? ` It is used in ${field.flows} flow${field.flows === 1 ? "" : "s"}.` : "";
    if (!window.confirm(`Delete “${field.key}” and its value on ${field.contacts} contact${field.contacts === 1 ? "" : "s"}?${warning}`)) return;
    try {
      await api(`/api/fields/${field.id}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) });
      setFields((current) => (current ?? []).filter((item) => item.id !== field.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    }
  };

  return (
    <Panel tone="input" icon={ListTree} label="Fields" title="Custom fields on your contacts">
      {fields === null ? (
        <p className="text-[13px] text-[#6b7280]">Loading…</p>
      ) : fields.length === 0 ? (
        <p className="text-[13px] text-[#6b7280]">No custom fields yet. User input steps, lead forms, Set field and CSV import create them.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] font-semibold tracking-wide text-[#8b95a1] uppercase">
                <th className="py-1.5">Key</th>
                <th className="py-1.5">Label</th>
                <th className="py-1.5 text-right">Contacts</th>
                <th className="py-1.5 text-right">Flows</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={field.id} className="border-t border-[#f0f2f4]">
                  <td className="py-1.5 font-mono text-[12px]">{field.key}</td>
                  <td className="py-1.5">
                    <input
                      defaultValue={field.label}
                      aria-label={`Label for ${field.key}`}
                      onBlur={(event) => void rename(field, event.target.value)}
                      className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 hover:border-[#e5e7eb] focus:border-[#0084ff] focus:outline-none"
                    />
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{field.contacts}</td>
                  <td className="py-1.5 text-right tabular-nums">{field.flows}</td>
                  <td className="py-1.5 text-right">
                    <button type="button" onClick={() => void remove(field)} className="text-[12px] text-[#8b95a1] hover:text-red-600">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
