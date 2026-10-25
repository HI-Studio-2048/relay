import { and, eq, ilike, or, sql } from "drizzle-orm";
import { generatedToDefinition } from "@/lib/ai-flow";
import type { GeneratedFlow } from "@/lib/ai";
import { statsByFlow } from "@/lib/analytics";
import { validateFlowDefinition } from "@/lib/agent/validate-flow";
import { getDb } from "@/lib/db";
import { bots, broadcasts, contactTags, contacts, customFields, flows, tags } from "@/lib/db/schema";
import { loadChecklist, loadWorkspaceOverview } from "@/lib/dashboard";
import { assistantHref, recordOf } from "@/lib/assistant-pages";
import { FLOW_TEMPLATES, findTemplate } from "@/lib/flow-templates";
import type { TriggerType } from "@/lib/types";

const TRIGGERS = new Set<TriggerType>(["start", "keyword", "keyword_contains", "comment", "story_reply", "story_mention", "default"]);
const STEP_TYPES = new Set(["message", "question", "tag", "delay", "ai", "end"]);

/** Networks whose comments can start a flow, and the ones with stories. */
const COMMENT_CHANNELS = new Set(["zernio", "instagram", "messenger", "youtube", "bluesky"]);
const STORY_CHANNELS = new Set(["zernio", "instagram"]);

/** Why a trigger cannot work on this channel, or null when it can. */
function triggerProblem(channel: string, triggerType: string) {
  if (triggerType === "comment" && !COMMENT_CHANNELS.has(channel)) {
    return "Comment triggers only work on Instagram, Facebook, YouTube and Bluesky accounts. Use one of those channels, or a DM keyword trigger instead.";
  }
  if ((triggerType === "story_reply" || triggerType === "story_mention") && !STORY_CHANNELS.has(channel)) {
    return "Story triggers only work on Instagram accounts.";
  }
  return null;
}

export type DraftLink = {
  kind: "flow" | "broadcast";
  id: string;
  name: string;
  href: string;
  botName: string;
};

export type ToolResult = {
  output: unknown;
  draft?: DraftLink;
  /** A page to open in the person's browser while the conversation carries on. */
  navigate?: string;
};

type SketchStep = {
  id?: string;
  type?: string;
  text?: string;
  field?: string;
  tag?: string;
  minutes?: number;
  next?: string;
  buttons?: { label?: string; next?: string; url?: string }[];
};

type Sketch = {
  botId?: string;
  flowId?: string;
  templateId?: string;
  name?: string;
  triggerType?: string;
  keywords?: string;
  publicReplies?: string[];
  steps?: SketchStep[];
  tagName?: string;
  body?: string;
  query?: string;
  limit?: number;
  path?: string;
};

function asSketch(input: unknown): Sketch {
  return input && typeof input === "object" ? (input as Sketch) : {};
}

async function ownedBot(ownerId: string, botId: string | undefined) {
  if (!botId) return null;
  const db = await getDb();
  const [row] = await db.select().from(bots).where(and(eq(bots.id, botId), eq(bots.ownerId, ownerId))).limit(1);
  return row ?? null;
}

function compileSketch(input: Sketch): { built: ReturnType<typeof generatedToDefinition> } | { error: string } {
  const triggerType = input.triggerType ?? "";
  if (!TRIGGERS.has(triggerType as TriggerType)) return { error: "triggerType must be start, keyword, keyword_contains, comment, story_reply, story_mention, or default" };
  const steps = input.steps ?? [];
  if (steps.length === 0) return { error: "Add at least one step" };
  const ids = new Set(steps.map((step, index) => (step.id || `s${index + 1}`).trim()));
  for (const step of steps) {
    if (!step.type || !STEP_TYPES.has(step.type)) return { error: `Step ${step.id || "?"} has an unknown type` };
    const id = (step.id || "").trim() || "step";
    if (step.next && !ids.has(step.next)) return { error: `${id} next points at missing step ${step.next}` };
    for (const button of step.buttons ?? []) {
      if (button.next && !ids.has(button.next)) return { error: `${id} button points at missing step ${button.next}` };
    }
    if (step.type === "question" && step.field && !/^(name|email|phone|[a-z][a-z0-9_]{0,40})$/.test(step.field.trim())) {
      return { error: `${id} field "${step.field}" must be name, email, phone, or a custom key` };
    }
  }
  const draft: GeneratedFlow = {
    name: (input.name ?? "").trim() || "Draft flow",
    trigger: {
      type: triggerType as GeneratedFlow["trigger"]["type"],
      keywords: input.keywords?.trim() ?? "",
      public_replies: (input.publicReplies ?? []).filter((reply) => reply.trim()),
    },
    steps: steps.map((step, index) => ({
      id: (step.id || `s${index + 1}`).trim(),
      type: step.type as GeneratedFlow["steps"][number]["type"],
      text: step.text ?? "",
      buttons: (step.buttons ?? []).slice(0, 3).map((button) => ({
        label: button.label ?? "",
        next: button.next ?? "",
        url: button.url ?? "",
      })),
      field: step.field ?? "",
      tag: step.tag ?? "",
      minutes: Number(step.minutes ?? 0) || 0,
      next: step.next ?? "",
    })),
  };
  const built = generatedToDefinition(draft);
  const errors = validateFlowDefinition(built.definition);
  if (errors.length) return { error: errors.join("; ") };
  return { built };
}

