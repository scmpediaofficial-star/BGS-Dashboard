"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, SendHorizontal, Trash2 } from "lucide-react";
import { addComment, deleteComment } from "@/app/(app)/comments-actions";
import { useViewer } from "@/components/shell/session-context";
import { useAction } from "@/components/shared/use-action";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/utils";

export type CommentEntity = "deliverable" | "panelist" | "sponsor" | "action_item" | "social_post" | "outreach";

type Comment = { id: string; body: string; created_at: string; author_id: string | null; author: { full_name: string; avatar_url: string | null } | null };

/** Discussion thread for any record. Reads go straight to Supabase (RLS); writes go through a Server Action so they alert the team. */
export function Comments({ entityType, entityId, entityLabel, link }: { entityType: CommentEntity; entityId: string; entityLabel: string; link: string }) {
  const { viewer, can } = useViewer();
  const key = `${entityType}:${entityId}`;
  const [loaded, setLoaded] = useState<{ key: string; comments: Comment[] } | null>(null);
  const comments = loaded?.key === key ? loaded.comments : null;
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("comments")
      .select("id, body, created_at, author_id, author:profiles!comments_author_id_fkey(full_name, avatar_url)")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at");
    setLoaded({ key, comments: (data as Comment[] | null) ?? [] });
  }, [entityType, entityId, key]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    const supabase = createClient();
    const channel = supabase
      .channel(`comments:${entityType}:${entityId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `entity_id=eq.${entityId}` }, load)
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [entityType, entityId, load]);

  const [post, posting] = useAction(addComment, { silent: true, onSuccess: () => { setDraft(""); load(); } });
  const [remove] = useAction(deleteComment, { success: "Comment removed", onSuccess: load });

  return (
    <section aria-label="Comments">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-ink">
        <MessageSquare className="size-4 text-ink-3" aria-hidden /> Comments
        {comments && comments.length > 0 && <span className="tabular rounded-full bg-surface-3 px-1.5 text-[11px] text-ink-3">{comments.length}</span>}
      </h3>

      {comments === null ? (
        <div className="grid gap-2"><Skeleton className="h-10" /><Skeleton className="h-10 w-4/5" /></div>
      ) : comments.length === 0 ? (
        <p className="rounded-xl bg-surface-2 px-3.5 py-3 text-xs text-ink-3">No comments yet. Notes added here alert the team.</p>
      ) : (
        <ul className="grid gap-3.5">
          {comments.map((c) => {
            const name = c.author?.full_name ?? "Former member";
            const mine = c.author_id === viewer.id;
            return (
              <li key={c.id} className="group flex gap-2.5">
                <Avatar name={name} src={c.author?.avatar_url} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2 text-xs">
                    <strong className="font-semibold text-ink">{name}</strong>
                    <time dateTime={c.created_at} className="text-ink-3">{timeAgo(c.created_at)}</time>
                    {(mine || can("records.delete")) && (
                      <button type="button" onClick={() => remove(c.id)} aria-label="Delete comment" className="ml-auto rounded p-0.5 text-ink-3 opacity-0 transition-opacity hover:text-critical-ink focus-visible:opacity-100 group-hover:opacity-100 max-lg:opacity-100">
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-2">{c.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {can("comments.write") && (
        <form
          className="mt-4 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) post({ entityType, entityId, entityLabel, link, body: draft });
          }}
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) { e.preventDefault(); post({ entityType, entityId, entityLabel, link, body: draft }); }
            }}
            placeholder="Add a comment…"
            aria-label="Add a comment"
            maxLength={2000}
            className="min-h-[42px] flex-1 resize-none py-2.5"
            rows={1}
          />
          <Button type="submit" size="icon" loading={posting} disabled={!draft.trim()} aria-label="Post comment"><SendHorizontal /></Button>
        </form>
      )}
    </section>
  );
}
