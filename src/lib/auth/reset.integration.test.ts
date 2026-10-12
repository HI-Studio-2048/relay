import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sent: { to: string; subject: string; text: string }[] = [];
const realFetch = globalThis.fetch;

/** Stands in for SES; records what would have been mailed. */
function fakeSes() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).includes("amazonaws.com")) return realFetch(input, init);
    const body = JSON.parse(String(init?.body));
    sent.push({ to: body.Destination.ToAddresses[0], subject: body.Content.Simple.Subject.Data, text: body.Content.Simple.Body.Text.Data });
    return new Response("{}", { status: 200 });
  });
}

const post = (route: { POST: (request: Request) => Promise<Response> }, body: unknown) =>
  route.POST(new Request("https://recatch.test/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

const tokenFromMail = (text: string) => decodeURIComponent(text.match(/token=([^\s]+)/)![1]!);

describe("password reset through the whole app", () => {
  beforeAll(async () => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "recatch-reset-")));
    vi.stubEnv("PUBLIC_URL", "https://recatch.test");
    vi.stubEnv("AWS_SES_ACCESS_KEY_ID", "AKID");
    vi.stubEnv("AWS_SES_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("AWS_SES_REGION", "us-east-1");
    vi.stubEnv("EMAIL_FROM", "hello@recatch.test");
    vi.stubGlobal("fetch", fakeSes());
    const { createUser } = await import("@/lib/auth");
    await createUser({ email: "Ada@Example.test", password: "old password", name: "Ada" });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("mails a link to a real account and gives the same answer for an unknown one", async () => {
    const forgot = await import("@/app/api/auth/forgot/route");
    const known = await post(forgot, { email: "ada@example.test" });
    const unknown = await post(forgot, { email: "nobody@example.test" });
    expect(known.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "ada@example.test", subject: "Reset your Recatch password" });
    expect(sent[0]!.text).toContain("https://recatch.test/reset-password?token=");
  });

  it("sets the new password once, signs the person in, and then the link is dead", async () => {
    const reset = await import("@/app/api/auth/reset/route");
    const { authenticate } = await import("@/lib/auth");
    const token = tokenFromMail(sent[0]!.text);

    const tooShort = await post(reset, { token, password: "short" });
    expect(tooShort.status).toBe(400);

    const ok = await post(reset, { token, password: "brand new password" });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toContain("relay_session=");
    expect((await authenticate("ada@example.test", "brand new password")).email).toBe("ada@example.test");
    await expect(authenticate("ada@example.test", "old password")).rejects.toThrow();

    const again = await post(reset, { token, password: "another password" });
    expect(again.status).toBe(400);
    expect((await again.json()).error).toMatch(/invalid or has expired/);
  });

  it("rejects expired and tampered links", async () => {
    const { resetTokenFor, resetPassword, RESET_MAX_AGE_MS } = await import("@/lib/auth/reset");
    const found = (await resetTokenFor("ada@example.test", Date.now() - RESET_MAX_AGE_MS - 1000))!;
    await expect(resetPassword(found.token, "a fine password")).rejects.toThrow(/invalid or has expired/);
    const fresh = (await resetTokenFor("ada@example.test"))!;
    const [userId, expires, print, sig] = fresh.token.split(".");
    await expect(resetPassword(`${userId}.${Number(expires) + 1000}.${print}.${sig}`, "a fine password")).rejects.toThrow();
    await expect(resetPassword("garbage", "a fine password")).rejects.toThrow();
  });

  it("tells the visitor when email is not set up, and writes no mail", async () => {
    vi.stubEnv("AWS_SES_REGION", "");
    const forgot = await import("@/app/api/auth/forgot/route");
    const before = sent.length;
    const response = await post(forgot, { email: "ada@example.test" });
    expect(response.status).toBe(503);
    expect(sent).toHaveLength(before);
    vi.stubEnv("AWS_SES_REGION", "us-east-1");
  });

  it("keeps the user rows intact", async () => {
    const { getDb } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");
    const db = await getDb();
    const rows = await db.select().from(users).where(eq(users.email, "ada@example.test"));
    expect(rows).toHaveLength(1);
  });
});
