import type { TicketKind } from "@/lib/domain";

/**
 * The e-ticket, drawn in the browser.
 *
 * The face is the summit's "Front tag" artwork (public/brand/ticket-template.jpg,
 * 4.13 × 4.66 in): purple header, white panel, navy footer. Everything personal
 * — name, role, date, venue and the unique code — is set in the white panel.
 *
 * PNG  = artwork + panel on one canvas.
 * PDF  = the artwork embedded once and one small panel image per page, so a
 *        300-ticket file stays a few megabytes and prints at full quality.
 *
 * No libraries: the PDF and ZIP containers are written by hand below.
 */

export const TICKET_W = 1240;
export const TICKET_H = 1399;
/** The white panel of the artwork, in template pixels. */
const PANEL_TOP = 794;
const PANEL_H = 529;
const TEMPLATE_URL = "/brand/ticket-template.jpg";

// Print colours of the artwork itself (a canvas cannot read the interface's theme tokens, and a ticket must not change with dark mode).
const NAVY = "#212162";
const PURPLE = "#804a95";
const INK_SOFT = "#5b5b86";
const RULE = "#e3e3f0";

export type TicketFace = { code: string; kind: TicketKind; name: string | null; organization: string | null; roleLabel: string | null };
export type TicketEvent = { dateLine: string; venueLine: string };

type Bytes = Uint8Array<ArrayBuffer>;
type Assets = { image: HTMLImageElement; bytes: Bytes; family: string };
let assets: Promise<Assets> | undefined;

/** Loads the artwork and makes sure the brand typeface is ready before anything is drawn. */
function loadAssets(): Promise<Assets> {
  assets ??= (async () => {
    const response = await fetch(TEMPLATE_URL);
    if (!response.ok) throw new Error("The ticket artwork could not be loaded.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const image = new Image();
    image.decoding = "async";
    const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
    try {
      image.src = url;
      await image.decode();
    } finally {
      URL.revokeObjectURL(url);
    }
    const brand = getComputedStyle(document.documentElement).getPropertyValue("--font-montserrat").trim();
    const family = `${brand ? `${brand}, ` : ""}"Helvetica Neue", Helvetica, Arial, sans-serif`;
    await Promise.all(["500", "700", "800"].map((weight) => document.fonts.load(`${weight} 40px ${family}`).catch(() => [])));
    return { image, bytes, family };
  })();
  assets.catch(() => { assets = undefined; });
  return assets;
}

function setTracking(ctx: CanvasRenderingContext2D, px: number) {
  // Not in every browser yet; without it the small caps are simply set a little tighter.
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

/** Breaks `text` into at most two lines that fit `maxWidth` at the current font. */
function wrapTwo(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] | null {
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const words = text.split(" ");
  let best: string[] | null = null;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    if (widest <= maxWidth && (!best || widest < Math.max(...best.map((line) => ctx.measureText(line).width)))) best = lines;
  }
  return best;
}

function headline(face: TicketFace): { eyebrow: string; title: string; sub: string | null } {
  const name = face.name?.trim() || null;
  const organization = face.organization?.trim() || null;
  if (face.kind === "complimentary") {
    return name ? { eyebrow: "Complimentary · Admit one", title: name, sub: organization } : { eyebrow: "Admit one", title: "Complimentary", sub: organization };
  }
  if (face.kind === "delegate") return { eyebrow: face.roleLabel?.trim() || "Delegate", title: name ?? "Delegate", sub: organization };
  return { eyebrow: "Admit one", title: name ?? "Ticket holder", sub: organization };
}

/** Draws the white panel (TICKET_W × PANEL_H) for one ticket. */
function drawPanel(ctx: CanvasRenderingContext2D, face: TicketFace, event: TicketEvent, family: string) {
  const pad = 84;
  const inner = TICKET_W - pad * 2;
  const { eyebrow, title, sub } = headline(face);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, TICKET_W, PANEL_H);
  ctx.textBaseline = "alphabetic";

  // Eyebrow
  ctx.textAlign = "center";
  ctx.fillStyle = PURPLE;
  ctx.font = `700 27px ${family}`;
  setTracking(ctx, 7);
  ctx.fillText(eyebrow.toUpperCase(), TICKET_W / 2, 78, inner);
  setTracking(ctx, 0);

  // Name: as large as fits on one line, two lines before it gets small.
  const display = title.toUpperCase();
  const footerTop = 372;
  const nameArea = { top: 104, bottom: sub ? footerTop - 62 : footerTop - 22 };
  let size = 112;
  let lines: string[] = [display];
  for (; size >= 40; size -= 4) {
    ctx.font = `800 ${size}px ${family}`;
    if (ctx.measureText(display).width <= inner) { lines = [display]; break; }
    const two = size <= 92 ? wrapTwo(ctx, display, inner) : null;
    if (two && two.length * size * 1.08 <= nameArea.bottom - nameArea.top) { lines = two; break; }
  }
  ctx.font = `800 ${size}px ${family}`;
  ctx.fillStyle = NAVY;
  const lineHeight = size * 1.08;
  const block = lines.length * lineHeight;
  let y = nameArea.top + (nameArea.bottom - nameArea.top - block) / 2 + size * 0.84;
  for (const line of lines) {
    ctx.fillText(line, TICKET_W / 2, y, inner);
    y += lineHeight;
  }

  if (sub) {
    ctx.font = `500 31px ${family}`;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(sub, TICKET_W / 2, footerTop - 26, inner);
  }

  // Rule, then event details on the left and the code on the right.
  ctx.fillStyle = RULE;
  ctx.fillRect(pad, footerTop, inner, 2);

  ctx.textAlign = "left";
  ctx.fillStyle = PURPLE;
  ctx.font = `700 20px ${family}`;
  setTracking(ctx, 5);
  ctx.fillText("DATE & VENUE", pad, footerTop + 46);
  setTracking(ctx, 0);
  ctx.fillStyle = NAVY;
  ctx.font = `800 34px ${family}`;
  ctx.fillText(event.dateLine, pad, footerTop + 90, inner * 0.52);
  ctx.fillStyle = INK_SOFT;
  ctx.font = `500 25px ${family}`;
  ctx.fillText(event.venueLine, pad, footerTop + 126, inner * 0.52);

  ctx.textAlign = "right";
  ctx.fillStyle = PURPLE;
  ctx.font = `700 20px ${family}`;
  setTracking(ctx, 5);
  ctx.fillText("TICKET NO.", TICKET_W - pad, footerTop + 46);
  setTracking(ctx, 0);
  ctx.fillStyle = NAVY;
  ctx.font = `800 46px ${family}`;
  setTracking(ctx, 3);
  ctx.fillText(face.code, TICKET_W - pad, footerTop + 100, inner * 0.44);
  setTracking(ctx, 0);
}