/** Save a flow as an inactive draft. `isActive` is never taken from the model. */
export async function createDraftFlow(ownerId: string, input: unknown): Promise<ToolResult> {
  const sketch = asSketch(input);
  const bot = await ownedBot(ownerId, sketch.botId);
  if (!bot) return { output: { error: "Channel not found in this workspace" } };
  const problem = triggerProblem(bot.channel, sketch.triggerType ?? "");
  if (problem) return { output: { error: problem } };
  const compiled = compileSketch(sketch);
  if ("error" in compiled) return { output: { error: compiled.error } };
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.insert(flows).values({
    id,
    botId: bot.id,
    name: compiled.built.name,
    triggerType: compiled.built.triggerType,
    triggerValue: compiled.built.triggerValue,
    isActive: false,
    priority: 0,
    definition: compiled.built.definition,
  });
  const draft: DraftLink = { kind: "flow", id, name: compiled.built.name, href: `/flows/${id}`, botName: bot.name };
  return {
    output: { ...draft, isActive: false, note: "Saved as a draft. The user must open it and turn it on. Do not claim it is live." },
    draft,
  };
}

/** Replace a draft flow. Live flows are refused, and the row stays inactive. */
export async function updateDraftFlow(ownerId: string, input: unknown): Promise<ToolResult> {
  const sketch = asSketch(input);
  if (!sketch.flowId) return { output: { error: "flowId is required" } };
  const db = await getDb();
  const [row] = await db
    .select({ flow: flows, botName: bots.name, channel: bots.channel, ownerId: bots.ownerId })
    .from(flows)
    .innerJoin(bots, eq(bots.id, flows.botId))
    .where(and(eq(flows.id, sketch.flowId), eq(bots.ownerId, ownerId)))
    .limit(1);
  if (!row) return { output: { error: "Flow not found in this workspace" } };
  if (row.flow.isActive) {
    return { output: { error: "This flow is already on. The agent only edits drafts. Ask the user to change a live flow in the editor." } };
  }
  const problem = triggerProblem(row.channel, sketch.triggerType ?? "");
  if (problem) return { output: { error: problem } };
  const compiled = compileSketch({ ...sketch, name: sketch.name || row.flow.name });
  if ("error" in compiled) return { output: { error: compiled.error } };
  await db
    .update(flows)
    .set({
      name: compiled.built.name,
      triggerType: compiled.built.triggerType,
      triggerValue: compiled.built.triggerValue,
      definition: compiled.built.definition,
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(flows.id, row.flow.id));
  const draft: DraftLink = { kind: "flow", id: row.flow.id, name: compiled.built.name, href: `/flows/${row.flow.id}`, botName: row.botName };
  return { output: { ...draft, isActive: false, note: "Draft updated. It is still off until the user turns it on." }, draft };
}

/** A broadcast draft only. Nothing is confirmed or sent. */
export async function createDraftBroadcast(ownerId: string, input: unknown): Promise<ToolResult> {
  const sketch = asSketch(input);
  const bot = await ownedBot(ownerId, sketch.botId);
  if (!bot) return { output: { error: "Channel not found in this workspace" } };
  const name = sketch.name?.trim();
  const body = sketch.body?.trim();
  if (!name || !body) return { output: { error: "name and body are required" } };
  const db = await getDb();
  let tagId: string | null = null;
  const tagName = sketch.tagName?.trim();
  if (tagName) {
    const [tag] = await db.select().from(tags).where(and(eq(tags.botId, bot.id), eq(tags.name, tagName))).limit(1);
    if (!tag) return { output: { error: `No tag named "${tagName}" on ${bot.name}. Call list_tags and use a tag that exists.` } };
    tagId = tag.id;
  }
  const id = crypto.randomUUID();
  await db.insert(broadcasts).values({
    id,
    botId: bot.id,
    name: name.slice(0, 120),
    body: body.slice(0, 4000),
    tagId,
    status: "draft",
    confirmedAt: null,
    totalCount: 0,
    sentCount: 0,
    failedCount: 0,
  });
  const draft: DraftLink = { kind: "broadcast", id, name, href: `/broadcasts/${id}`, botName: bot.name };
  return {
    output: {
      ...draft,
      status: "draft",
      audience: tagName ? `tag ${tagName}` : "everyone subscribed on this channel",
      note: "Draft only. Nobody has been messaged. The user must open the broadcast and confirm before it sends.",
    },
    draft,
  };
}

async function listChannels(ownerId: string): Promise<ToolResult> {
  const db = await getDb();
  const rows = await db
    .select({ id: bots.id, name: bots.name, channel: bots.channel, status: bots.status, handle: bots.telegramUsername })
    .from(bots)
    .where(eq(bots.ownerId, ownerId));
  return { output: { channels: rows } };
}

async function workspaceStats(ownerId: string): Promise<ToolResult> {
  const db = await getDb();
  const rows = await db
    .select({ id: bots.id, name: bots.name, channel: bots.channel, status: bots.status })
    .from(bots)
    .where(eq(bots.ownerId, ownerId));
  const overview = await loadWorkspaceOverview(rows);
  return {
    output: {
      totals: {
        contacts: overview.totals.totalContacts,
        newThisWeek: overview.totals.newThisWeek,
        needsReply: overview.totals.needsReply,
        openConversations: overview.totals.openThreads,
        messages7d: overview.totals.week.inbound + overview.totals.week.outbound,
        conversions30d: overview.totals.conversions,
        revenue30d: overview.totals.revenue,
      },
      channels: overview.channels,
      topFlows: overview.totals.topFlows.map((flow) => ({
        id: flow.id,
        name: flow.name,
        runs: flow.stats.runs,
        completionRate: flow.stats.completionRate,
        botName: "botName" in flow ? flow.botName : undefined,
      })),
    },
  };
}

async function listTags(ownerId: string): Promise<ToolResult> {
  const db = await getDb();
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      botId: tags.botId,
      botName: bots.name,
      contacts: sql<number>`(select count(*)::int from contact_tags ct where ct.tag_id = ${tags.id})`,
    })
    .from(tags)
    .innerJoin(bots, eq(bots.id, tags.botId))
    .where(eq(bots.ownerId, ownerId))
    .limit(100);
  return { output: { tags: rows.map((row) => ({ ...row, contacts: Number(row.contacts) })) } };
}

