import { crc32, type Bytes } from "@/components/tickets/ticket-art";
import { groupSummary, money, type RegistrantGroup, type RegistrantsReport } from "@/components/payments/registrants";

/**
 * The registrant lists as an Excel workbook and a PDF, made in the browser.
 * No libraries: the .xlsx is SpreadsheetML in a stored ZIP, the PDF uses the built-in Helvetica.
 */

const CONFIDENTIAL = "Confidential: personal data of summit registrants. Share only with the summit team.";

// ── ZIP (stored) ────────────────────────────────────────────────────────────
function zip(files: { name: string; data: Bytes }[]): Blob {
  const encoder = new TextEncoder();
  const parts: Bytes[] = [];
  const directory: Bytes[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, file.data.length, true);
    local.setUint32(22, file.data.length, true);
    local.setUint16(26, name.length, true);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, file.data.length, true);
    central.setUint32(24, file.data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), name, file.data);
    directory.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + file.data.length;
  }
  const size = directory.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, new Uint8Array(end.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ── Excel ───────────────────────────────────────────────────────────────────
const xml = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const column = (i: number) => { let s = ""; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
// Styles: 0 plain · 1 title · 2 note · 3 header · 4 text · 5 whole number · 6 money · 7 bold total · 8 bold money total
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="15"/><color rgb="FF804A95"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF5F5B8C"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF804A95"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD9D2E3"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>`;

type Cell = { value: string | number; style: number };
function sheetXml(rows: Cell[][], widths: number[], freezeRow: number): string {
  const body = rows.map((cells, r) => `<row r="${r + 1}">${cells.map((cell, c) => {
    const ref = `${column(c)}${r + 1}`;
    if (cell.value === "") return `<c r="${ref}" s="${cell.style}"/>`;
    return typeof cell.value === "number"
      ? `<c r="${ref}" s="${cell.style}"><v>${cell.value}</v></c>`
      : `<c r="${ref}" s="${cell.style}" t="inlineStr"><is><t xml:space="preserve">${xml(cell.value)}</t></is></c>`;
  }).join("")}</row>`).join("");
  const pane = freezeRow ? `<pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${body}</sheetData><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const t = (value: string | number, style = 4): Cell => ({ value, style });

function groupSheet(report: RegistrantsReport, group: RegistrantGroup): string {
  const rows: Cell[][] = [
    [t(group.title, 1)],
    [t(`${groupSummary(group)} · ${report.title.replace(/ — Registrants$/, "")} · as at ${report.generatedAt}`, 2)],
    [t(group.note, 2)],
    [],
    group.columns.map((c) => t(c.header, 3)),
    ...group.rows.map((row) => group.columns.map((c) => {
      const value = row[c.key] ?? "";
      return typeof value === "number" ? t(value, c.key === "amount" ? 6 : 5) : t(value);
    })),
  ];
  if (!group.rows.length) rows.push([t("No registrations yet.", 2)]);
  rows.push([], [t(`Total: ${groupSummary(group)}`, 7)]);
  const widths = group.columns.map((c) => Math.max(c.header.length + 2, Math.min(48, Math.max(0, ...group.rows.map((r) => String(r[c.key] ?? "").length)) + 2)));
  return sheetXml(rows, widths, 5);
}

export function registrantsXlsx(report: RegistrantsReport): Blob {
  const encoder = new TextEncoder();
  const summary = sheetXml([
    [t(report.title, 1)],
    [t(`As at ${report.generatedAt} (Accra time). Each list is on its own sheet below.`, 2)],
    [t(CONFIDENTIAL, 2)],
    [],
    [t("List", 3), t("Sheet", 3), t("Registrants / tickets", 3), t("Collected", 3)],
    ...report.groups.map((g) => [t(g.title), t(g.sheet), t(g.count, 5), t(g.collected, 6)]),
    [],
    [t("Total", 7), t(""), t(report.groups.reduce((n, g) => n + g.count, 0), 7), t(report.groups.reduce((n, g) => n + g.collected, 0), 8)],
  ], [48, 26, 22, 16], 0);
  const sheets = [{ name: "Summary", xml: summary }, ...report.groups.map((g) => ({ name: g.sheet.slice(0, 31), xml: groupSheet(report, g) }))];
  const files = [
    { name: "[Content_Types].xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { name: "_rels/.rels", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", text: STYLES },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: s.xml })),
  ];
  return zip(files.map((f) => ({ name: f.name, data: encoder.encode(f.text) })));
}

// ── PDF ─────────────────────────────────────────────────────────────────────
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 36;
const TABLE_W = PAGE_W - MARGIN * 2;
const ROW_H = 17;
const SIZE = 8;

/** Windows-1252, the encoding of PDF's built-in fonts. Anything outside it prints as "?". */
const WIN: Record<string, number> = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99 };
function winAnsi(value: string): string {
  let out = "";
  for (const ch of value.normalize("NFC")) {
    const code = ch.codePointAt(0)!;
    const byte = WIN[ch] ?? (code < 0x80 || (code >= 0xa0 && code <= 0xff) ? code : 0x3f);
    out += byte === 0x28 || byte === 0x29 || byte === 0x5c ? `\\${String.fromCharCode(byte)}` : byte < 0x20 ? " " : byte > 0x7e ? `\\${byte.toString(8).padStart(3, "0")}` : String.fromCharCode(byte);
  }
  return out;
}

let measurer: CanvasRenderingContext2D | null = null;
/** Width in points of text in Helvetica (Arial has the same widths where Helvetica is missing). */
function width(text: string, size: number, bold = false): number {
  measurer ??= document.createElement("canvas").getContext("2d");
  if (!measurer) return text.length * size * 0.5;
  measurer.font = `${bold ? "bold " : ""}100px Helvetica, Arial, sans-serif`;
  return (measurer.measureText(text).width / 100) * size;
}
function fit(text: string, max: number, size: number, bold = false): string {
  if (width(text, size, bold) <= max) return text;
  let cut = text;
  while (cut.length > 1 && width(`${cut}…`, size, bold) > max) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}
function wrapText(text: string, max: number, size: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && width(next, size) > max) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
// Print colours: a PDF cannot read the interface's theme tokens.
const PURPLE = rgb("#804a95");
const INK = rgb("#1e1c52");
const SOFT = rgb("#5f5b8c");
const ZEBRA = rgb("#f6f1f9");
const RULE = rgb("#d9d2e3");

class Page {
  ops: string[] = [];
  text(x: number, y: number, value: string, size: number, opts: { bold?: boolean; color?: string; align?: "left" | "right" } = {}) {
    const dx = opts.align === "right" ? x - width(value, size, opts.bold) : x;
    this.ops.push(`BT /${opts.bold ? "F2" : "F1"} ${size} Tf ${opts.color ?? INK} rg ${dx.toFixed(2)} ${(PAGE_H - y).toFixed(2)} Td (${winAnsi(value)}) Tj ET`);
  }
  rect(x: number, y: number, w: number, h: number, color: string) {
    this.ops.push(`${color} rg ${x.toFixed(2)} ${(PAGE_H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }
}

export function registrantsPdf(report: RegistrantsReport): Blob {
  const pages: Page[] = [];
  let page = new Page();
  let y = 0;
  const newPage = () => { page = new Page(); pages.push(page); y = MARGIN + 26; };

  for (const group of report.groups) {
    newPage();
    page.text(MARGIN, y, group.title, 17, { bold: true, color: PURPLE });
    y += 18;
    page.text(MARGIN, y, groupSummary(group), 10, { bold: true });
    y += 14;
    for (const line of wrapText(group.note, TABLE_W, 8.5)) { page.text(MARGIN, y, line, 8.5, { color: SOFT }); y += 11; }
    y += 8;

    const columns = group.columns.filter((c) => !c.excelOnly);
    const share = columns.reduce((sum, c) => sum + c.width, 0);
    const widths = columns.map((c) => (c.width / share) * TABLE_W);
    const header = () => {
      page.rect(MARGIN, y, TABLE_W, ROW_H, PURPLE);
      let x = MARGIN;
      columns.forEach((c, i) => {
        const label = fit(c.header, widths[i] - 8, SIZE, true);
        page.text(c.numeric ? x + widths[i] - 4 : x + 4, y + 11.5, label, SIZE, { bold: true, color: "1 1 1", align: c.numeric ? "right" : "left" });
        x += widths[i];
      });
      y += ROW_H;
    };
    header();
    if (!group.rows.length) { page.text(MARGIN + 4, y + 12, "No registrations yet.", 9, { color: SOFT }); y += ROW_H; }
    group.rows.forEach((row, r) => {
      if (y + ROW_H > PAGE_H - MARGIN - 20) {
        newPage();
        page.text(MARGIN, y, `${group.title} (continued)`, 11, { bold: true, color: PURPLE });
        y += 12;
        header();
      }
      if (r % 2) page.rect(MARGIN, y, TABLE_W, ROW_H, ZEBRA);
      page.rect(MARGIN, y + ROW_H - 0.5, TABLE_W, 0.5, RULE);
      let x = MARGIN;
      columns.forEach((c, i) => {
        const raw = row[c.key] ?? "";
        const value = typeof raw === "number" ? (c.key === "amount" ? money(raw, group.currency) : String(raw)) : raw;
        page.text(c.numeric ? x + widths[i] - 4 : x + 4, y + 11.5, fit(value, widths[i] - 8, SIZE, c.key === "name"), SIZE, { bold: c.key === "name", align: c.numeric ? "right" : "left" });
        x += widths[i];
      });
      y += ROW_H;
    });
    if (y + 20 > PAGE_H - MARGIN - 20) newPage();
    page.text(MARGIN, y + 16, `Total: ${groupSummary(group)}`, 9, { bold: true });
  }
  if (!pages.length) newPage();

  // Running head and foot on every page.
  pages.forEach((p, i) => {
    p.text(MARGIN, MARGIN, report.title, 8, { bold: true, color: SOFT });
    p.text(PAGE_W - MARGIN, MARGIN, `As at ${report.generatedAt} (Accra time)`, 8, { color: SOFT, align: "right" });
    p.text(MARGIN, PAGE_H - MARGIN + 12, CONFIDENTIAL, 7, { color: SOFT });
    p.text(PAGE_W - MARGIN, PAGE_H - MARGIN + 12, `Page ${i + 1} of ${pages.length}`, 7, { color: SOFT, align: "right" });
  });

  // Objects: 1 catalog · 2 pages · 3 Helvetica · 4 Helvetica-Bold · 5 info · then content + page per page.
  const objects: string[] = [];
  const kids: number[] = [];
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objects[5] = `<< /Title (${winAnsi(report.title.replace(/[—–]/g, "-"))}) /Producer (BGS Dashboard) >>`;
  let id = 6;
  for (const p of pages) {
    const content = p.ops.join("\n");
    objects[id] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    objects[id + 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id} 0 R >>`;
    kids.push(id + 1);
    id += 2;
  }
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] >>`;

  // Every character above is a single byte (winAnsi escapes the rest), so string length is byte length.
  let out = "%PDF-1.4\n%âãÏÓ\n";
  const offsets: number[] = [];
  for (let n = 1; n < id; n++) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${id}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${id} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}
