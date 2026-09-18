/**
 * BGS-branded transactional email, hand-built as table HTML with inline styles —
 * the only markup that renders consistently across Outlook, Gmail and Apple Mail.
 * No template engine, no runtime dependencies.
 */

const NAVY = "#212162";
const PURPLE = "#804a95";
const GOLD = "#fdd507";
const INK = "#16163f";
const INK_2 = "#4a4970";
const INK_3 = "#6d6b8f";
const LINE = "#e5e2ef";
const PAGE = "#f5f4fa";
const FONT = "Montserrat, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type EmailTone = "default" | "good" | "warning" | "critical";
const TONE: Record<EmailTone, { bar: string; chipBg: string; chipInk: string }> = {
  default: { bar: PURPLE, chipBg: "#f4ecf8", chipInk: "#673878" },
  good: { bar: "#0ca30c", chipBg: "#e6f6e6", chipInk: "#0a6e0a" },
  warning: { bar: "#fab219", chipBg: "#fff3d9", chipInk: "#7d5200" },
  critical: { bar: "#d03b3b", chipBg: "#fdeaea", chipInk: "#ab2424" },
};

export type Fact = { label: string; value: string };
export type Rendered = { subject: string; html: string; text: string };

export type Brand = {
  siteUrl: string;
  eventName: string;
  eventLine: string; // "7 October 2026 · Labadi Beach Hotel, Accra"
  tagline: string;
};

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const nl2br = (value: string) => esc(value).replace(/\n/g, "<br>");

function button(label: string, href: string, color = PURPLE): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px">
    <tr><td align="center" bgcolor="${color}" style="border-radius:10px">
      <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${esc(label)} &rarr;</a>
    </td></tr>
  </table>`;
}

function factTable(facts: Fact[]): string {
  if (!facts.length) return "";
  const rows = facts
    .map(
      (f, i) => `
      <tr>
        <td valign="top" style="padding:10px 14px;font-family:${FONT};font-size:12px;font-weight:700;color:${INK_3};text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;${i ? `border-top:1px solid ${LINE};` : ""}">${esc(f.label)}</td>
        <td valign="top" style="padding:10px 14px;font-family:${FONT};font-size:14px;font-weight:600;color:${INK};${i ? `border-top:1px solid ${LINE};` : ""}">${nl2br(f.value)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;border:1px solid ${LINE};border-radius:12px;border-collapse:separate;background:#fbfaff">${rows}</table>`;
}

type LayoutInput = {
  brand: Brand;
  preheader: string;
  eyebrow?: string;
  heading: string;
  bodyHtml: string;
  tone?: EmailTone;
  footerNote?: string;
  showPreferences?: boolean;
};

