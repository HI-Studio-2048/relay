import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PayButton, PortalButton } from "@/components/billing/pay-button";
import { MarketingBrand } from "@/components/marketing/brand";
import { loadAccountBilling } from "@/lib/billing/account";
import { hasWorkspaceAccess } from "@/lib/billing/access";
import { paymentsConfigured } from "@/lib/billing/config";
import { getPlan, planCards } from "@/lib/billing/quote";
import { currentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Billing · Recatch" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ canceled?: string; plan?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/api/auth/logout");
  const account = await loadAccountBilling(user.id);
  if (!account) redirect("/api/auth/logout");
  const query = await searchParams;
  const cards = planCards();
  const current = getPlan(account.planId);
  const open = hasWorkspaceAccess(account.billingStatus);
  const ready = paymentsConfigured();

  return (
    <div className="min-h-dvh bg-white px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <MarketingBrand />
        <h1 className="mt-10 font-heading text-[32px] font-semibold tracking-tight text-[#1b1f24]">
          {open ? "Billing" : "Finish checkout to open your workspace"}
        </h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[#6b7280]">
          {open
            ? `${current ? `You're on ${current.name}. ` : ""}Payment is confirmed, so the workspace is open.`
            : "Recatch is paid. There is no free plan and no trial. Nothing opens until checkout finishes."}
        </p>
        {query.canceled ? (
          <p className="mt-4 rounded-lg bg-[#f4f6f8] px-3 py-2 text-[13px] text-[#1b1f24]">Checkout was canceled. Nothing was charged.</p>
        ) : null}
        {account.billingStatus === "past_due" ? (
          <p className="mt-4 rounded-lg bg-[#fff7ed] px-3 py-2 text-[13px] text-[#9a3412]">
            The last payment did not go through. Stripe will try the card again over the next few days, and the
            workspace stays open meanwhile. Update the card so nothing gets paused.
          </p>
        ) : null}
        {account.billingStatus === "unpaid" || account.billingStatus === "canceled" ? (
          <div className="mt-4 rounded-lg bg-[#fff7ed] px-3 py-2 text-[13px] text-[#9a3412]">
            <p>
              {account.billingStatus === "unpaid" ? "The payment could not be collected" : "The plan has ended"}, so the
              workspace is paused. Flows, AI replies, broadcasts and the API are stopped until a plan is active again.
            </p>
            {account.stripeCustomerId && ready ? (
              <div className="mt-3">
                <PortalButton />
              </div>
            ) : null}
          </div>
        ) : null}

        {open ? (
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button className="h-10" render={<Link href="/" />}>
              Go to workspace
            </Button>
            {account.stripeCustomerId && ready ? <PortalButton /> : null}
          </div>
        ) : null}

        {!open && !ready ? (
          <p className="mt-8 rounded-xl bg-[#fff7ed] px-4 py-3 text-[14px] leading-relaxed text-[#9a3412]">
            Checkout is not available on this server yet, so the workspace stays closed. Your account is saved. Once
            payments are configured, sign in and finish checkout from this page.
          </p>
        ) : null}

        {!open ? (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {cards.map((card) => (
              <article key={card.id} className={`rounded-2xl bg-white p-5 ring-1 ${card.id === (query.plan || account.planId) ? "ring-2 ring-[#0084ff]" : "ring-[#e5e7eb]"}`}>
                <h2 className="text-[16px] font-semibold text-[#1b1f24]">{card.name}</h2>
                {card.promoApplied ? (
                  <>
                    <p className="mt-3 text-[13px] text-[#6b7280] line-through">{card.regularLabel}</p>
                    <p className="text-[22px] font-semibold text-[#1b1f24]">
                      {card.dueTodayLabel} <span className="text-[13px] font-medium">first month</span>
                    </p>
                    <p className="text-[13px] text-[#6b7280]">Then {card.renewalLabel}/month</p>
                  </>
                ) : (
                  <p className="mt-3 text-[22px] font-semibold text-[#1b1f24]">
                    {card.regularLabel}
                    <span className="text-[13px] font-medium text-[#6b7280]">/month</span>
                  </p>
                )}
                {ready ? <PayButton planId={card.id} label={`Continue with ${card.name}`} /> : null}
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
