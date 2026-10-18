import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/marketing/auth-form";
import { currentUser } from "@/lib/auth";
import { workspaceGate } from "@/lib/billing/gate";
import { planCards } from "@/lib/billing/quote";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create account · Recatch" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const query = await searchParams;
  const user = await currentUser();
  if (user) {
    const gate = await workspaceGate(user.id);
    const plan = query.plan ? `?plan=${encodeURIComponent(query.plan)}` : "";
    redirect(gate === "ok" ? "/" : `/billing${plan}`);
  }
  const plans = planCards();
  const initialPlanId = plans.some((plan) => plan.id === query.plan) ? query.plan! : "";
  return <AuthScreen mode="signup" plans={plans} initialPlanId={initialPlanId} />;
}