function canvas(width: number, height: number): { el: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const el = document.createElement("canvas");
  el.width = width;
  el.height = height;
  const ctx = el.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw tickets.");
  return { el, ctx };
}

function toBytes(el: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality?: number): Promise<Bytes> {
  return new Promise((resolve, reject) => {
    el.toBlob((blob) => {
      if (!blob) return reject(new Error("The ticket image could not be created."));
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, type, quality);
  });
}

/** Paints the whole ticket onto `target` (any size with the ticket's proportions). */
export async function paintTicket(target: HTMLCanvasElement, face: TicketFace, event: TicketEvent): Promise<void> {
  const { image, family } = await loadAssets();
  const panel = canvas(TICKET_W, PANEL_H);
  drawPanel(panel.ctx, face, event, family);
  target.width = TICKET_W;
  target.height = TICKET_H;
  const ctx = target.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw tickets.");
  ctx.drawImage(image, 0, 0, TICKET_W, TICKET_H);
  ctx.drawImage(panel.el, 0, PANEL_TOP);
}

export async function ticketPng(face: TicketFace, event: TicketEvent): Promise<Blob> {
  const { el } = canvas(TICKET_W, TICKET_H);
  await paintTicket(el, face, event);
  return new Blob([await toBytes(el, "image/png")], { type: "image/png" });
}

// ── PDF ─────────────────────────────────────────────────────────────────────
const encoder = new TextEncoder();

/**
 * The panel as a PDF image. It is flat white with sharp lettering, so lossless
 * Flate keeps the type crisp and comes out smaller than JPEG; browsers without
 * CompressionStream fall back to a high-quality JPEG.
 */
async function panelImage(el: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Promise<{ dict: string; data: Bytes }> {
  const head = `<< /Type /XObject /Subtype /Image /Width ${el.width} /Height ${el.height} /ColorSpace /DeviceRGB /BitsPerComponent 8`;
  if (typeof CompressionStream === "undefined") {
    const data = await toBytes(el, "image/jpeg", 0.93);
    return { dict: `${head} /Filter /DCTDecode /Length ${data.length} >>`, data };
  }
  const rgba = ctx.getImageData(0, 0, el.width, el.height).data;
  const rgb = new Uint8Array(el.width * el.height * 3);
  for (let i = 0, o = 0; i < rgba.length; i += 4) {
    rgb[o++] = rgba[i];
    rgb[o++] = rgba[i + 1];
    rgb[o++] = rgba[i + 2];
  }
  const data = new Uint8Array(await new Response(new Blob([rgb]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  return { dict: `${head} /Filter /FlateDecode /Length ${data.length} >>`, data };
}

/** One ticket per page at the artwork's print size (4.13 in wide). */
export async function ticketsPdf(faces: TicketFace[], event: TicketEvent, onProgress?: (done: number) => void): Promise<Blob> {
  const { bytes: template, family } = await loadAssets();
  const pageW = 4.13 * 72;
  const scale = pageW / TICKET_W;
  const pageH = TICKET_H * scale;
  const panelY = (TICKET_H - PANEL_TOP - PANEL_H) * scale;
  const panelH = PANEL_H * scale;
  const n = (value: number) => value.toFixed(3);

  const parts: Bytes[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: string | Bytes) => {
    const data = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
    parts.push(data);
    length += data.length;
  };
  const object = (id: number, dict: string, stream?: Bytes) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${dict}\n`);
    if (stream) {
      push("stream\n");
      push(stream);
      push("\nendstream\n");
    }
    push("endobj\n");
  };
  const jpeg = (width: number, height: number, size: number) =>
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${size} >>`;

  // 1 catalog · 2 page tree · 3 artwork · then page, contents and panel image for each ticket.
  push("%PDF-1.4\n%âãÏÓ\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const pageId = (index: number) => 4 + index * 3;
  object(2, `<< /Type /Pages /Count ${faces.length} /Kids [${faces.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] >>`);
  object(3, jpeg(TICKET_W, TICKET_H, template.length), template);

  const panel = canvas(TICKET_W, PANEL_H);
  for (let i = 0; i < faces.length; i++) {
    drawPanel(panel.ctx, faces[i], event, family);
    const image = await panelImage(panel.el, panel.ctx);
    const id = pageId(i);
    const contents = encoder.encode(
      `q ${n(pageW)} 0 0 ${n(pageH)} 0 0 cm /Art Do Q\nq ${n(pageW)} 0 0 ${n(panelH)} 0 ${n(panelY)} cm /Panel Do Q\n`,
    );
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(pageW)} ${n(pageH)}] /Resources << /XObject << /Art 3 0 R /Panel ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    object(id + 1, `<< /Length ${contents.length} >>`, contents);
    object(id + 2, image.dict, image.data);
    onProgress?.(i + 1);
    // Let the page breathe on long runs so the progress label can repaint.
    if (i % 10 === 9) await new Promise((resolve) => setTimeout(resolve));
  }

  const count = 4 + faces.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" });
}

// ── ZIP (stored, no compression — PNGs are already compressed) ──────────────
let crcTable: Uint32Array | undefined;
function crc32(data: Bytes): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Every ticket as its own PNG, in one .zip. */
export async function ticketsPngZip(faces: TicketFace[], event: TicketEvent, fileName: (face: TicketFace) => string, onProgress?: (done: number) => void): Promise<Blob> {
  const parts: Bytes[] = [];
  const directory: Bytes[] = [];
  let offset = 0;
  const { el } = canvas(TICKET_W, TICKET_H);

  for (let i = 0; i < faces.length; i++) {
    await paintTicket(el, faces[i], event);
    const data = await toBytes(el, "image/png");
    const name = encoder.encode(fileName(faces[i]));
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(8, 0, true); // stored
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);

    parts.push(new Uint8Array(local.buffer), name, data);
    directory.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + data.length;
    onProgress?.(i + 1);
  }

  const directorySize = directory.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, faces.length, true);
  end.setUint16(10, faces.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, new Uint8Array(end.buffer)], { type: "application/zip" });
}

// ── Saving ──────────────────────────────────────────────────────────────────
export function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  // Safari needs the URL to outlive the click.
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

/** "BGS-2026-ticket-BGS-K7QM-4XWP-Ama-Mensah" */
export function ticketFileName(face: TicketFace): string {
  const who = (face.name ?? (face.kind === "complimentary" ? "Complimentary" : "")).normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
  return `BGS-2026-ticket-${face.code}${who ? `-${who}` : ""}`;
}
