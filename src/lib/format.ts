export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const delta = Date.now() - date.getTime();
  const minutes = Math.round(delta / 60_000);
  if (Math.abs(minutes) < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

export function triggerLabel(type: string, value: string | null): string {
  if (type === "start") return "/start";
  if (type === "start_param") return value ? `/start ${value}` : "Growth link";
  if (type === "command") return value ? `/${value.replace(/^\//, "")}` : "Command";
  if (type === "keyword") return value ? `“${value}”` : "Keyword";
  return value ? `${type} · ${value}` : type;
}

/**
 * Revenue across currencies, never added together: "¥5,000 · $19.99". Amounts with no known currency
 * (goal steps, the API) show as plain numbers.
 */
export function formatRevenue(parts: { currency: string | null; value: number }[], locale?: string) {
  const totals = new Map<string, number>();
  for (const part of parts) {
    if (!part.value) continue;
    const key = part.currency?.trim().toUpperCase() ?? "";
    totals.set(key, (totals.get(key) ?? 0) + part.value);
  }
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .map(([currency, value]) => {
      if (currency) {
        try {
          return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
        } catch {
          // Unknown code: fall through to a plain number with the code.
          return `${value.toLocaleString(locale, { maximumFractionDigits: 2 })} ${currency}`;
        }
      }
      return value.toLocaleString(locale, { maximumFractionDigits: 2 });
    })
    .join(" · ");
}
