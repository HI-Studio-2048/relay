"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Tailwind's `md` breakpoint (`48rem`). CSS shows one cut; JS attaches only that cut's file. */
const DESKTOP_QUERY = "(min-width: 48rem)";
const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const DESKTOP_SRC = "/videos/abandoned-cart-16x9.mp4";
const MOBILE_SRC = "/videos/abandoned-cart-9x16.mp4";
const DESKTOP_POSTER = "/videos/abandoned-cart-poster.png";
const MOBILE_POSTER = "/videos/abandoned-cart-poster-9x16.jpg";
const CAPTIONS = "/videos/abandoned-cart-16x9.vtt";

const LABEL = "Promo showing an abandoned cart followed up automatically. Uses example data.";

/**
 * `null` on the server and the first client render, so neither file is in the HTML.
 * After hydration the snapshot matches the viewport and only that video gets a `src`.
 */
function useMedia(query: string): boolean | null {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => null,
  );
}

function stop(video: HTMLVideoElement) {
  video.pause();
  if (!video.currentSrc && !video.getAttribute("src")) return;
  video.removeAttribute("src");
  video.load();
}

export function PromoVideo() {
  const mobileRef = useRef<HTMLVideoElement>(null);
  const desktopRef = useRef<HTMLVideoElement>(null);
  const desktop = useMedia(DESKTOP_QUERY);
  const reduced = useMedia(MOTION_QUERY);
  const [userPaused, setUserPaused] = useState(false);
  const [playing, setPlaying] = useState(false);
  const autoplay = reduced === false && !userPaused;

  useEffect(() => {
    const active = desktop === true ? desktopRef.current : desktop === false ? mobileRef.current : null;
    const idle = desktop === true ? mobileRef.current : desktop === false ? desktopRef.current : null;
    if (idle) stop(idle);
    if (!active) return;
    active.muted = true;
    if (!autoplay) {
      active.pause();
      return;
    }
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      void active.play().catch(() => {
        if (!cancelled) setPlaying(false);
      });
    };
    if (active.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) start();
    else active.addEventListener("canplay", start, { once: true });
    return () => {
      cancelled = true;
      active.removeEventListener("canplay", start);
    };
  }, [desktop, autoplay]);

  useEffect(() => {
    const videos = [mobileRef.current, desktopRef.current];
    const onPlay = (event: Event) => {
      const current = desktop === true ? desktopRef.current : mobileRef.current;
      if (event.currentTarget === current) setPlaying(true);
    };
    const onPause = (event: Event) => {
      const current = desktop === true ? desktopRef.current : mobileRef.current;
      if (event.currentTarget === current) setPlaying(false);
    };
    for (const video of videos) {
      video?.addEventListener("play", onPlay);
      video?.addEventListener("pause", onPause);
    }
    return () => {
      for (const video of videos) {
        video?.removeEventListener("play", onPlay);
        video?.removeEventListener("pause", onPause);
      }
    };
  }, [desktop]);

  function toggle() {
    const active = desktop ? desktopRef.current : mobileRef.current;
    if (!active?.getAttribute("src")) return;
    if (active.paused) {
      setUserPaused(false);
      active.muted = true;
      void active.play().catch(() => setPlaying(false));
    } else {
      setUserPaused(true);
      active.pause();
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-[420px] md:max-w-none">
      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_12px_40px_rgba(16,24,40,0.12)] ring-1 ring-[#e5e7eb]">
        <video
          ref={mobileRef}
          className="aspect-[9/16] w-full bg-[#f4f6f8] object-contain md:hidden"
          poster={MOBILE_POSTER}
          src={desktop === false ? MOBILE_SRC : undefined}
          muted
          loop
          playsInline
          autoPlay={autoplay}
          preload="none"
          aria-label={LABEL}
        >
          {/* Burned into the picture, so this stays off until a viewer turns captions on. */}
          <track kind="captions" srcLang="en" label="English" src={CAPTIONS} />
        </video>
        <video
          ref={desktopRef}
          className="hidden aspect-video w-full bg-[#f4f6f8] object-contain md:block"
          poster={DESKTOP_POSTER}
          src={desktop === true ? DESKTOP_SRC : undefined}
          muted
          loop
          playsInline
          autoPlay={autoplay}
          preload="none"
          aria-label={LABEL}
        >
          <track kind="captions" srcLang="en" label="English" src={CAPTIONS} />
        </video>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause video" : "Play video"}
        className="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-white/95 text-[#1b1f24] shadow-[0_1px_3px_rgba(16,24,40,0.10)] ring-1 ring-[#e5e7eb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0084ff]"
      >
        {playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
      </button>
    </div>
  );
}
