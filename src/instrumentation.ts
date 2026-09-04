export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureReady } = await import("@/lib/startup");
    await ensureReady();
  }
}
