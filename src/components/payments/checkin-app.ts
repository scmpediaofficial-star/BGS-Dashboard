import type { CheckinKit } from "@/components/payments/registrants";

/**
 * The offline entry check-in app: public/checkin/template.html with the ticket list and the white
 * BGS logo written into it, as one .html file that opens by double-click on Mac and Windows.
 */

const TEMPLATE_URL = "/checkin/template.html";
const LOGO_URL = "/brand/logo-white.png";
const DATA_MARK = "__BGS_DATA__";
const LOGO_MARK = "__BGS_LOGO__";

async function dataUrl(url: string): Promise<string> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${url}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function checkinAppHtml(kit: CheckinKit): Promise<Blob> {
  const [response, logo] = await Promise.all([fetch(TEMPLATE_URL, { cache: "no-store" }), dataUrl(LOGO_URL)]);
  if (!response.ok) throw new Error("The check-in app template could not be loaded.");
  const template = await response.text();
  if (!template.includes(DATA_MARK) || !template.includes(LOGO_MARK)) throw new Error("The check-in app template is incomplete.");
  // Inside <script type="application/json"> only "<" can end the block early, so it is written as a JSON unicode escape.
  const json = JSON.stringify(kit).replace(/</g, "\\u003c");
  // Replacer functions, so a "$" in someone's name is never read as a replacement pattern.
  const html = template.replace(DATA_MARK, () => json).replace(LOGO_MARK, () => logo);
  return new Blob([html], { type: "text/html;charset=utf-8" });
}