async function listLeadFields(ownerId: string): Promise<ToolResult> {
  const db = await getDb();
  const [counts, fields] = await Promise.all([
    db
      .select({
        botId: contacts.botId,
        botName: bots.name,
        channel: bots.channel,
        total: sql<number>`count(*)::int`,
        withName: sql<number>`count(*) filter (where coalesce(${contacts.firstName}, '') <> '')::int`,
        withEmail: sql<number>`count(*) filter (where coalesce(${contacts.email}, '') <> '')::int`,
        withPhone: sql<number>`count(*) filter (where coalesce(${contacts.phone}, '') <> '')::int`,
      })
      .from(contacts)
      .innerJoin(bots, eq(bots.id, contacts.botId))
      .where(eq(bots.ownerId, ownerId))
      .groupBy(contacts.botId, bots.name, bots.channel),
    db
      .select({ botId: customFields.botId, key: customFields.key, label: customFields.label })
      .from(customFields)
      .innerJoin(bots, eq(bots.id, customFields.botId))
      .where(eq(bots.ownerId, ownerId))
      .limit(100),
  ]);
  return {
    output: {
      channels: counts.map((row) => ({
        ...row,
        total: Number(row.total),
        withName: Number(row.withName),
        withEmail: Number(row.withEmail),
        withPhone: Number(row.withPhone),
        customFields: fields.filter((field) => field.botId === row.botId).map((field) => ({ key: field.key, label: field.label })),
      })),
    },
  };
}

