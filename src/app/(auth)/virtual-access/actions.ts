"use server";

import { z } from "zod";
import { ActionError, f, run, type ActionResult } from "@/lib/actions";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ email: f.email, code: z.string().trim().toUpperCase().regex(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/, "Enter the code from your access email.") });

export async function checkVirtualAccess(input: { email: string; code: string }): Promise<ActionResult<{ joinUrl: string; meetingId: string | null }>> {
  return run(async () => {
    const data = schema.parse(input);
    const { data: sale } = await createAdminClient().from("ticket_sales")
      .select("id, payment_status, access_sent_at, ticket_type:ticket_types(is_virtual)")
      .eq("access_code", data.code).eq("buyer_email", data.email).maybeSingle();
    if (!sale || !sale.ticket_type?.is_virtual || !sale.access_sent_at || !["paid", "complimentary"].includes(sale.payment_status)) {
      throw new ActionError("We couldn't verify that email and code. Check your access email and try again.");
    }
    const { virtual } = await getSettings();
    if (!virtual.join_url) throw new ActionError("Your access is confirmed. The summit team will publish the Zoom link soon.");
    return { joinUrl: virtual.join_url, meetingId: virtual.meeting_id };
  });
}
