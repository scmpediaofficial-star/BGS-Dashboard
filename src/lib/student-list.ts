/**
 * Reads a pasted student list into { name, number } rows.
 *
 * It copes with the way lists really arrive from WhatsApp and Word:
 *   "1. Simon Adeti 10331270"            number after the name
 *   "4. Clement Dodzi Awagah-10331918"   glued on with a dash
 *   "12. Agblobi-Tetteh Comfort-10335122" a hyphen inside the name is kept
 *   "18. Priscilla Opoku Agyeman" + "19. 10331581"   name and number on separate lines
 *   "Hamdan Abdulai, 10349479"            commas and tabs (a spreadsheet paste)
 * Pure and dependency-free, so the form previews it and the server re-reads it.
 */

export type ParsedStudent = { name: string; number: string };
export type ParsedList = { rows: ParsedStudent[]; problems: { line: string; reason: string }[] };

const MAX_ROWS = 500;

/** "RITA AKU ZIKPI" → "Rita Aku Zikpi". Names with any lower-case letter are left exactly as typed. */
function tidyName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").replace(/^[\s\-–—:,;|.]+|[\s\-–—:,;|]+$/g, "").trim();
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

export function parseStudentList(text: string): ParsedList {
  const rows: ParsedStudent[] = [];
  const problems: ParsedList["problems"] = [];
  const seen = new Set<string>();
  let waiting: string | null = null; // a name still looking for its number on the next line

  const flushWaiting = () => {
    if (waiting) problems.push({ line: waiting, reason: "No student number." });
    waiting = null;
  };
  const add = (rawName: string, number: string, line: string) => {
    const name = tidyName(rawName);
    if (!name) return problems.push({ line, reason: "No name." });
    if (seen.has(number)) return problems.push({ line, reason: `Student number ${number} appears twice.` });
    if (rows.length >= MAX_ROWS) return problems.push({ line, reason: `Import at most ${MAX_ROWS} students at a time.` });
    seen.add(number);
    rows.push({ name, number });
  };

  for (const original of text.split(/\r?\n/)) {
    const line = original.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const body = line.replace(/^\d{1,3}\s*[.)]\s*/, "").trim(); // "12." list numbering
    if (!body) continue;
    const match = body.match(/(\d{6,12})\s*$/);
    if (!match) {
      flushWaiting();
      if (/\d/.test(body.replace(/[^\d]/g, "")) && body.replace(/\D/g, "").length >= 3) problems.push({ line, reason: "Couldn't find a student number at the end of this line." });
      else waiting = body;
      continue;
    }
    const before = body.slice(0, match.index);
    if (!tidyName(before)) {
      // Number on its own line: it belongs to the name above it.
      if (waiting) { add(waiting, match[1], `${waiting} ${match[1]}`); waiting = null; }
      else problems.push({ line, reason: "A student number with no name." });
      continue;
    }
    flushWaiting();
    add(before, match[1], line);
  }
  flushWaiting();
  return { rows, problems };
}