async function listFlows(ownerId: string): Promise<ToolResult> {
  const db = await getDb();
  const rows = await db
    .select({
      id: flows.id,
      name: flows.name,
      botId: flows.botId,
      botName: bots.name,
      triggerType: flows.triggerType,
      triggerValue: flows.triggerValue,
      isActive: flows.isActive,
    })
    .from(flows)
    .innerJoin(bots, eq(bots.id, flows.botId))
    .where(eq(bots.ownerId, ownerId))
    .limit(50);
  const byBot = new Map<string, string[]>();
  for (const row of rows) byBot.set(row.botId, [...(byBot.get(row.botId) ?? []), row.id]);
  const stats = new Map<string, { runs: number; conversions: number }>();
  await Promise.all(
    [...byBot.keys()].map(async (botId) => {
      const report = await statsByFlow(botId, 30);
      for (const [flowId, flowStats] of Object.entries(report)) stats.set(flowId, { runs: flowStats.runs, conversions: flowStats.conversions });
    }),
  );
  return {
    output: {
      flows: rows.map((row) => ({
        ...row,
        runs30d: stats.get(row.id)?.runs ?? 0,
        conversions30d: stats.get(row.id)?.conversions ?? 0,
      })),
    },
  };
}

async function searchContacts(ownerId: string, input: unknown): Promise<ToolResult> {
  const sketch = asSketch(input);
  const db = await getDb();
  const limit = Math.min(20, Math.max(1, Number(sketch.limit) || 12));
  const filters = [eq(bots.ownerId, ownerId)];
  if (sketch.botId) filters.push(eq(contacts.botId, sketch.botId));
  const needle = sketch.query?.trim().replace(/[%_]/g, "");
  if (needle) {
    const like = `%${needle}%`;
    filters.push(or(ilike(contacts.firstName, like), ilike(contacts.lastName, like), ilike(contacts.username, like), ilike(contacts.email, like))!);
  }
  const tagName = sketch.tagName?.trim();
  if (tagName) filters.push(eq(tags.name, tagName));
  const base = db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      username: contacts.username,
      email: contacts.email,
      phone: contacts.phone,
      platform: contacts.platform,
      botName: bots.name,
      channel: bots.channel,
    })
    .from(contacts)
    .innerJoin(bots, eq(bots.id, contacts.botId));
  const rows = tagName
    ? await base.innerJoin(contactTags, eq(contactTags.contactId, contacts.id)).innerJoin(tags, eq(tags.id, contactTags.tagId)).where(and(...filters)).limit(limit)
    : await base.where(and(...filters)).limit(limit);
  return {
    output: {
      contacts: rows.map((row) => ({
        name: [row.firstName, row.lastName].filter(Boolean).join(" ") || (row.username ? `@${row.username}` : "Unknown"),
        email: row.email,
        phone: row.phone,
        platform: row.platform,
        channel: row.botName,
        network: row.channel,
      })),
    },
  };
}

/** Install a template as a draft that is off, optionally with the user's own keyword. */
export async function createFunnelFromTemplate(ownerId: string, input: unknown): Promise<ToolResult> {
  const sketch = asSketch(input);
  const bot = await ownedBot(ownerId, sketch.botId);
  if (!bot) return { output: { error: "Channel not found in this workspace" } };
  const template = sketch.templateId ? findTemplate(sketch.templateId) : null;
  if (!template) return { output: { error: "Unknown templateId. Call list_funnel_templates and use one of its ids." } };
  const problem = triggerProblem(bot.channel, template.triggerType);
  if (problem) return { output: { error: problem } };
  const keyword = sketch.keywords?.trim().slice(0, 120);
  const takesKeyword = template.triggerType === "keyword" || template.triggerType === "keyword_contains" || template.triggerType === "comment";
  const triggerValue = takesKeyword && keyword ? keyword : template.triggerValue;
  const name = sketch.name?.trim().slice(0, 120) || template.name;
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.insert(flows).values({
    id,
    botId: bot.id,
    name,
    triggerType: template.triggerType,
    triggerValue,
    isActive: false,
    priority: 0,
    definition: structuredClone(template.definition),
  });
  const draft: DraftLink = { kind: "flow", id, name, href: `/flows/${id}`, botName: bot.name };
  return {
    output: {
      ...draft,
      isActive: false,
      template: template.name,
      keyword: triggerValue,
      note: "Saved from the template as a draft that is off. Links like https://example.com are placeholders to replace in the editor. The user must open it and turn it on. Do not claim it is live.",
    },
    draft,
  };
}

