/**
 * The console pages the Overview assistant knows about and may open for someone while it talks to
 * them. Pure and browser safe.
 */
export const ASSISTANT_PAGES = [
  { path: "/", label: "Overview" },
  { path: "/inbox", label: "Inbox" },
  { path: "/contacts", label: "Contacts" },
  { path: "/channels", label: "Channels" },
  { path: "/accounts", label: "All accounts" },
  { path: "/flows", label: "Flows" },
  { path: "/keywords", label: "Keywords" },
  { path: "/starters", label: "Starters & hours" },
  { path: "/sequences", label: "Sequences" },
  { path: "/rules", label: "Rules" },
  { path: "/broadcasts", label: "Broadcasts" },
  { path: "/ai", label: "AI assistant" },
  { path: "/growth", label: "Links" },
  { path: "/integrations", label: "API & webhooks" },
  { path: "/setup", label: "Settings" },
] as const;

/** One flow, broadcast or contact, which the assistant can open by id. */
const RECORD = /^\/(flows|broadcasts|contacts)\/([A-Za-z0-9_-]{1,80})$/;

/** The path when it is a page the assistant may open, otherwise null. */
export function assistantHref(path: string): string | null {
  const clean = path.trim();
  if (ASSISTANT_PAGES.some((page) => page.path === clean)) return clean;
  return RECORD.test(clean) ? clean : null;
}

/** The kind and id of a single record path, like { kind: "flows", id } for /flows/<id>. */
export function recordOf(path: string): { kind: "flows" | "broadcasts" | "contacts"; id: string } | null {
  const match = RECORD.exec(path.trim());
  return match ? { kind: match[1] as "flows" | "broadcasts" | "contacts", id: match[2]! } : null;
}

/** What someone is looking at, in words: "the Flows page" or "a flow in the editor". */
export function pageDescription(pathname: string) {
  const record = recordOf(pathname);
  if (record?.kind === "flows") return `a flow in the editor (${pathname})`;
  if (record?.kind === "broadcasts") return `a broadcast (${pathname})`;
  if (record?.kind === "contacts") return `a contact's page (${pathname})`;
  const page = [...ASSISTANT_PAGES].sort((a, b) => b.path.length - a.path.length).find((item) => item.path === "/" ? pathname === "/" : pathname === item.path || pathname.startsWith(`${item.path}/`));
  return page ? `the ${page.label} page (${page.path})` : null;
}