function layout({ brand, preheader, eyebrow, heading, bodyHtml, tone = "default", footerNote, showPreferences = true }: LayoutInput): string {
  const t = TONE[tone];
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(heading)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap');
  @media (max-width:620px){ .card{border-radius:0!important} .pad{padding-left:22px!important;padding-right:22px!important} .h1{font-size:21px!important} }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}${"&nbsp;&zwnj;".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 6px 28px rgba(33,33,98,.10)">
    <tr><td bgcolor="${NAVY}" class="pad" style="padding:26px 36px 22px;background:${NAVY}">
      <a href="${esc(brand.siteUrl)}" target="_blank" style="text-decoration:none">
        <img src="${esc(brand.siteUrl)}/brand/email-logo-white.png" width="220" alt="BGS — The Boardroom Governance Summit" style="display:block;border:0;width:220px;max-width:70%;height:auto;font-family:${FONT};font-size:20px;font-weight:800;color:#ffffff">
      </a>
    </td></tr>
    <tr><td style="font-size:0;line-height:0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td height="4" width="33.4%" bgcolor="#ff0000" style="font-size:0;line-height:0">&nbsp;</td>
        <td height="4" width="33.3%" bgcolor="#e1a43b" style="font-size:0;line-height:0">&nbsp;</td>
        <td height="4" width="33.3%" bgcolor="#239205" style="font-size:0;line-height:0">&nbsp;</td>
      </tr></table>
    </td></tr>
    <tr><td class="pad" style="padding:34px 36px 8px">
      ${eyebrow ? `<span style="display:inline-block;padding:4px 11px;border-radius:999px;background:${t.chipBg};font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${t.chipInk}">${esc(eyebrow)}</span>` : ""}
      <h1 class="h1" style="margin:${eyebrow ? "14px" : "0"} 0 0;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:800;color:${INK};letter-spacing:-.01em">${esc(heading)}</h1>
    </td></tr>
    <tr><td class="pad" style="padding:6px 36px 34px;font-family:${FONT};font-size:15px;line-height:1.65;color:${INK_2}">
      ${bodyHtml}
    </td></tr>
    <tr><td class="pad" bgcolor="#fbfaff" style="padding:22px 36px 26px;border-top:1px solid ${LINE};background:#fbfaff">
      <p style="margin:0;font-family:${FONT};font-size:13px;font-weight:700;color:${INK}">${esc(brand.eventName)}</p>
      <p style="margin:3px 0 0;font-family:${FONT};font-size:12px;color:${INK_3}">${esc(brand.eventLine)}</p>
      <p style="margin:12px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${INK_3}">
        ${footerNote ? `${esc(footerNote)}<br>` : ""}
        ${showPreferences ? `You are receiving this because you are on the BGS planning team. <a href="${esc(brand.siteUrl)}/settings/notifications" style="color:${PURPLE};font-weight:600">Change what you get</a>.` : ""}
      </p>
    </td></tr>
  </table>
  <p style="margin:18px 0 0;font-family:${FONT};font-size:11px;letter-spacing:.04em;color:${INK_3}">${esc(brand.tagline)}</p>
</td></tr>
</table>
</body>
</html>`;
}

const paragraph = (text: string) => `<p style="margin:14px 0 0">${nl2br(text)}</p>`;

function plain(lines: (string | false | undefined | null)[]): string {
  return lines.filter((l): l is string => typeof l === "string").join("\n");
}

// ── Templates ───────────────────────────────────────────────────────────────

export type AlertInput = {
  brand: Brand;
  category: string;
  actorName: string | null;
  summary: string; // sentence fragment: "moved “Brochure” to In progress"
  detail?: string;
  facts?: Fact[];
  link: string;
  ctaLabel?: string;
  tone?: EmailTone;
};

export function alertEmail(input: AlertInput): Rendered {
  const headline = input.actorName ? `${input.actorName} ${input.summary}` : capitalise(input.summary);
  const url = absolute(input.brand.siteUrl, input.link);
  return {
    subject: truncateSubject(`[BGS] ${headline}`),
    html: layout({
      brand: input.brand,
      preheader: input.detail ?? headline,
      eyebrow: input.category,
      heading: headline,
      tone: input.tone,
      bodyHtml: `${input.detail ? paragraph(input.detail) : ""}${factTable(input.facts ?? [])}${button(input.ctaLabel ?? "Open in dashboard", url)}`,
    }),
    text: plain([headline, "", input.detail, ...(input.facts ?? []).map((f) => `${f.label}: ${f.value}`), "", `Open: ${url}`]),
  };
}

export type InviteInput = { brand: Brand; inviteeName: string; inviterName: string; roleLabel: string; roleSummary: string; organization?: string | null; acceptUrl: string };

export function inviteEmail(input: InviteInput): Rendered {
  const first = input.inviteeName.split(" ")[0] || "there";
  return {
    subject: `${input.inviterName} invited you to the BGS Dashboard`,
    html: layout({
      brand: input.brand,
      preheader: `Join the ${input.brand.eventName} planning team as ${input.roleLabel}.`,
      eyebrow: "Invitation",
      heading: `Welcome to the summit team, ${first}`,
      showPreferences: false,
      footerNote: "This invitation link is personal to you and expires in 7 days. If you weren't expecting it, you can ignore this email.",
      bodyHtml: `${paragraph(`${input.inviterName} has invited you to the BGS Dashboard — the command centre where deliverables, panelists, sponsors, ticket sales and social media for ${input.brand.eventName} come together.`)}
        ${factTable([
          { label: "Your role", value: `${input.roleLabel} — ${input.roleSummary}` },
          ...(input.organization ? [{ label: "Organisation", value: input.organization }] : []),
        ])}
        ${button("Accept invitation & set password", input.acceptUrl)}
        <p style="margin:14px 0 0;font-size:12.5px;color:${INK_3}">Tip: once you're in, install the dashboard on your phone from the browser menu — it works like an app, with push alerts.</p>`,
    }),
    text: plain([`${input.inviterName} invited you to the BGS Dashboard as ${input.roleLabel}.`, "", `Accept: ${input.acceptUrl}`]),
  };
}

