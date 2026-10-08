import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  Inbox,
  Link2,
  ListFilter,
  Megaphone,
  MessageSquareText,
  PlugZap,
  Repeat,
  Rocket,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { ToneChip, type ToneName } from "@/components/chrome/tone";
import { Button } from "@/components/ui/button";
import { CHANNEL_IDS, CHANNELS } from "@/lib/channels/types";

export const metadata: Metadata = {
  title: "Relay · Chat automation for Telegram, Instagram, Messenger and WhatsApp",
  description:
    "Build visual chat flows, capture leads, run a shared inbox, and send confirmed broadcasts across every messaging channel.",
};

const FEATURES: { icon: LucideIcon; tone: ToneName; title: string; body: string }[] = [
  {
    icon: Workflow,
    tone: "content",
    title: "Visual flow builder",
    body: "Drag messages, questions, conditions, delays and A/B splits onto a canvas. Publish when it reads right.",
  },
  {
    icon: Inbox,
    tone: "input",
    title: "Shared live inbox",
    body: "Every conversation in one place. Jump in mid-flow, reply by hand, then hand the contact back to automation.",
  },
  {
    icon: MessageSquareText,
    tone: "content",
    title: "Keywords & commands",
    body: "Reply instantly when someone types a keyword or taps a command, and route them into the right flow.",
  },
  {
    icon: Repeat,
    tone: "action",
    title: "Drip sequences",
    body: "Follow up over hours or days with timed sequences that stop the moment a contact replies or unsubscribes.",
  },
  {
    icon: ListFilter,
    tone: "action",
    title: "Rules & tags",
    body: "Tag contacts, set fields and trigger actions automatically, so your audience segments itself as it grows.",
  },
  {
    icon: Megaphone,
    tone: "start",
    title: "Safe broadcasts",
    body: "Send to a tag or segment with an explicit confirm step, sending at a pace each platform allows.",
  },
];

const STEPS: { icon: LucideIcon; tone: ToneName; title: string; body: string }[] = [
  {
    icon: PlugZap,
    tone: "input",
    title: "Connect a channel",
    body: "Paste a Telegram bot token or connect a Meta page, Instagram account or WhatsApp number.",
  },
  {
    icon: Workflow,
    tone: "content",
    title: "Build your first flow",
    body: "Start from the lead-capture template or a blank canvas. Set a keyword or /start trigger.",
  },
  {
    icon: Rocket,
    tone: "start",
    title: "Share and grow",
    body: "Share a link or QR code. New contacts land in your inbox, tagged and ready to follow up.",
  },
];

function ChatBubble({ from, children }: { from: "bot" | "user"; children: React.ReactNode }) {
  return (
    <div className={from === "user" ? "flex justify-end" : "flex justify-start"}>
      <p
        className={
          from === "user"
            ? "max-w-[78%] rounded-2xl rounded-br-md bg-[#0084ff] px-3.5 py-2 text-[13px] text-white"
            : "max-w-[78%] rounded-2xl rounded-bl-md bg-[#f1f3f5] px-3.5 py-2 text-[13px] text-[#1b1f24]"
        }
      >
        {children}
      </p>
    </div>
  );
}

