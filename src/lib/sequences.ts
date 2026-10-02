import { and, asc, eq, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sequenceSteps, sequenceSubscriptions, sequences } from "@/lib/db/schema";
import { interpolateTemplate } from "@/lib/flow-effects";
import { loadContactRecord } from "@/lib/store";

export async function createSequence(input: {
  botId: string;
  name: string;
  steps: { delaySeconds: number; body: string; flowId?: string | null }[];
}) {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.insert(sequences).values({
    id,
    botId: input.botId,
    name: input.name.trim(),
    isActive: true,
  });
  for (const [index, step] of input.steps.entries()) {
    if (!step.body.trim() && !step.flowId) continue;
    await db.insert(sequenceSteps).values({
      id: crypto.randomUUID(),
      sequenceId: id,
      position: index,
      delaySeconds: Math.max(0, Math.floor(step.delaySeconds || 0)),
      body: step.body.trim(),
      flowId: step.flowId || null,
    });
  }
  return id;
}

/** Replace a sequence's messages in place. Subscribers keep their position (step index). */
export async function replaceSequenceSteps(sequenceId: string, steps: { delaySeconds: number; body: string; flowId?: string | null }[]) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(sequenceSteps).where(eq(sequenceSteps.sequenceId, sequenceId));
    let position = 0;
    for (const step of steps) {
      if (!step.body.trim() && !step.flowId) continue;
      await tx.insert(sequenceSteps).values({
        id: crypto.randomUUID(),
        sequenceId,
        position: position++,
        delaySeconds: Math.max(0, Math.floor(step.delaySeconds || 0)),
        body: step.body.trim(),
        flowId: step.flowId || null,
      });
    }
  });
}

export async function listSequences(botId: string) {
  const db = await getDb();
  const rows = await db.select().from(sequences).where(eq(sequences.botId, botId)).orderBy(asc(sequences.createdAt));
  const result = [];
  for (const row of rows) {
    const steps = await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, row.id))
      .orderBy(asc(sequenceSteps.position));
    const counts = await db
      .select({ status: sequenceSubscriptions.status, count: sql<number>`count(*)::int` })
      .from(sequenceSubscriptions)
      .where(eq(sequenceSubscriptions.sequenceId, row.id))
      .groupBy(sequenceSubscriptions.status);
    const stats = {
      active: counts.find((item) => item.status === "active")?.count ?? 0,
      completed: counts.find((item) => item.status === "completed")?.count ?? 0,
      unsubscribed: counts.find((item) => item.status === "unsubscribed")?.count ?? 0,
    };
    result.push({ ...row, steps, stats });
  }
  return result;
}

export async function findSequenceByName(botId: string, name: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(sequences)
    .where(and(eq(sequences.botId, botId), eq(sequences.name, name.trim())))
    .limit(1);
  return row ?? null;
}

export async function subscribeToSequence(sequenceId: string, contactId: string) {
  const db = await getDb();
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId)).limit(1);
  if (!sequence?.isActive) return;
  const [first] = await db
    .select()
    .from(sequenceSteps)
    .where(eq(sequenceSteps.sequenceId, sequenceId))
    .orderBy(asc(sequenceSteps.position))
    .limit(1);
  const delay = first?.delaySeconds ?? 0;
  await db
    .insert(sequenceSubscriptions)
    .values({
      id: crypto.randomUUID(),
      sequenceId,
      contactId,
      nextIndex: 0,
      nextAt: new Date(Date.now() + delay * 1000),
      status: "active",
    })
    .onConflictDoUpdate({
      target: [sequenceSubscriptions.sequenceId, sequenceSubscriptions.contactId],
      set: {
        nextIndex: 0,
        nextAt: new Date(Date.now() + delay * 1000),
        status: "active",
      },
    });
}

export async function unsubscribeFromSequence(sequenceId: string, contactId: string) {
  const db = await getDb();
  await db
    .update(sequenceSubscriptions)
    .set({ status: "unsubscribed" })
    .where(
      and(eq(sequenceSubscriptions.sequenceId, sequenceId), eq(sequenceSubscriptions.contactId, contactId)),
    );
}

export async function syncContactSequences(
  botId: string,
  contact: { id: string; subscriptions?: string[]; unsubscribed?: boolean },
  previousSubscriptions: string[] = [],
) {
  const listed = await listSequences(botId);
  const wanted = new Set((contact.subscriptions ?? []).map((name) => name.trim().toLowerCase()));
  const previous = new Set(previousSubscriptions.map((name) => name.trim().toLowerCase()));
  for (const sequence of listed) {
    const key = sequence.name.trim().toLowerCase();
    if (contact.unsubscribed) {
      await unsubscribeFromSequence(sequence.id, contact.id);
      continue;
    }
    if (wanted.has(key)) {
      await subscribeToSequence(sequence.id, contact.id);
      continue;
    }
    if (previous.has(key) && !wanted.has(key)) {
      await unsubscribeFromSequence(sequence.id, contact.id);
    }
  }
}

export async function listDueSequenceSends() {
  const db = await getDb();
  // A paused sequence holds its subscribers where they are until it is switched back on.
  const rows = await db
    .select({ sub: sequenceSubscriptions })
    .from(sequenceSubscriptions)
    .innerJoin(sequences, eq(sequences.id, sequenceSubscriptions.sequenceId))
    .where(and(eq(sequenceSubscriptions.status, "active"), eq(sequences.isActive, true), lte(sequenceSubscriptions.nextAt, new Date())));
  return rows.map((row) => row.sub);
}

export async function loadSequenceStep(sequenceId: string, index: number) {
  const db = await getDb();
  const steps = await db
    .select()
    .from(sequenceSteps)
    .where(eq(sequenceSteps.sequenceId, sequenceId))
    .orderBy(asc(sequenceSteps.position));
  return { step: steps[index] ?? null, total: steps.length };
}

export async function renderSequenceBody(contactId: string, body: string) {
  const contact = await loadContactRecord(contactId);
  if (!contact) return body;
  return interpolateTemplate(body, contact);
}