export function resetEmail(input: { brand: Brand; name: string; resetUrl: string }): Rendered {
  return {
    subject: "Reset your BGS Dashboard password",
    html: layout({
      brand: input.brand,
      preheader: "Use this link to choose a new password.",
      eyebrow: "Security",
      heading: "Choose a new password",
      showPreferences: false,
      footerNote: "The link expires in one hour. If you didn't ask for it, your password has not changed and you can ignore this email.",
      bodyHtml: `${paragraph(`Hi ${input.name.split(" ")[0] || "there"}, we received a request to reset the password for your BGS Dashboard account.`)}${button("Reset password", input.resetUrl)}`,
    }),
    text: plain(["Reset your BGS Dashboard password:", input.resetUrl]),
  };
}

export type AccessInput = {
  brand: Brand; attendeeName: string; ticketName: string; accessCode: string;
  joinUrl?: string | null; meetingId?: string | null; supportEmail: string; eventStartsLabel: string;
};

/** Sent to paying virtual participants (outside the team) with their personal access code. */
export function virtualAccessEmail(input: AccessInput): Rendered {
  return {
    subject: `Your virtual access — ${input.brand.eventName}`,
    html: layout({
      brand: input.brand,
      preheader: `Your personal access code for ${input.brand.eventName}.`,
      eyebrow: "Virtual access",
      heading: `You're confirmed, ${input.attendeeName.split(" ")[0] || "delegate"}`,
      tone: "good",
      showPreferences: false,
      footerNote: `Your access code is personal — please don't share it. Need help? Write to ${input.supportEmail}.`,
      bodyHtml: `${paragraph(`Thank you for registering for ${input.brand.eventName}. Here are your details for joining the summit live on Zoom.`)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0"><tr>
          <td align="center" bgcolor="${NAVY}" style="padding:22px;border-radius:14px;background:${NAVY}">
            <p style="margin:0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#b9b7dc">Your personal access code</p>
            <p style="margin:8px 0 0;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:.18em;color:${GOLD}">${esc(input.accessCode)}</p>
          </td></tr></table>
        ${factTable([
          { label: "Ticket", value: input.ticketName },
          { label: "When", value: input.eventStartsLabel },
          ...(input.meetingId ? [{ label: "Zoom meeting ID", value: input.meetingId }] : []),
        ])}
        ${input.joinUrl ? button("Open virtual access", input.joinUrl, NAVY) : paragraph("The access page link will be sent to this address before the summit begins.")}
        ${paragraph("Enter this code and the email address used for your ticket on the access page. Your Zoom link will appear there when it is ready.")}`,
    }),
    text: plain([
      `Your virtual access for ${input.brand.eventName}`, "", `Access code: ${input.accessCode}`, `Ticket: ${input.ticketName}`,
      `When: ${input.eventStartsLabel}`, input.meetingId && `Zoom meeting ID: ${input.meetingId}`, input.joinUrl && `Join: ${input.joinUrl}`,
    ]),
  };
}

export type DigestInput = {
  brand: Brand;
  name: string;
  dateLabel: string;
  daysToGo: number | null;
  stats: { label: string; value: string }[];
  attention: { title: string; meta: string; link: string }[];
  activity: { text: string; when: string }[];
};