function FlowNode({ tone, label, title, className }: { tone: string; label: string; title: string; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white p-3 shadow-[0_1px_3px_rgba(16,24,40,0.10)] ring-1 ring-[#e5e7eb] ${className ?? ""}`}>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase" style={{ color: tone }}>
        <span className="inline-block size-1.5 rounded-full" style={{ background: tone }} />
        {label}
      </p>
      <p className="mt-1 text-[13px] font-medium text-[#1b1f24]">{title}</p>
    </div>
  );
}

/** Product illustration: a phone conversation next to the flow that drives it. Pure markup, no screenshots. */
function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden>
      <div className="absolute -inset-6 rounded-[2.5rem] bg-[radial-gradient(circle_at_30%_20%,#e0efff,transparent_60%),radial-gradient(circle_at_80%_80%,#e6fbf0,transparent_55%)]" />
      <div className="relative grid gap-4 sm:grid-cols-[1fr_0.9fr] sm:items-center">
        <div className="rounded-[2rem] bg-white p-4 shadow-[0_12px_40px_rgba(16,24,40,0.12)] ring-1 ring-[#e5e7eb]">
          <div className="mb-3 flex items-center gap-2 border-b border-[#f1f3f5] pb-3">
            <span className="grid size-8 place-items-center rounded-full bg-[#00c853] text-[12px] font-semibold text-white">S</span>
            <span>
              <span className="block text-[13px] font-medium text-[#1b1f24]">Studio Bot</span>
              <span className="block text-[11px] text-[#00a846]">online</span>
            </span>
          </div>
          <div className="space-y-2">
            <ChatBubble from="user">/start</ChatBubble>
            <ChatBubble from="bot">Hi! 👋 Want our spring lookbook?</ChatBubble>
            <div className="flex gap-1.5">
              <span className="rounded-full px-3 py-1 text-[12px] text-[#0084ff] ring-1 ring-[#0084ff]/40">Yes please</span>
              <span className="rounded-full px-3 py-1 text-[12px] text-[#6b7280] ring-1 ring-[#e5e7eb]">Later</span>
            </div>
            <ChatBubble from="user">Yes please</ChatBubble>
            <ChatBubble from="bot">Great, what’s the best email to send it to?</ChatBubble>
            <ChatBubble from="user">sam@example.com</ChatBubble>
          </div>
        </div>
        <div className="hidden space-y-3 sm:block">
          <FlowNode tone="#00c853" label="Trigger" title="/start or “lookbook”" />
          <div className="ml-6 h-4 w-px bg-[#c9d1da]" />
          <FlowNode tone="#0084ff" label="Send message" title="Lookbook offer + buttons" className="ml-2" />
          <div className="ml-6 h-4 w-px bg-[#c9d1da]" />
          <FlowNode tone="#00c2cb" label="User input" title="Ask for email" className="ml-4" />
          <div className="ml-6 h-4 w-px bg-[#c9d1da]" />
          <FlowNode tone="#7b61ff" label="Action" title="Tag “lead” · notify team" className="ml-6" />
        </div>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <>
      <section className="overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl gap-14 px-4 pt-16 pb-20 md:px-8 md:pt-24 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-[#eef6ff] px-3 py-1 text-[12px] font-medium text-[#0069cc]">
              <span className="inline-block size-1.5 rounded-full bg-[#0084ff]" />
              Telegram · Instagram · Messenger · WhatsApp
            </p>
            <h1 className="mt-5 font-heading text-[40px] leading-[1.05] font-semibold tracking-tight text-balance text-[#1b1f24] md:text-[56px]">
              Turn every chat into a customer.
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-pretty text-[#4b5563]">
              Relay lets you design conversations visually, capture leads automatically, and step into any
              chat from one shared inbox. No code, on every channel your customers already use.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" className="h-11 px-5 text-[15px]" render={<Link href="/signup" />}>
                Create your account <ArrowRight className="size-4" />
              </Button>
              <Button size="lg" variant="outline" className="h-11 px-5 text-[15px]" render={<Link href="/login" />}>
                Log in
              </Button>
            </div>
            <ul className="mt-8 grid gap-2 text-[14px] text-[#4b5563] sm:grid-cols-2">
              {["Visual flow builder", "Shared live inbox", "Lead capture & tagging", "Confirmed broadcasts"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="size-4 text-[#00c853]" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <HeroVisual />
        </div>
      </section>

      <section id="channels" className="scroll-mt-20 border-y border-[#e5e7eb] bg-[#f4f6f8]">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-10 md:flex-row md:justify-between md:px-8">
          <p className="text-[14px] font-medium text-[#6b7280]">One workspace for every channel</p>
          <ul className="flex flex-wrap justify-center gap-3">
            {CHANNEL_IDS.filter((id) => id !== "zernio").map((id) => (
              <li
                key={id}
                className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[14px] font-medium text-[#1b1f24] ring-1 ring-[#e5e7eb]"
              >
                <span className="inline-block size-2.5 rounded-full" style={{ background: CHANNELS[id].color }} />
                {CHANNELS[id].label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="features" className="scroll-mt-20">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 md:px-8 md:py-28">
          <div className="max-w-2xl">
            <p className="text-[12px] font-semibold tracking-[0.14em] text-[#0084ff] uppercase">Features</p>
            <h2 className="mt-3 font-heading text-[32px] leading-tight font-semibold tracking-tight text-balance text-[#1b1f24] md:text-[40px]">
              Everything you need to run conversations at scale
            </h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-2xl bg-white p-6 ring-1 ring-[#e5e7eb] transition-shadow hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]">
                <ToneChip tone={feature.tone} icon={feature.icon} className="size-10 [&_svg]:size-5" />
                <h3 className="mt-4 text-[16px] font-semibold text-[#1b1f24]">{feature.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-20 bg-[#f4f6f8]">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 md:px-8 md:py-28">
          <div className="max-w-2xl">
            <p className="text-[12px] font-semibold tracking-[0.14em] text-[#0084ff] uppercase">How it works</p>
            <h2 className="mt-3 font-heading text-[32px] leading-tight font-semibold tracking-tight text-balance text-[#1b1f24] md:text-[40px]">
              Live in three steps
            </h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="relative rounded-2xl bg-white p-6 ring-1 ring-[#e5e7eb]">
                <span className="absolute top-6 right-6 font-heading text-[13px] font-semibold text-[#c9d1da] tabular-nums">
                  0{index + 1}
                </span>
                <ToneChip tone={step.tone} icon={step.icon} className="size-10 [&_svg]:size-5" />
                <h3 className="mt-4 text-[16px] font-semibold text-[#1b1f24]">{step.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-6xl px-4 py-20 md:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-[#1b1f24] px-6 py-14 text-center md:px-12">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(0,132,255,0.35),transparent_50%),radial-gradient(circle_at_90%_100%,rgba(0,200,83,0.25),transparent_45%)]" />
            <div className="relative">
              <ToneChip tone="action" icon={Link2} className="mx-auto size-10 [&_svg]:size-5" />
              <h2 className="mx-auto mt-5 max-w-2xl font-heading text-[30px] leading-tight font-semibold tracking-tight text-balance text-white md:text-[38px]">
                Start your first automated conversation today
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[16px] text-[#c9d1da]">
                Create a workspace, connect a channel, and publish a flow in minutes.
              </p>
              <Button size="lg" className="mt-8 h-11 px-5 text-[15px]" render={<Link href="/signup" />}>
                Get started <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
