import type { PaystackPage, PaystackRegistration } from "@/lib/paystack";
import { formatDate, formatNumber, formatTime, isoDay } from "@/lib/utils";

/**
 * Everyone coming to the summit, list by list: every valid in-person ticket
 * (paid, delegate, complimentary, student — the list security checks names
 * against at the door) and everyone who registered on the Zoom pages.
 * Pure: built on the server, drawn on screen, in the PDF and in the Excel file.
 */

export type RegistrantColumn = {
  key: string; header: string; /** Share of the PDF table width. */ width: number; numeric?: boolean;
  /** Excel only: too wide for the PDF page. */ excelOnly?: boolean;
  /** PDF only: printed for writing on by hand, not shown on screen or in Excel. */ printOnly?: boolean;
  /** Draw an empty box to tick at the door. */ tickBox?: boolean;
};
export type RegistrantRow = Record<string, string | number>;
export type RegistrantGroup = {
  key: "in-person" | "in-person-unnamed" | "zoom-student" | "zoom-regular" | "other";
  /** "Zoom (online) — Students · GHS 100" */
  title: string;
  /** Excel sheet name, at most 31 characters. */
  sheet: string;
  /** What the list is and how it is used. */
  note: string;
  columns: RegistrantColumn[];
  rows: RegistrantRow[];
  count: number;
  /** Money taken, for the Paystack lists; null for ticket lists. */
  collected: number | null;
  currency: string;
  /** Replaces the usual "6 registrants · GHS 600 collected". */
  summary?: string;
};
export type RegistrantsReport = { title: string; generatedAt: string; groups: RegistrantGroup[]; truncated: boolean; kit: CheckinKit };

/**
 * What the offline check-in app (public/checkin/template.html) carries: every valid in-person ticket with the
 * details that tie it to a person. Short keys keep the file small. `z` marks a ticket issued for a Zoom payment.
 */
export type CheckinTicket = {
  c: string; k: string; n: string; o: string; r: string; e: string; p: string;
  b: string; be: string; bp: string; pr: string; sn: string; ci: string | null; z?: 1;
};
export type CheckinKit = { event: { name: string; line: string }; generatedAt: string; tickets: CheckinTicket[] };

/** One valid in-person ticket, as read from the ticket ledger. */
export type Admission = {
  code: string; kind: string; checkedIn: boolean; name: string | null; organisation: string | null; role: string | null;
  /** Who paid, when someone else bought the ticket. */ buyer: string | null;
  /** The Paystack payment behind a paid ticket. */ paystackId: number | null;
  email: string | null; phone: string | null; buyerEmail: string | null; buyerPhone: string | null;
  programme: string | null; studentNumber: string | null; checkedInAt: string | null;
};

