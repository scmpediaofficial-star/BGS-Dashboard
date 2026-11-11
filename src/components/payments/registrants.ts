import type { PaystackPage, PaystackRegistration } from "@/lib/paystack";
import { formatDate, formatNumber, formatTime } from "@/lib/utils";

/**
 * Everyone who has paid on Paystack, split by what they paid for:
 * the Zoom pages (students and regular) and the in-person ticket.
 * Pure: built on the server, drawn on screen, in the PDF and in the Excel file.
 */

export type RegistrantColumn = { key: string; header: string; /** Share of the PDF table width. */ width: number; numeric?: boolean; /** Excel only: too wide for the PDF page. */ excelOnly?: boolean };
export type RegistrantRow = Record<string, string | number>;
export type RegistrantGroup = {
  key: "zoom-student" | "zoom-regular" | "in-person" | "other";
  /** "Zoom (online) — Students · GHS 100" */
  title: string;
  /** Excel sheet name, at most 31 characters. */
  sheet: string;
  /** What the list is and how it is used. */
  note: string;
  columns: RegistrantColumn[];
  rows: RegistrantRow[];
  count: number;
  collected: number;
  currency: string;
};
export type RegistrantsReport = { title: string; generatedAt: string; groups: RegistrantGroup[]; truncated: boolean };

/** "GHS 2,500" — spelt out, because the cedi sign is missing from the PDF's built-in font. */
export const money = (amount: number, currency = "GHS") => `${currency} ${formatNumber(amount)}`;

const pick = (r: PaystackRegistration, pattern: RegExp, except?: RegExp) =>
  r.fields.find((f) => pattern.test(`${f.label} ${f.key}`) && !(except && except.test(`${f.label} ${f.key}`)))?.value ?? "";

/** "11 Nov 2026, 14:40" in Accra time. */
const paidOn = (iso: string | null) => (iso ? `${formatDate(iso)}, ${formatTime(iso)}` : "");

const slugOf = (url: string | null) => url?.match(/\/pay\/([\w-]+)/i)?.[1]?.toLowerCase() ?? null;