async function listFunnelTemplates(): Promise<ToolResult> {
  return {
    output: {
      templates: FLOW_TEMPLATES.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        networks: template.channels,
        trigger: template.triggerType,
        keyword: template.triggerValue,
      })),
    },
  };
}

/** The Overview "Get set up" checklist for each channel, for walking a new customer through it. */
async function setupProgress(ownerId: string): Promise<ToolResult> {
  const db = await getDb();
  const rows = await db
    .select({ id: bots.id, name: bots.name, channel: bots.channel, status: bots.status })
    .from(bots)
    .where(eq(bots.ownerId, ownerId))
    .limit(10);
  if (rows.length === 0) {
    return { output: { channels: [], next: { label: "Connect your first channel", href: "/channels" } } };
  }
  const channels = await Promise.all(
    rows.map(async (bot) => {
      const steps = await loadChecklist(bot.id);
      return {
        botId: bot.id,
        name: bot.name,
        network: bot.channel,
        status: bot.status,
        done: steps.filter((item) => item.done).length,
        total: steps.length,
        steps: steps.map((item) => ({ label: item.label, done: item.done, href: item.href, hint: item.hint })),
      };
    }),
  );
  return { output: { channels } };
}

/** Open one of the console pages, or a flow, broadcast or contact of this workspace, in the person's browser. */
async function openPage(ownerId: string, input: unknown): Promise<ToolResult> {
  const href = assistantHref(asSketch(input).path ?? "");
  if (!href) return { output: { error: "Not a page you can open. Use a page path like /flows, or /flows/<id> for one flow." } };
  const record = recordOf(href);
  if (record) {
    const db = await getDb();
    const table = record.kind === "flows" ? flows : record.kind === "broadcasts" ? broadcasts : contacts;
    const [row] = await db
      .select({ id: table.id })
      .from(table)
      .innerJoin(bots, eq(bots.id, table.botId))
      .where(and(eq(table.id, record.id), eq(bots.ownerId, ownerId)))
      .limit(1);
    if (!row) return { output: { error: "Nothing with that id in this workspace" } };
  }
  return { output: { opened: href, note: "The page is opening in their browser. Keep talking; the conversation carries on there." }, navigate: href };
}

