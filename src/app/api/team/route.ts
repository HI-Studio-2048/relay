import { requireUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { teamMembers } from "@/lib/db/schema";
import { json, fail, readJson } from "@/lib/http";
import { listTeam, TEAM_COLORS } from "@/lib/team";

export async function GET() {
  try {
    return json({ team: await listTeam(await requireUserId()) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = await requireUserId();
    const body = await readJson<{ name?: string; email?: string }>(request);
    const name = body.name?.trim();
    if (!name) return json({ error: "Name is required" }, 400);
    const team = await listTeam(ownerId);
    const db = await getDb();
    const [member] = await db
      .insert(teamMembers)
      .values({ id: crypto.randomUUID(), ownerId, name: name.slice(0, 60), email: body.email?.trim() || null, color: TEAM_COLORS[team.length % TEAM_COLORS.length]! })
      .returning();
    return json({ member });
  } catch (error) {
    return fail(error);
  }
}
