import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHANNELS } from "@/lib/channels/types";
import { HOW_TO_VIDEOS } from "@/lib/how-to-videos";

export const metadata: Metadata = {
  title: "How to connect a channel · Recatch",
  description:
    "English video guides for connecting Telegram, Instagram, Messenger, WhatsApp, Discord, Slack and Bluesky to Recatch.",
};

export default function HowToPage() {
  return (
    <>
      <section className="border-b border-[#e5e7eb] bg-[#f4f6f8]">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
          <p className="text-[12px] font-semibold tracking-[0.14em] text-[#0084ff] uppercase">How to</p>
          <h1 className="mt-3 max-w-3xl font-heading text-[36px] leading-[1.08] font-semibold tracking-tight text-balance text-[#1b1f24] md:text-[48px]">
            Connect a channel
          </h1>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-pretty text-[#4b5563]">
            A short video for each channel. They have a voiceover, so nothing plays until you press play.
            Captions are already on the picture; the text track stays off unless you turn it on in the player.
          </p>
          <ul className="mt-8 flex flex-wrap gap-2">
            {HOW_TO_VIDEOS.map((video) => (
              <li key={video.channel}>
                <a
                  href={`#${video.channel}`}
                  className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[14px] font-medium text-[#1b1f24] ring-1 ring-[#e5e7eb] hover:ring-[#c9d1da]"
                >
                  <span className="inline-block size-2.5 rounded-full" style={{ background: CHANNELS[video.channel].color }} />
                  {CHANNELS[video.channel].label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:px-8 md:py-16">
        <ol className="grid gap-8">
          {HOW_TO_VIDEOS.map((video, index) => {
            const channel = CHANNELS[video.channel];
            const titleId = `${video.channel}-title`;
            return (
              <li
                key={video.channel}
                id={video.channel}
                className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-[#e5e7eb] md:p-6"
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 inline-block size-2.5 shrink-0 rounded-full"
                      style={{ background: channel.color }}
                      aria-hidden
                    />
                    <div>
                      <h2 id={titleId} className="font-heading text-[22px] leading-tight font-semibold tracking-tight text-[#1b1f24] md:text-[26px]">
                        {video.title}
                      </h2>
                      <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-[#6b7280]">{video.description}</p>
                    </div>
                  </div>
                  <span className="font-heading text-[13px] font-semibold text-[#c9d1da] tabular-nums">
                    0{index + 1}
                  </span>
                </div>
                <div className="overflow-hidden rounded-xl bg-[#0c1118] shadow-[0_12px_40px_rgba(16,24,40,0.12)] ring-1 ring-[#e5e7eb]">
                  <video
                    controls
                    preload="none"
                    poster={video.poster}
                    playsInline
                    width={1280}
                    height={720}
                    className="aspect-video w-full bg-[#0c1118] object-contain"
                    aria-labelledby={titleId}
                  >
                    <source src={video.src} type="video/mp4" />
                    {/* Burned into the picture, so this stays off until a viewer turns captions on. */}
                    <track kind="captions" srcLang="en" label="English" src={video.captions} />
                  </video>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <section>
        <div className="mx-auto w-full max-w-6xl px-4 pb-20 md:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-[#1b1f24] px-6 py-14 text-center md:px-12">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(0,132,255,0.35),transparent_50%),radial-gradient(circle_at_90%_100%,rgba(0,200,83,0.25),transparent_45%)]" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl font-heading text-[30px] leading-tight font-semibold tracking-tight text-balance text-white md:text-[38px]">
                Ready to connect your first channel?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[16px] text-[#c9d1da]">
                Create a workspace, then follow the video for the channel you use.
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