export const AGENT_TOOLS: {
  name: string;
  description: string;
  label: string;
  input_schema: Record<string, unknown>;
  run: (ownerId: string, input: unknown) => Promise<ToolResult>;
}[] = [
  {
    name: "list_channels",
    label: "Reading connected channels",
    description: "List every channel account in this workspace: id, name, network, and status. Use a bot id from here when creating a draft.",
    input_schema: { type: "object", properties: {} },
    run: (ownerId) => listChannels(ownerId),
  },
  {
    name: "workspace_stats",
    label: "Reading stats across channels",
    description: "Totals and a per-channel breakdown for contacts, replies needed, messages in the last 7 days, and conversions in the last 30 days.",
    input_schema: { type: "object", properties: {} },
    run: (ownerId) => workspaceStats(ownerId),
  },
  {
    name: "list_tags",
    label: "Reading tags",
    description: "Tags in this workspace and how many contacts have each one.",
    input_schema: { type: "object", properties: {} },
    run: (ownerId) => listTags(ownerId),
  },
  {
    name: "list_lead_fields",
    label: "Reading lead fields",
    description: "How many contacts have a name, email, or phone, plus custom field definitions, per channel.",
    input_schema: { type: "object", properties: {} },
    run: (ownerId) => listLeadFields(ownerId),
  },
  {
    name: "list_flows",
    label: "Reading flows",
    description: "Flows in this workspace, whether each is on or a draft, and runs in the last 30 days.",
    input_schema: { type: "object", properties: {} },
    run: (ownerId) => listFlows(ownerId),
  },
  {
    name: "search_contacts",
    label: "Looking up contacts",
    description: "A short sample of contacts in this workspace. Optional query, tagName, and botId. At most 20 rows. Use this for examples, not as a full export.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        tagName: { type: "string" },
        botId: { type: "string" },
        limit: { type: "number" },
      },
    },
    run: (ownerId, input) => searchContacts(ownerId, input),
  },
  {
    name: "open_page",
    label: "Opening the page",
    description:
      "Open a page in the person's browser while you keep talking: a console page such as /flows, /inbox, /contacts, /channels, /broadcasts, /ai, /growth or /setup, or one record such as /flows/<id> (a flow in the editor), /broadcasts/<id> or /contacts/<id>. Use it when they ask to see or go somewhere, or to show a draft you just saved.",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    run: (ownerId, input) => openPage(ownerId, input),
  },
  {
    name: "get_setup_progress",
    label: "Checking your setup",
    description: "The Get set up checklist for each channel: connect, teach the AI, first comment-to-DM flow, first run, growth link, team. Each step has its page. Use it to guide a new customer.",
    input_schema: { type: "object", properties: {} },
    run: (ownerId) => setupProgress(ownerId),
  },
  {
    name: "list_funnel_templates",
    label: "Looking through templates",
    description: "Ready-made funnels (comment-to-DM lead magnet, giveaway, follow to unlock, story replies, welcome menu, AI qualifier, booking, Stripe checkout and more) with the networks each suits.",
    input_schema: { type: "object", properties: {} },
    run: () => listFunnelTemplates(),
  },
  {
    name: "create_funnel_from_template",
    label: "Setting up a funnel from a template",
    description:
      "Install one template on one channel as a draft that is off. keywords replaces the template's trigger keyword (comma-separated). It is NOT activated; the user reviews it and turns it on.",
    input_schema: {
      type: "object",
      properties: {
        botId: { type: "string" },
        templateId: { type: "string" },
        name: { type: "string" },
        keywords: { type: "string" },
      },
      required: ["botId", "templateId"],
    },
    run: (ownerId, input) => createFunnelFromTemplate(ownerId, input),
  },
  {
    name: "create_draft_flow",
    label: "Saving a draft flow",
    description:
      "Create an inactive flow draft on one channel. Always include lead questions for name, email, and phone when the user is capturing leads, plus a custom field when one fits (field: company becomes custom:company). The flow is NOT activated. There is no tool that turns a flow on.",
    input_schema: {
      type: "object",
      properties: {
        botId: { type: "string" },
        name: { type: "string" },
        triggerType: { type: "string", enum: [...TRIGGERS] },
        keywords: { type: "string", description: "Comma-separated keywords. Empty for start or default. A comment trigger with no keyword answers every comment." },
        publicReplies: {
          type: "array",
          items: { type: "string" },
          description: "Comment triggers only: two or three short public replies posted under the comment, like \"Sent you a DM 📩\".",
        },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { type: "string", enum: [...STEP_TYPES] },
              text: { type: "string" },
              field: { type: "string", description: "question steps: name, email, phone, or a custom key like company" },
              tag: { type: "string" },
              minutes: { type: "number" },
              next: { type: "string" },
              buttons: {
                type: "array",
                items: {
                  type: "object",
                  properties: { label: { type: "string" }, next: { type: "string" }, url: { type: "string" } },
                },
              },
            },
            required: ["id", "type", "text"],
          },
        },
      },
      required: ["botId", "name", "triggerType", "steps"],
    },
    run: (ownerId, input) => createDraftFlow(ownerId, input),
  },
  {
    name: "update_draft_flow",
    label: "Updating a draft flow",
    description: "Replace an inactive draft flow. Refuses flows that are already on. Cannot activate a flow.",
    input_schema: {
      type: "object",
      properties: {
        flowId: { type: "string" },
        name: { type: "string" },
        triggerType: { type: "string", enum: [...TRIGGERS] },
        keywords: { type: "string" },
        publicReplies: { type: "array", items: { type: "string" } },
        steps: { type: "array" },
      },
      required: ["flowId", "triggerType", "steps"],
    },
    run: (ownerId, input) => updateDraftFlow(ownerId, input),
  },
  {
    name: "create_draft_broadcast",
    label: "Saving a broadcast draft",
    description:
      "Save a broadcast draft for one channel. Optional tagName limits the audience to an existing tag. The broadcast is NOT sent and NOT confirmed. There is no tool that sends it.",
    input_schema: {
      type: "object",
      properties: {
        botId: { type: "string" },
        name: { type: "string" },
        body: { type: "string" },
        tagName: { type: "string" },
      },
      required: ["botId", "name", "body"],
    },
    run: (ownerId, input) => createDraftBroadcast(ownerId, input),
  },
];

export function runAgentTool(ownerId: string, name: string, input: unknown): Promise<ToolResult> {
  const tool = AGENT_TOOLS.find((item) => item.name === name);
  if (!tool) return Promise.resolve({ output: { error: `Unknown tool ${name}. You cannot activate flows or send messages.` } });
  return tool.run(ownerId, input);
}