function classify(r: PaystackRegistration, pages: Map<string, PaystackPage>, seat: number | null): RegistrantGroup["key"] {
  const page = pages.get(slugOf(r.referrer) ?? "");
  if (page) return /student/i.test(page.name) ? "zoom-student" : "zoom-regular";
  if (r.orderId !== null || /\/buy\//i.test(r.referrer ?? "") || (seat && r.amount >= seat && r.amount % seat === 0)) return "in-person";
  const student = [...pages.values()].find((p) => /student/i.test(p.name))?.amount;
  const regular = [...pages.values()].find((p) => !/student/i.test(p.name))?.amount;
  if (student !== undefined && r.amount === student) return "zoom-student";
  if (regular !== undefined && r.amount === regular) return "zoom-regular";
  return "other";
}

const PAID = { key: "paid", header: "Paid on", width: 1.3 };
const REF = { key: "reference", header: "Paystack reference", width: 1.35 };
const NO = { key: "no", header: "No.", width: 0.4, numeric: true };

export function buildRegistrants(input: {
  registrations: PaystackRegistration[]; pages: PaystackPage[]; truncated: boolean;
  seat: { price: number | null; currency: string }; eventName: string; eventLine: string; generatedAt: string;
}): RegistrantsReport {
  const pages = new Map(input.pages.map((p) => [slugOf(p.url) ?? "", p]));
  const seat = input.seat.price;
  const buckets: Record<RegistrantGroup["key"], PaystackRegistration[]> = { "zoom-student": [], "zoom-regular": [], "in-person": [], other: [] };
  for (const r of [...input.registrations].sort((a, b) => Date.parse(a.paidAt ?? "") - Date.parse(b.paidAt ?? ""))) buckets[classify(r, pages, seat)].push(r);

  const pagePrice = (student: boolean) => input.pages.find((p) => /student/i.test(p.name) === student)?.amount ?? null;
  const zoomColumns = (extra: RegistrantColumn): RegistrantColumn[] => [
    NO, { key: "name", header: "Full name", width: 1.9 }, { key: "zoomEmail", header: "Zoom sign-in email", width: 2.4 },
    { key: "institution", header: "Institution", width: 1.9 }, extra, { key: "phone", header: "Phone", width: 1.15 }, PAID, REF,
    { key: "payerEmail", header: "Email used to pay", width: 2, excelOnly: true }, { key: "amount", header: "Amount", width: 0.8, numeric: true, excelOnly: true },
  ];
  const zoomRow = (r: PaystackRegistration, i: number, extraKey: string, extraPattern: RegExp): RegistrantRow => ({
    no: i + 1,
    name: pick(r, /full.?name|^name\b/i) || r.customer.name,
    zoomEmail: (pick(r, /zoom/i) || pick(r, /e-?mail/i) || r.customer.email || "").toLowerCase(),
    institution: pick(r, /institution|organi[sz]ation|company|school|university/i),
    [extraKey]: pick(r, extraPattern),
    phone: pick(r, /phone|mobile|whatsapp/i) || r.customer.phone || "",
    paid: paidOn(r.paidAt),
    reference: r.reference,
    payerEmail: (r.customer.email ?? "").toLowerCase(),
    amount: r.amount,
  });
  const total = (list: PaystackRegistration[]) => list.reduce((sum, r) => sum + r.amount, 0);
  const currency = input.registrations[0]?.currency ?? input.seat.currency;

  const groups: RegistrantGroup[] = [];
  const studentPrice = pagePrice(true);
  groups.push({
    key: "zoom-student", sheet: "Zoom - Students", currency,
    title: `Zoom (online) — Students${studentPrice !== null ? ` · ${money(studentPrice, currency)}` : ""}`,
    note: "Paid on the student Zoom registration page. Each student joins Zoom by signing in with the Zoom sign-in email below, which is how they are verified.",
    columns: zoomColumns({ key: "programme", header: "Programme", width: 1.7 }),
    rows: buckets["zoom-student"].map((r, i) => zoomRow(r, i, "programme", /programme|program|course/i)),
    count: buckets["zoom-student"].length, collected: total(buckets["zoom-student"]),
  });
  const regularPrice = pagePrice(false);
  groups.push({
    key: "zoom-regular", sheet: "Zoom - Regular", currency,
    title: `Zoom (online) — Regular${regularPrice !== null ? ` · ${money(regularPrice, currency)}` : ""}`,
    note: "Paid on the regular Zoom registration page. Each person joins Zoom by signing in with the Zoom sign-in email below, which is how they are verified.",
    columns: zoomColumns({ key: "position", header: "Position", width: 1.7 }),
    rows: buckets["zoom-regular"].map((r, i) => zoomRow(r, i, "position", /position|title|role|designation/i)),
    count: buckets["zoom-regular"].length, collected: total(buckets["zoom-regular"]),
  });
  const inPerson = buckets["in-person"];
  groups.push({
    key: "in-person", sheet: "In person - Main ticket", currency,
    title: `In person — Main ticket${seat ? ` · ${money(seat, input.seat.currency)}` : ""}`,
    note: `Bought on Paystack for ${input.eventLine}. A payment of several times the ticket price covers that many tickets. Tickets paid by bank transfer or by an institution are on the Tickets page, not here.`,
    columns: [NO, { key: "name", header: "Name", width: 2.1 }, { key: "email", header: "Email", width: 2.5 }, { key: "phone", header: "Phone", width: 1.3 },
      { key: "tickets", header: "Tickets", width: 0.65, numeric: true }, { key: "amount", header: "Amount", width: 0.95, numeric: true }, PAID, REF],
    rows: inPerson.map((r, i) => ({
      no: i + 1, name: r.customer.name, email: (r.customer.email ?? "").toLowerCase(), phone: r.customer.phone ?? "",
      tickets: seat && r.amount >= seat && r.amount % seat === 0 ? r.amount / seat : 1, amount: r.amount,
      paid: paidOn(r.paidAt), reference: r.reference,
    })),
    count: inPerson.reduce((sum, r) => sum + (seat && r.amount >= seat && r.amount % seat === 0 ? r.amount / seat : 1), 0), collected: total(inPerson),
  });
  if (buckets.other.length) {
    groups.push({
      key: "other", sheet: "Other payments", currency, title: "Other Paystack payments",
      note: "Successful payments that match none of the lists above (an unusual amount, or a page that no longer exists).",
      columns: [NO, { key: "name", header: "Name", width: 2.1 }, { key: "email", header: "Email", width: 2.5 }, { key: "phone", header: "Phone", width: 1.3 }, { key: "amount", header: "Amount", width: 0.95, numeric: true }, PAID, REF],
      rows: buckets.other.map((r, i) => ({ no: i + 1, name: r.customer.name, email: (r.customer.email ?? "").toLowerCase(), phone: r.customer.phone ?? "", amount: r.amount, paid: paidOn(r.paidAt), reference: r.reference })),
      count: buckets.other.length, collected: total(buckets.other),
    });
  }
  return { title: `${input.eventName} — Registrants`, generatedAt: input.generatedAt, groups, truncated: input.truncated };
}

/** "6 registrants · GHS 600 collected" / "9 tickets (8 payments) · GHS 22,500 collected" */
export function groupSummary(group: RegistrantGroup): string {
  const people = group.key === "in-person"
    ? `${formatNumber(group.count)} ${group.count === 1 ? "ticket" : "tickets"}${group.count !== group.rows.length ? ` (${formatNumber(group.rows.length)} ${group.rows.length === 1 ? "payment" : "payments"})` : ""}`
    : `${formatNumber(group.count)} ${group.count === 1 ? "registrant" : "registrants"}`;
  return `${people} · ${money(group.collected, group.currency)} collected`;
}
