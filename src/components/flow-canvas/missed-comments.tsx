"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";

type Post = { id: string; accountId: string; platform: string; username: string | null; caption: string; permalink: string | null; picture: string | null; createdAt: string | null };
type Missed = { commentId: string; username: string | null; name: string | null; text: string; createdAt: string | null };
type Progress = { sent: number; failed: number; total: number; done: boolean };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");

/**
 * Comments that arrived while this flow wasn't answering them (switched off, wrong keyword) can still get
 * the DM for 7 days. Pick a post, see who was missed, then send. Nothing goes out before the button.
 */
export function MissedComments({ flowId, onClose }: { flowId: string; onClose: () => void }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [missed, setMissed] = useState<Missed[] | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    const timer = setTimeout(
      () =>
        void api<{ posts: Post[] }>(`/api/flows/${flowId}/missed-comments`)
          .then((data) => setPosts(data.posts))
          .catch((error) => {
            toast.error(error instanceof Error ? error.message : "Could not load posts");
            setPosts([]);
          }),
      0,
    );
    return () => clearTimeout(timer);
  }, [flowId]);

  const pick = async (next: Post) => {
    setPost(next);
    setMissed(null);
    setProgress(null);
    try {
      const query = new URLSearchParams({ accountId: next.accountId, postId: next.id });
      const data = await api<{ missed: Missed[] }>(`/api/flows/${flowId}/missed-comments?${query}`);
      setMissed(data.missed);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load comments");
      setMissed([]);
    }
  };

  const send = async () => {
    if (!post || !missed?.length) return;
    if (!window.confirm(`Send this flow's DM to ${missed.length} ${missed.length === 1 ? "person" : "people"}? No public replies are posted.`)) return;
    let sent = 0;
    let failed = 0;
    setProgress({ sent, failed, total: missed.length, done: false });
    try {
      for (let round = 0; round < 100; round++) {
        const data = await api<{ sent: number; failed: number; remaining: number }>(`/api/flows/${flowId}/missed-comments`, {
          method: "POST",
          body: JSON.stringify({ accountId: post.accountId, postId: post.id, limit: 20 }),
        });
        sent += data.sent;
        failed += data.failed;
        setProgress({ sent, failed, total: missed.length, done: false });
        if (data.remaining === 0 || data.sent + data.failed === 0) break;
      }
      toast.success(`Sent ${sent} DM${sent === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sending stopped");
    } finally {
      setProgress({ sent, failed, total: missed.length, done: true });
    }
  };

  const sending = Boolean(progress && !progress.done);

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-sm flex-col border-l bg-white shadow-xl">
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        {post ? (
          <Button size="icon-sm" variant="ghost" aria-label="Back to posts" disabled={sending} onClick={() => setPost(null)}>
            <ArrowLeft className="size-4" />
          </Button>
        ) : (
          <MessageCircle className="size-4 text-[#7b61ff]" />
        )}
        <p className="flex-1 text-[14px] font-semibold">Missed comments</p>
        <Button size="icon-sm" variant="ghost" aria-label="Close missed comments" disabled={sending} onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!post ? (
          <>
            <p className="mb-3 text-[12px] leading-snug text-[#6b7280]">
              People who commented a matching word while this flow wasn&apos;t answering can still get its DM, for up to 7 days after
              their comment. Pick the post. Nothing is sent until you confirm.
            </p>
            {posts === null ? (
              <p className="text-[13px] text-[#6b7280]">Loading posts…</p>
            ) : posts.length === 0 ? (
              <p className="text-[13px] text-[#6b7280]">No recent posts with comments.</p>
            ) : (
              <ul className="space-y-2">
                {posts.map((item) => (
                  <li key={`${item.accountId}-${item.id}`}>
                    <button
                      type="button"
                      onClick={() => void pick(item)}
                      className="flex w-full items-center gap-3 rounded-xl p-2 text-left ring-1 ring-[#e5e7eb] hover:bg-[#f9fafb]"
                    >
                      {item.picture ? (
                        // eslint-disable-next-line @next/next/no-img-element -- Instagram's own thumbnail
                        <img src={item.picture} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="size-12 shrink-0 rounded-lg bg-[#f4f6f8]" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[13px] text-[#1b1f24]">{item.caption || "(no caption)"}</span>
                        <span className="block text-[11px] text-[#8b95a1]">
                          {item.username ? `@${item.username} · ` : ""}
                          {when(item.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : missed === null ? (
          <p className="text-[13px] text-[#6b7280]">Reading comments…</p>
        ) : (
          <>
            <p className="mb-2 text-[13px] text-[#1b1f24]">
              {missed.length === 0
                ? "Everyone whose comment matches this flow already got the DM."
                : `${missed.length} ${missed.length === 1 ? "person" : "people"} commented a matching word and never got the DM.`}
            </p>
            {missed.length > 0 ? (
              <p className="mb-3 text-[11px] leading-snug text-[#6b7280]">
                Each gets this flow&apos;s first message as a private reply to their comment, from the saved version of the flow. No public
                reply goes under the comment.
              </p>
            ) : null}
            {progress ? (
              <p className="mb-3 rounded-lg bg-[#f5f3ff] px-3 py-2 text-[12px] text-[#4c1d95]">
                {progress.done ? "Finished. " : "Sending… "}
                {progress.sent} sent{progress.failed ? `, ${progress.failed} refused by Instagram` : ""} of {progress.total}
              </p>
            ) : null}
            <ul className="space-y-1.5">
              {missed.map((item) => (
                <li key={item.commentId} className="rounded-lg px-2.5 py-1.5 text-[12px] ring-1 ring-[#eef0f3]">
                  <span className="font-medium text-[#1b1f24]">{item.username ? `@${item.username}` : item.name ?? "Someone"}</span>
                  <span className="ml-1.5 text-[#8b95a1]">{when(item.createdAt)}</span>
                  <p className="truncate text-[#374151]">{item.text}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {post && missed?.length && !progress?.done ? (
        <footer className="border-t p-3">
          <Button className="w-full" disabled={sending} onClick={() => void send()}>
            {sending ? "Sending…" : `Send the DM to ${missed.length} ${missed.length === 1 ? "person" : "people"}`}
          </Button>
        </footer>
      ) : null}
    </aside>
  );
}
