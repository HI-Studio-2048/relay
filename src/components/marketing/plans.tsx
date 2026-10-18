import Link from "next/link";
import { Check } from "lucide-react";
import { billingConfig } from "@/lib/billing/config";
import { planCards, type PlanCard } from "@/lib/billing/quote";
import { Button } from "@/components/ui/button";

function Price({ card }: { card: PlanCard }) {
  if (!card.promoApplied) {
    return (
      <p className="mt-4 flex items-baseline gap-1">
        <span className="font-heading text-[40px] leading-none font-semibold tracking-tight text-[#1b1f24]">{card.regularLabel}</span>
        <span className="text-[14px] text-[#6b7280]">/month</span>
      </p>
    );
  }
  return (
    <div className="mt-4">
      <p className="text-[14px] text-[#6b7280]">
        <span className="sr-only">Regular price </span>
        <span className="line-through">{card.regularLabel}</span>
      </p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-heading text-[40px] leading-none font-semibold tracking-tight text-[#1b1f24]">{card.dueTodayLabel}</span>
        <span className="text-[14px] font-medium text-[#1b1f24]">first month</span>
      </p>
      <p className="mt-1 text-[13px] text-[#6b7280]">Then {card.renewalLabel}/month</p>
    </div>
  );
}

export function PlansSection() {
  const cards = planCards();
  const { promo } = billingConfig();
  const promoCards = cards.filter((card) => card.promoApplied);
  const offer =
    promoCards.length === 0
      ? "Every plan is billed monthly. Checkout opens the workspace."
      : promoCards.length === cards.length
        ? `${promo.percentOff}% off your first month on every plan, then the regular price.`
        : `${promo.percentOff}% off your first month on the plans marked below, then the regular price.`;

  return (
    <section id="plans" className="scroll-mt-20 border-t border-[#e5e7eb] bg-[#f4f6f8]">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 md:px-8 md:py-28">
        <div className="max-w-2xl">
          <p className="text-[12px] font-semibold tracking-[0.14em] text-[#0084ff] uppercase">Plans</p>
          <h2 className="mt-3 font-heading text-[32px] leading-tight font-semibold tracking-tight text-balance text-[#1b1f24] md:text-[40px]">
            Pick a plan and start today
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-[#4b5563]">
            Paid plans only. No free tier and no trial. {offer} The renewal price is shown before you pay, and the
            workspace opens when checkout finishes.
          </p>
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {cards.map((card) => (
            <article
              key={card.id}
              className={`flex flex-col rounded-2xl bg-white p-6 ring-1 ${card.highlighted ? "ring-2 ring-[#0084ff]" : "ring-[#e5e7eb]"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[18px] font-semibold text-[#1b1f24]">{card.name}</h3>
                {card.highlighted ? (
                  <span className="rounded-full bg-[#eef6ff] px-2.5 py-1 text-[11px] font-semibold tracking-wide text-[#0069cc] uppercase">
                    Most popular
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">{card.description}</p>
              <Price card={card} />
              {card.promoApplied ? (
                <p className="mt-3 inline-flex w-fit rounded-full bg-[#ecfdf3] px-2.5 py-1 text-[12px] font-medium text-[#05603a]">
                  {card.percentOff}% off the first month
                </p>
              ) : null}
              <ul className="mt-5 space-y-2.5 text-[14px] text-[#1b1f24]">
                {card.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-[#00c853]" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button className="mt-6 h-10" render={<Link href={`/signup?plan=${card.id}`} />}>
                Start {card.name}
              </Button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
