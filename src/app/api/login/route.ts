import { adminPassword } from "@/lib/env";
import { signAdminSession } from "@/lib/crypto";
import { json, readJson } from "@/lib/http";

export async function POST(request: Request) {
  const password = adminPassword();
  if (!password) return json({ ok: true, open: true });
  const body = await readJson<{ password?: string }>(request);
  if (body.password !== password) {
    return json({ error: "Wrong password" }, 401);
  }
  const response = json({ ok: true });
  response.headers.set(
    "set-cookie",
    `relay_session=${signAdminSession(password)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
  );
  return response;
}
