"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { check, f, one, run, type ActionResult } from "@/lib/actions";
import { requireCapability } from "@/lib/auth/session";
import { SPONSOR_STAGE } from "@/lib/domain";
import { recordEvent } from "@/lib/events";
import { truncate } from "@/lib/utils";

const stages = ["prospect", "approached", "proposal_sent", "negotiating", "confirmed", "declined"] as const;
const schema = z.object({ id: f.optionalId, organization: f.text(220), package: f.optionalText(100), stage: z.enum(stages), amount: f.optionalMoney,
  currency: z.enum(["GHS", "USD"]).default("GHS"), responsibility: f.optionalText(160), owner_id: f.optionalId, contact_person: f.optionalText(160),
  email: f.optionalEmail, phone: f.optionalText(60), next_action: f.optionalText(500), next_action_on: f.optionalDate, comment: f.optionalText(3000), logo_url: f.optionalUrl });

export async function saveSponsor(input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.write");
    const data = schema.parse(input);
    const values = { organization: data.organization, package: data.package ?? null, stage: data.stage, amount: data.amount ?? null, currency: data.currency,
      responsibility: data.responsibility ?? null, owner_id: data.owner_id ?? null, contact_person: data.contact_person ?? null, email: data.email ?? null,
      phone: data.phone ?? null, next_action: data.next_action ?? null, next_action_on: data.next_action_on ?? null, comment: data.comment ?? null,
      logo_url: data.logo_url ?? null, updated_by: profile.id };
    let id = data.id;
    if (id) { one(await supabase.from("sponsors").select("id").eq("id", id).single()); check(await supabase.from("sponsors").update(values).eq("id", id)); }
    else id = one(await supabase.from("sponsors").insert({ ...values, sort_order: Math.floor(Date.now() / 1000) }).select("id").single()).id;
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: data.id ? "sponsor.updated" : "sponsor.created", category: "sponsorship",
      summary: `${data.id ? "updated" : "added"} sponsor “${truncate(data.organization, 80)}”`, entity: { type: "sponsor", id, label: data.organization },
      link: `/sponsorship?item=${id}`, include: [data.owner_id], importance: "low" });
    revalidatePath("/", "layout"); return { id };
  });
}

export async function setSponsorStage(id: string, stage: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.write");
    const input = z.object({ id: f.id, stage: z.enum(stages) }).parse({ id, stage });
    const before = one(await supabase.from("sponsors").select("organization, stage, owner_id").eq("id", input.id).single());
    if (before.stage === input.stage) return undefined;
    check(await supabase.from("sponsors").update({ stage: input.stage, updated_by: profile.id }).eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "sponsor.stage_changed", category: "sponsorship",
      summary: `moved “${before.organization}” to ${SPONSOR_STAGE[input.stage].label}`, entity: { type: "sponsor", id, label: before.organization }, link: `/sponsorship?item=${id}`,
      include: [before.owner_id], importance: ["confirmed", "declined"].includes(input.stage) ? "high" : "normal", tone: input.stage === "confirmed" ? "good" : input.stage === "declined" ? "critical" : "default" });
    revalidatePath("/", "layout"); return undefined;
  });
}

export async function deleteSponsor(id: string): Promise<ActionResult> {
  return run(async () => {
    const { profile, supabase } = await requireCapability("records.delete");
    const row = one(await supabase.from("sponsors").select("organization").eq("id", f.id.parse(id)).single());
    check(await supabase.from("sponsors").delete().eq("id", id));
    await recordEvent({ actor: { id: profile.id, name: profile.full_name }, action: "sponsor.deleted", category: "sponsorship", summary: `removed sponsor “${row.organization}”`, link: "/sponsorship", audience: "managers", tone: "warning" });
    revalidatePath("/", "layout"); return undefined;
  });
}
