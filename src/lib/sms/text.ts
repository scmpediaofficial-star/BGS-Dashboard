/**
 * Phone numbers, message length and personalisation for bulk SMS.
 * Safe to import anywhere: the composer uses it for live counts and the
 * Server Action uses the very same rules, so what the screen says is what is sent.
 */

/** Country code assumed when a number is written the local way (0XX…). */
export const DEFAULT_COUNTRY_CODE = "233";

/**
 * Turns whatever people type into the form the gateway accepts: a local Ghana
 * number stays local (0244123456, as the gateway's own examples are written)
 * and anything else becomes international digits without the plus
 * (447700900123). Returns null when it cannot be a phone number.
 */
export function normalisePhone(raw: string | null | undefined, countryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  const international = digits.startsWith("+") || (!digits.startsWith("0") && digits.length > 10);
  digits = digits.replace(/\D/g, "");
  if (!digits) return null;

  if (international) {
    if (digits.length < 10 || digits.length > 15) return null;
    return digits.startsWith("233") && digits.length === 12 ? `0${digits.slice(3)}` : digits;
  }
  // Written locally: 0XXXXXXXXX, or 9 digits with the leading zero dropped.
  if (digits.startsWith("0")) {
    if (digits.length === 10) return countryCode === "233" ? digits : `${countryCode}${digits.slice(1)}`;
    return null;
  }
  if (digits.length === 9) return countryCode === "233" ? `0${digits}` : `${countryCode}${digits}`;
  if (digits.length === 10 && countryCode !== "233") return `${countryCode}${digits}`;
  return null;
}

/** 0244123456 → 024 412 3456; 447700900123 → +44 7700 900123-ish grouping for reading. */
export function displayPhone(phone: string): string {
  if (/^0\d{9}$/.test(phone)) return `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`;
  if (/^\d{10,15}$/.test(phone)) return `+${phone.replace(/(\d{3})(?=\d)/g, "$1 ").trim()}`;
  return phone;
}

// The GSM 7-bit alphabet. Anything outside it makes the whole message Unicode (70 characters a part).
const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€";

export type SmsLength = { chars: number; segments: number; unicode: boolean; perSegment: number };

/** How many SMS parts a message costs, the way networks count them. */
export function smsLength(message: string): SmsLength {
  const text = message.replace(/\r\n/g, "\n");
  const unicode = [...text].some((c) => !GSM.includes(c) && !GSM_EXTENDED.includes(c));
  const chars = unicode ? [...text].length : [...text].reduce((n, c) => n + (GSM_EXTENDED.includes(c) ? 2 : 1), 0);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const segments = chars === 0 ? 0 : chars <= single ? 1 : Math.ceil(chars / multi);
  return { chars, segments, unicode, perSegment: segments > 1 ? multi : single };
}

/** Straight quotes and plain punctuation, so a pasted message doesn't turn into a Unicode (70-character) one. */
export function plainText(message: string): string {
  return message.replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/ /g, " ");
}

export const NAME_TOKEN = /\{\s*name\s*\}/gi;
export const hasNameToken = (message: string) => NAME_TOKEN.test(message);

/** First name, so "Dr Ama Mensah" becomes "Ama" and "MENSAH, Ama" becomes "Ama". */
export function firstName(name: string | null | undefined): string {
  if (!name) return "";
  const cleaned = name.includes(",") ? name.split(",")[1] ?? "" : name;
  const parts = cleaned.trim().split(/\s+/).filter((p) => !/^(mr|mrs|ms|miss|dr|prof|ing|hon|rev|sir|h\.?e\.?|chief|nana|alhaji|hajia|eng|esq)\.?$/i.test(p));
  const first = parts[0] ?? "";
  return first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : "";
}

/** Fills {name} for one person. Without a name the token and any space before it are dropped, so "Dear {name}," reads "Dear,". */
export function renderSms(template: string, name: string | null | undefined, signature = ""): string {
  const who = firstName(name);
  const body = template.replace(who ? NAME_TOKEN : /\s*\{\s*name\s*\}/gi, who).replace(/[ \t]{2,}/g, " ").trim();
  const sig = signature.trim();
  return sig && !body.endsWith(sig) ? `${body}\n${sig}` : body;
}

export type ParsedNumber = { name: string | null; phone: string | null; raw: string; line: number };

/**
 * Reads pasted numbers or a CSV. One person per line: "0244123456",
 * "Ama Mensah, 0244123456" or a CSV with a header naming the phone column.
 */
export function parseNumberList(text: string, countryCode = DEFAULT_COUNTRY_CODE): ParsedNumber[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const rows = lines.map(splitCsvLine);
  const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const phoneCol = header.findIndex((h) => /^(phone|mobile|number|tel|telephone|msisdn|cell|whatsapp|phonenumber|mobilenumber)/.test(h));
  const nameCol = header.findIndex((h) => /^(name|fullname|delegate|contact|person|holder)/.test(h));
  const hasHeader = phoneCol >= 0 || nameCol >= 0;
  const out: ParsedNumber[] = [];
  rows.forEach((cells, index) => {
    if (hasHeader && index === 0) return;
    let phone: string | null = null;
    let name: string | null = null;
    if (hasHeader && phoneCol >= 0) {
      phone = normalisePhone(cells[phoneCol], countryCode);
      name = nameCol >= 0 ? cells[nameCol]?.trim() || null : null;
    } else {
      // No header: the cell that looks most like a number is the number; the rest is the name.
      const scored = cells.map((c, i) => ({ i, phone: normalisePhone(c, countryCode), digits: c.replace(/\D/g, "").length }));
      const best = scored.filter((s) => s.phone).sort((a, b) => b.digits - a.digits)[0];
      phone = best?.phone ?? null;
      name = cells.filter((_, i) => i !== best?.i).join(" ").trim() || null;
    }
    out.push({ name, phone, raw: lines[index], line: index + 1 });
  });
  return out;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === ";" || c === "\t") { cells.push(cell.trim()); cell = ""; }
    else cell += c;
  }
  cells.push(cell.trim());
  return cells;
}