const KIND_LABEL: Record<string, string> = { paid: "Paid", delegate: "Delegate", complimentary: "Complimentary", student: "Student" };
const KIND_PLURAL: Record<string, string> = { paid: "paid", delegate: "delegates", complimentary: "complimentary", student: "students" };
const HONORIFIC = /^(mr|mrs|ms|miss|mx|dr|prof|professor|hon|honourable|rev|revd|reverend|very rev|rt rev|sir|dame|lady|madam|nana|togbe|chief|eng|ing|ps|pastor|bishop|apostle|alhaji|hajia)\b\.?\s*/i;
/** Sort key for a name: titles (Mr, Dr, Prof., Nana…) are skipped so "Prof. Ama Boateng" files under A. */
function sortName(name: string): string {
  let key = name.trim();
  for (let i = 0; i < 3 && HONORIFIC.test(key); i++) key = key.replace(HONORIFIC, "");
  return key.toLowerCase();
}

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
  registrations: PaystackRegistration[]; pages: PaystackPage[]; truncated: boolean; admissions: Admission[];
  seat: { price: number | null; currency: string }; eventName: string; eventLine: string; generatedAt: string;
  /** Under the app's title: "12 Nov 2026 · Labadi Beach Hotel, Accra". */ checkinLine: string;
  /** When the summit starts (ISO). A ticket marked checked in before that day was handed out, not used at the door. */
  eventStartsAt: string;
}): RegistrantsReport {
  const pages = new Map(input.pages.map((p) => [slugOf(p.url) ?? "", p]));
  const seat = input.seat.price;
  const buckets: Record<RegistrantGroup["key"], PaystackRegistration[]> = { "in-person": [], "in-person-unnamed": [], "zoom-student": [], "zoom-regular": [], other: [] };
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

  // In person: every valid ticket in the ledger. Tickets the Paystack import issued for Zoom payments are not
  // in-person tickets, so they are left out — the Zoom registrants are on their own lists below.
  const zoomPayments = new Set([...buckets["zoom-student"], ...buckets["zoom-regular"]].map((r) => r.id));
  const admitted = input.admissions.filter((a) => a.paystackId === null || !zoomPayments.has(a.paystackId));
  const leftOut = input.admissions.length - admitted.length;
  const named = admitted.filter((a) => a.name?.trim()).sort((a, b) => sortName(a.name!).localeCompare(sortName(b.name!), "en", { sensitivity: "base" }) || a.code.localeCompare(b.code));
  const unnamed = admitted.filter((a) => !a.name?.trim()).sort((a, b) => a.code.localeCompare(b.code));
  const kinds = (list: Admission[]) => ["paid", "delegate", "complimentary", "student"].map((k) => [k, list.filter((a) => a.kind === k).length] as const).filter(([, n]) => n).map(([k, n]) => `${formatNumber(n)} ${KIND_PLURAL[k]}`).join(" · ");
  const ticketLabel = (a: Admission) => [KIND_LABEL[a.kind] ?? a.kind, a.role?.trim()].filter(Boolean).join(" · ");
  // The team marks complimentary tickets "checked in" when they hand them out. Only a check-in on the summit day
  // (or later) means the person came through the door; anything earlier would turn guests away as "already entered".
  const eventDay = isoDay(input.eventStartsAt);
  const atDoor = (a: Admission) => a.checkedIn && Boolean(a.checkedInAt) && isoDay(a.checkedInAt!) >= eventDay;
  const checked = admitted.filter(atDoor).length;
  const TICK: RegistrantColumn = { key: "tick", header: "Tick", width: 0.5, tickBox: true, printOnly: true };
  groups.push({
    key: "in-person", sheet: "In person - Names A-Z", currency, collected: null, count: named.length,
    title: "In person — Ticket holders by name (A–Z)",
    summary: `${formatNumber(named.length)} ${named.length === 1 ? "person" : "people"}${named.length ? ` · ${kinds(named)}` : ""}`,
    note: `Everyone holding a valid ticket for ${input.eventLine}: paid (online, by transfer or by an institution), delegates, complimentary guests and students. Sorted by first name, ignoring titles such as Mr, Dr or Prof. Check the name against the person's ID and the ticket code on their e-ticket, then tick the box.${unnamed.length ? ` ${formatNumber(unnamed.length)} more tickets carry no name and are listed by code after this list.` : ""}${leftOut ? ` ${formatNumber(leftOut)} ${leftOut === 1 ? "ticket" : "tickets"} issued in error for Zoom payments ${leftOut === 1 ? "is" : "are"} left out: ${leftOut === 1 ? "that person attends" : "those people attend"} online only.` : ""}${checked ? ` ${formatNumber(checked)} already checked in when this list was made.` : ""}`,
    columns: [NO, { key: "name", header: "Name", width: 2.6 }, { key: "organisation", header: "Organisation", width: 2.4 }, { key: "ticket", header: "Ticket", width: 1.5 },
      { key: "code", header: "Ticket code", width: 1.35 }, TICK,
      { key: "buyer", header: "Bought by", width: 1.8, excelOnly: true }, { key: "status", header: "Checked in", width: 0.9, excelOnly: true }],
    rows: named.map((a, i) => ({ no: i + 1, name: a.name!.trim(), organisation: a.organisation ?? "", ticket: ticketLabel(a), code: a.code, tick: "",
      buyer: a.buyer && a.buyer.trim().toLowerCase() !== a.name!.trim().toLowerCase() ? a.buyer : "", status: atDoor(a) ? "Yes" : "" })),
  });
  if (unnamed.length) {
    groups.push({
      key: "in-person-unnamed", sheet: "In person - No name", currency, collected: null, count: unnamed.length,
      title: "In person — Valid tickets with no name recorded",
      summary: `${formatNumber(unnamed.length)} ${unnamed.length === 1 ? "ticket" : "tickets"} · ${kinds(unnamed)}`,
      note: "These tickets are valid but nobody's name was recorded on them (mostly complimentary tickets handed out in batches). Check the code on the holder's e-ticket against this list (in code order), write their name in and tick the box.",
      columns: [NO, { key: "code", header: "Ticket code", width: 1.6 }, { key: "ticket", header: "Ticket", width: 1.6 }, { key: "organisation", header: "Organisation", width: 2.6 },
        { key: "written", header: "Name (write in)", width: 3.2, printOnly: true }, TICK, { key: "status", header: "Checked in", width: 0.9, excelOnly: true }],
      rows: unnamed.map((a, i) => ({ no: i + 1, code: a.code, ticket: ticketLabel(a), organisation: a.organisation ?? "", written: "", tick: "", status: atDoor(a) ? "Yes" : "" })),
    });
  }

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
  if (buckets.other.length) {
    groups.push({
      key: "other", sheet: "Other payments", currency, title: "Other Paystack payments",
      note: "Successful payments that match none of the lists above (an unusual amount, or a page that no longer exists).",
      columns: [NO, { key: "name", header: "Name", width: 2.1 }, { key: "email", header: "Email", width: 2.5 }, { key: "phone", header: "Phone", width: 1.3 }, { key: "amount", header: "Amount", width: 0.95, numeric: true }, PAID, REF],
      rows: buckets.other.map((r, i) => ({ no: i + 1, name: r.customer.name, email: (r.customer.email ?? "").toLowerCase(), phone: r.customer.phone ?? "", amount: r.amount, paid: paidOn(r.paidAt), reference: r.reference })),
      count: buckets.other.length, collected: total(buckets.other),
    });
  }
  const kit: CheckinKit = {
    event: { name: input.eventName, line: input.checkinLine },
    generatedAt: input.generatedAt,
    tickets: input.admissions.map((a) => ({
      c: a.code, k: a.kind, n: a.name?.trim() ?? "", o: a.organisation ?? "", r: a.role?.trim() ?? "", e: a.email?.trim().toLowerCase() ?? "", p: a.phone?.trim() ?? "",
      b: a.buyer?.trim() ?? "", be: a.buyerEmail?.trim().toLowerCase() ?? "", bp: a.buyerPhone?.trim() ?? "", pr: a.programme?.trim() ?? "", sn: a.studentNumber?.trim() ?? "",
      ci: atDoor(a) ? a.checkedInAt : null,
      ...(a.paystackId !== null && zoomPayments.has(a.paystackId) ? { z: 1 as const } : {}),
    })),
  };
  return { title: `${input.eventName} — Registrants`, generatedAt: input.generatedAt, groups, truncated: input.truncated, kit };
}

/** "6 registrants · GHS 600 collected", or the list's own summary ("512 people · 120 paid · 300 complimentary"). */
export function groupSummary(group: RegistrantGroup): string {
  if (group.summary) return group.summary;
  const people = `${formatNumber(group.count)} ${group.count === 1 ? "registrant" : "registrants"}`;
  return group.collected === null ? people : `${people} · ${money(group.collected, group.currency)} collected`;
}
