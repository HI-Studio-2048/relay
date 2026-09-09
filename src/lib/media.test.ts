import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyMedia,
  mediaCaption,
  mediaFromPublicUrl,
  outboundPreview,
  parseStoredMediaUrl,
  resolveUploadMime,
  saveMediaFile,
  telegramMediaField,
  telegramSendMethod,
  toFlowMedia,
} from "@/lib/media";
import { canvasToDefinition, createCanvasNode, definitionToCanvas, engineDefinition } from "@/lib/flow-canvas";
import { processInboundEvent, type FlowRecord } from "@/lib/flow-engine";
import { TRIGGER_NODE_ID } from "@/lib/flow-canvas";
import type { ContactRecord } from "@/lib/types";

describe("media classification", () => {
  it("infers GIF/JPEG mime when the browser sends an empty type", () => {
    expect(resolveUploadMime("", "loop.gif")).toBe("image/gif");
    expect(resolveUploadMime("application/octet-stream", "shot.JPG")).toBe("image/jpeg");
    expect(resolveUploadMime("image/png", "ignored.gif")).toBe("image/png");
  });

  it("sends photos as sendPhoto and GIFs as sendAnimation", () => {
    expect(classifyMedia("image/jpeg", "shot.jpg")).toBe("photo");
    expect(classifyMedia("image/gif", "loop.gif")).toBe("animation");
    expect(telegramSendMethod({ url: "https://cdn.example/a.jpg", kind: "photo" })).toBe("sendPhoto");
    expect(telegramSendMethod({ url: "https://cdn.example/a.gif", kind: "animation" })).toBe("sendAnimation");
    expect(telegramMediaField({ url: "https://cdn.example/a.gif", kind: "animation" })).toBe("animation");
  });

  it("accepts https URLs and classifies .gif as animation", () => {
    const photo = mediaFromPublicUrl("https://cdn.example.com/welcome.png");
    expect(photo.kind).toBe("photo");
    expect(photo.url).toBe("https://cdn.example.com/welcome.png");
    const gif = mediaFromPublicUrl("https://cdn.example.com/wave.gif");
    expect(gif.kind).toBe("animation");
  });

  it("rejects non-https URLs", () => {
    expect(() => mediaFromPublicUrl("http://insecure.example/a.png")).toThrow(/https/i);
    expect(() => mediaFromPublicUrl("/api/media/abc")).toThrow(/https/i);
  });

  it("parses local vs remote media URLs", () => {
    expect(parseStoredMediaUrl("/api/media/aabbccddeeff0011")).toEqual({
      type: "local",
      id: "aabbccddeeff0011",
    });
    expect(parseStoredMediaUrl("https://files.example/hi.png")).toEqual({
      type: "remote",
      url: "https://files.example/hi.png",
    });
    expect(parseStoredMediaUrl("javascript:alert(1)")).toBeNull();
  });

  it("builds inbox preview lines", () => {
    expect(outboundPreview("Hi", { url: "https://x/a.png", kind: "photo" })).toBe("[photo] Hi");
    expect(outboundPreview("", { url: "https://x/a.gif", kind: "animation" })).toBe("[gif]");
    expect(mediaCaption("  hello  ")).toBe("hello");
  });
});

describe("media file store", () => {
  let dir: string | undefined;
  const previous = process.env.MEDIA_DIR;

  afterEach(async () => {
    if (previous === undefined) delete process.env.MEDIA_DIR;
    else process.env.MEDIA_DIR = previous;
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("persists an upload and returns a /api/media URL", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "relay-media-"));
    process.env.MEDIA_DIR = dir;
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const record = await saveMediaFile({ bytes: png, mime: "image/png", filename: "logo.png" });
    expect(record.kind).toBe("photo");
    expect(toFlowMedia(record).url).toBe(`/api/media/${record.id}`);
  });

  it("saves a GIF when mime is missing and the filename ends in .gif", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "relay-media-"));
    process.env.MEDIA_DIR = dir;
    const gif = new Uint8Array([71, 73, 70, 56, 57, 97]);
    const record = await saveMediaFile({ bytes: gif, mime: "", filename: "wave.gif" });
    expect(record.kind).toBe("animation");
    expect(record.mime).toBe("image/gif");
  });
});

describe("canvas + engine media", () => {
  it("round-trips a media node into a text step with media", () => {
    const mediaNode = createCanvasNode("media", { x: 300, y: 80 }, "pic1");
    mediaNode.data = {
      kind: "media",
      text: "Look at this",
      media: { url: "https://cdn.example/hi.gif", kind: "animation", filename: "hi.gif" },
    };
    const graph = {
      nodes: [
        {
          id: TRIGGER_NODE_ID,
          type: "trigger" as const,
          position: { x: 0, y: 80 },
          data: { kind: "trigger" as const },
        },
        mediaNode,
      ],
      edges: [
        {
          id: "e",
          source: TRIGGER_NODE_ID,
          target: "pic1",
          sourceHandle: "out",
          targetHandle: "in",
        },
      ],
    };

    const definition = engineDefinition(canvasToDefinition(graph));
    expect(definition.steps).toEqual([
      {
        id: "pic1",
        type: "text",
        text: "Look at this",
        media: { url: "https://cdn.example/hi.gif", kind: "animation", filename: "hi.gif" },
      },
    ]);

    const reloaded = definitionToCanvas(definition);
    const node = reloaded.nodes.find((item) => item.id === "pic1");
    expect(node?.type).toBe("send_message");
    if (node?.data.kind === "send_message") {
      const block = node.data.blocks[0];
      expect(block?.type).toBe("image");
      if (block?.type === "image") expect(block.media?.kind).toBe("animation");
    }
  });

  it("engine emits media on the reply without breaking /start text-only steps", () => {
    const flows: FlowRecord[] = [
      {
        id: "flow-media",
        triggerType: "keyword",
        triggerValue: "pic",
        isActive: true,
        definition: {
          startStepId: "shot",
          steps: [
            {
              id: "shot",
              type: "text",
              text: "Here you go",
              media: { url: "https://cdn.example/studio.png", kind: "photo" },
            },
          ],
        },
      },
    ];
    const contact: ContactRecord = {
      id: "c1",
      telegramUserId: "1001",
      username: "daniel",
      firstName: "Daniel",
      lastName: null,
      email: null,
      phone: null,
      customFields: {},
      tags: [],
    };
    const result = processInboundEvent({
      contact,
      session: null,
      flows,
      event: { telegramUserId: "1001", text: "pic" },
    });
    expect(result.replies[0]?.media?.kind).toBe("photo");
    expect(result.replies[0]?.text).toBe("Here you go");
  });
});
