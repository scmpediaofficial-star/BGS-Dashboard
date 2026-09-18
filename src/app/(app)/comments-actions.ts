"use server";

import { z } from "zod";
import { check, f, run, type ActionResult } from "@/lib/actions";
import { requireCapability } from "@/lib/auth/session";
import { recordEvent } from "@/lib/events";
import type { Category } from "@/lib/notifications";
import { truncate } from "@/lib/utils";

const ENTITY_CATEGORY: Record<string, Category> = {
  deliverable: "deliverables",
  panelist: "programme",
  outreach: "outreach",
  sponsor: "sponsorship",
  action_item: "meetings",
  social_post: "social",
};

const schema = z.object({
  entityType: z.enum(["deliverable", "panelist", "outreach", "sponsor", "action_item", "social_post"]),
  entityId: f.id,
  entityLabel: f.text(300),
  link: z.string().startsWith("/").max(300),
  body: f.text(2000),
});

export async function addComment(input: z.input<typeof schema>): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("comments.write");
    const data = schema.parse(input);

    check(await supabase.from("comments").insert({ entity_type: data.entityType, entity_id: data.entityId, author_id: profile.id, body: data.body }));

    await recordEvent({
      actor: { id: profile.id, name: profile.full_name },
      action: `${data.entityType}.commented`,
      category: ENTITY_CATEGORY[data.entityType],
      summary: `commented on “${truncate(data.entityLabel, 80)}”`,
      detail: truncate(data.body, 280),
      entity: { type: data.entityType, id: data.entityId, label: data.entityLabel },
      link: data.link,
    });
    return undefined;
  });
}

export async function deleteComment(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireCapability("comments.write");
    // RLS allows authors to remove their own comments and managers to remove any.
    check(await supabase.from("comments").delete().eq("id", f.id.parse(id)));
    return undefined;
  });
}
