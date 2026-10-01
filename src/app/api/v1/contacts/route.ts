import { apiHandler } from "@/lib/api-v1";
import { publicContact } from "@/lib/developer";
import { json } from "@/lib/http";
import { loadContactRecord, loadAudienceMembers } from "@/lib/store";

/** GET /api/v1/contacts?email=&phone=&tag=&q=&limit= */
export async function GET(request: Request) {
  return apiHandler(request, async (botId) => {
    const url = new URL(request.url);
    const email = url.searchParams.get("email")?.trim().toLowerCase();
    const phone = url.searchParams.get("phone")?.replace(/\D/g, "");
    const tag = url.searchParams.get("tag")?.trim().toLowerCase();
    const q = url.searchParams.get("q")?.trim().toLowerCase();
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 100));
    const members = await loadAudienceMembers(botId);
    const matches = members
      .filter((member) => !email || member.email?.toLowerCase() === email)
      .filter((member) => !phone || (member.phone ?? "").replace(/\D/g, "").endsWith(phone))
      .filter((member) => !tag || member.subject.tags.some((name) => name.toLowerCase() === tag))
      .filter(
        (member) =>
          !q ||
          [member.firstName, member.lastName, member.username, member.email].some((value) => (value ?? "").toLowerCase().includes(q)),
      )
      .slice(0, limit);
    const records = await Promise.all(matches.map((member) => loadContactRecord(member.id)));
    return json({ contacts: records.filter(Boolean).map((record) => publicContact(record!)) });
  });
}