export function digestEmail(input: DigestInput): Rendered {
  const stat = (s: { label: string; value: string }) => `
    <td align="center" valign="top" width="${Math.floor(100 / Math.max(1, input.stats.length))}%" style="padding:14px 6px;border:1px solid ${LINE};border-radius:12px;background:#fbfaff">
      <p style="margin:0;font-family:${FONT};font-size:22px;font-weight:800;color:${INK}">${esc(s.value)}</p>
      <p style="margin:3px 0 0;font-family:${FONT};font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${INK_3}">${esc(s.label)}</p>
    </td>`;
  const list = (title: string, rows: string) => rows
    ? `<h2 style="margin:28px 0 8px;font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${PURPLE}">${esc(title)}</h2>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`
    : "";
  const attention = input.attention.map((a) => `
    <tr><td style="padding:9px 0;border-bottom:1px solid ${LINE}">
      <a href="${esc(absolute(input.brand.siteUrl, a.link))}" style="font-family:${FONT};font-size:14px;font-weight:700;color:${INK};text-decoration:none">${esc(a.title)}</a>
      <p style="margin:2px 0 0;font-family:${FONT};font-size:12px;color:${INK_3}">${esc(a.meta)}</p>
    </td></tr>`).join("");
  const activity = input.activity.map((a) => `
    <tr><td style="padding:7px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:13px;color:${INK_2}">${esc(a.text)} <span style="color:${INK_3};white-space:nowrap">· ${esc(a.when)}</span></td></tr>`).join("");
  const countdown = input.daysToGo === null ? "" : input.daysToGo > 0 ? `${input.daysToGo} days to go` : input.daysToGo === 0 ? "Summit day" : "Post-summit wrap-up";

  return {
    subject: `[BGS] Daily briefing — ${input.dateLabel}${countdown ? ` · ${countdown}` : ""}`,
    html: layout({
      brand: input.brand,
      preheader: `${countdown ? `${countdown}. ` : ""}${input.attention.length} item(s) need attention.`,
      eyebrow: countdown || "Daily briefing",
      heading: `Good morning, ${input.name.split(" ")[0] || "team"}`,
      bodyHtml: `${paragraph(`Here is where ${input.brand.eventName} stands on ${input.dateLabel}.`)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="6" border="0" style="margin:18px -6px 0;border-collapse:separate"><tr>${input.stats.map(stat).join("")}</tr></table>
        ${list("Needs attention", attention)}
        ${list("Since the last briefing", activity)}
        ${!attention && !activity ? paragraph("Nothing needs your attention and there was no new activity. Enjoy the calm.") : ""}
        ${button("Open the dashboard", input.brand.siteUrl)}`,
    }),
    text: plain([
      `BGS daily briefing — ${input.dateLabel}`, countdown, "", ...input.stats.map((s) => `${s.label}: ${s.value}`), "",
      input.attention.length ? "Needs attention:" : null, ...input.attention.map((a) => `- ${a.title} (${a.meta})`), "",
      input.activity.length ? "Activity:" : null, ...input.activity.map((a) => `- ${a.text} · ${a.when}`), "", input.brand.siteUrl,
    ]),
  };
}

export function testEmail(input: { brand: Brand; name: string }): Rendered {
  return {
    subject: "[BGS] Test email — alerts are working",
    html: layout({
      brand: input.brand,
      preheader: "If you can read this, Resend is connected.",
      eyebrow: "System check",
      heading: "Alerts are working",
      tone: "good",
      bodyHtml: `${paragraph(`Hi ${input.name.split(" ")[0] || "there"} — this is a test from the BGS Dashboard. Resend is connected and branded alerts will arrive at this address.`)}${button("Back to settings", `${input.brand.siteUrl}/settings/email`)}`,
    }),
    text: "BGS Dashboard test email — alerts are working.",
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────
function absolute(site: string, link: string): string {
  return /^https?:\/\//i.test(link) ? link : `${site}${link.startsWith("/") ? "" : "/"}${link}`;
}
function capitalise(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}
function truncateSubject(subject: string): string {
  return subject.length > 140 ? `${subject.slice(0, 139)}…` : subject;
}
