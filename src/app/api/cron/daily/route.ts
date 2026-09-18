import { cronSecret, safeEqual } from "@/lib/crypto";
import { sendDailyBriefing } from "@/lib/email/daily";

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!safeEqual(token, cronSecret())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { return Response.json(await sendDailyBriefing()); }
  catch (error) { console.error("[daily]", error); return Response.json({ error: "Daily briefing failed" }, { status: 500 }); }
}
