import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bots, contacts, teamMembers } from "@/lib/db/schema";

/** Browser cookie naming the team member using this browser ("I am…"). */
export const AGENT_COOKIE = "relay.agent";

export const TEAM_COLORS = ["#0084FF", "#7B61FF", "#00C2CB", "#E64980", "#12B886", "#F76707", "#4C6EF5", "#FFB800"];

/** The Live Chat team of one workspace owner. */
export async function listTeam(ownerId: string) {
  const db = await getDb();
  return db.select().from(teamMembers).where(eq(teamMembers.ownerId, ownerId)).orderBy(asc(teamMembers.createdAt));
}

export function agentIdFromCookieHeader(header: string | null) {
  const match = (header ?? "").match(new RegExp(`(?:^|;\\s*)${AGENT_COOKIE.replace(".", "\\.")}=([^;]+)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

/** A team member, only when they belong to `ownerId`'s workspace. */
export async function findMember(id: string | null | undefined, ownerId: string | null | undefined) {
  if (!id || !ownerId) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.id, id), eq(teamMembers.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

export async function assignContact(contactId: string, memberId: string | null) {
  const db = await getDb();
  await db.update(contacts).set({ assignedTo: memberId }).where(eq(contacts.id, contactId));
}

/** The team of whoever owns this channel account (for automations, which run without a signed-in user). */
export async function listTeamForBot(botId: string) {
  const db = await getDb();
  const [bot] = await db.select({ ownerId: bots.ownerId }).from(bots).where(eq(bots.id, botId)).limit(1);
  return bot?.ownerId ? listTeam(bot.ownerId) : [];
}

/** Round robin by load: the member with the fewest open conversations on this account. */
export async function pickAssignee(botId: string) {
  const team = await listTeamForBot(botId);
  if (team.length === 0) return null;
  const db = await getDb();
  const load = await db
    .select({ memberId: contacts.assignedTo, open: sql<number>`count(*)::int` })
    .from(contacts)
    .where(and(eq(contacts.botId, botId), eq(contacts.inboxStatus, "open"), isNotNull(contacts.assignedTo)))
    .groupBy(contacts.assignedTo);
  const byMember = new Map(load.map((row) => [row.memberId, Number(row.open)]));
  return [...team].sort((a, b) => (byMember.get(a.id) ?? 0) - (byMember.get(b.id) ?? 0))[0]!;
}
