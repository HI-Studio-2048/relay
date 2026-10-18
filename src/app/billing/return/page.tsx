import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MarketingBrand } from "@/components/marketing/brand";
import { loadAccountBilling } from "@/lib/billing/account";
import { hasWorkspaceAccess } from "@/lib/billing/access";
import { confirmCheckoutSession } from "@/lib/billing/checkout";
import { currentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Confirming payment · Recatch" };

export default async function BillingReturnPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const sessionId = (await searchParams).session_id?.trim() ?? "";
  const user = await currentUser();
  if (!user) {
    const next = sessionId ? `/billing/return?session_id=${encodeURIComponent(sessionId)}` : "/billing/return";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  const account = await loadAccountBilling(user.id);
  if (account && hasWorkspaceAccess(account.billingStatus)) redirect("/setup");
  const result = sessionId
    ? await confirmCheckoutSession(user.id, sessionId).catch(() => ({
        access: false,
        message: "We couldn't confirm the payment just now. If you finished checkout, wait a moment and refresh.",
      }))
    : { access: false, message: "This return link is missing a checkout session." };
  if (result.access) redirect("/setup");

  return (
    <div className="min-h-dvh bg-white px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <MarketingBrand />
        <h1 className="mt-10 font-heading text-[28px] font-semibold tracking-tight text-[#1b1f24]">Payment not confirmed yet</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[#6b7280]">{result.message}</p>
        <div className="mt-6">
          <Button className="h-10" render={<Link href="/billing" />}>
            Back to plans
          </Button>
        </div>
      </div>
    </div>
  );
}
