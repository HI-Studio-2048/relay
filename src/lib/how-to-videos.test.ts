import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHANNEL_IDS, CHANNELS } from "@/lib/channels/types";
import { HOW_TO_VIDEOS } from "@/lib/how-to-videos";

describe("connect tutorials", () => {
  it("lists one English video for every messaging channel, in catalog order", () => {
    expect(HOW_TO_VIDEOS.map((video) => video.channel)).toEqual([...CHANNEL_IDS]);
    for (const video of HOW_TO_VIDEOS) {
      expect(video.title).toBe(`Connect ${CHANNELS[video.channel].label}`);
      expect(video.description.length).toBeGreaterThan(20);
      expect(video.src).toBe(`/videos/tutorials/connect-${video.channel}.mp4`);
      expect(video.poster).toBe(`/videos/tutorials/connect-${video.channel}.webp`);
      expect(video.captions).toBe(`/videos/tutorials/connect-${video.channel}.vtt`);
    }
  });

  it("ships a video, a poster and a captions file that stays available but is not the default", () => {
    for (const video of HOW_TO_VIDEOS) {
      expect(statSync(`public${video.src}`).size).toBeGreaterThan(100_000);
      expect(statSync(`public${video.poster}`).size).toBeGreaterThan(1000);
      const captions = readFileSync(`public${video.captions}`, "utf8");
      expect(captions.startsWith("WEBVTT\n")).toBe(true);
      expect(captions).toContain("-->");
    }
  });
});
