import { Marked, type Tokens } from "marked";
import { websiteAsset } from "@/components/website/types";

const ESCAPE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPE[c]);
/** For text marked has already entity-encoded (alt text, titles): escape, but leave `&amp;` and friends alone. */
const escapeAttr = (text: string) => text.replace(/&(?!#?\w+;)/g, "&amp;").replace(/[<>"']/g, (c) => ESCAPE[c]);

/**
 * Only web, relative and email links survive. `javascript:`, `data:` and every
 * other scheme are dropped, and the text stays. Website paths (`/2025/…`,
 * `/media/…`) point at the website, not at the dashboard.
 */
function safeUrl(raw: string, kind: "link" | "image"): string | null {
  // Browsers ignore spaces and control characters inside a scheme (`java\tscript:`), so the check does too.
  const probe = Array.from(raw).filter((c) => { const code = c.charCodeAt(0); return code > 0x20 && (code < 0x7f || code > 0x9f); }).join("");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(probe)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https" && !(kind === "link" && scheme === "mailto")) return null;
  try {
    return escapeHtml(encodeURI(websiteAsset(raw.trim())).replace(/%25/g, "%"));
  } catch {
    return null;
  }
}

const markdown = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    // Raw HTML in the body is shown as text, never run.
    html({ text, block }: Tokens.HTML | Tokens.Tag) {
      return block ? `<p>${escapeHtml(text.trim())}</p>\n` : escapeHtml(text);
    },
    link({ href, title, tokens }: Tokens.Link) {
      const text = this.parser.parseInline(tokens);
      const url = safeUrl(href, "link");
      if (!url) return text;
      const away = url.startsWith("#") ? "" : ' target="_blank" rel="noopener noreferrer"';
      return `<a href="${url}"${title ? ` title="${escapeAttr(title)}"` : ""}${away}>${text}</a>`;
    },
    image({ href, title, text, tokens }: Tokens.Image) {
      const alt = tokens ? this.parser.parseInline(tokens, this.parser.textRenderer) : text;
      const url = safeUrl(href, "image");
      if (!url) return escapeAttr(alt);
      return `<img src="${url}" alt="${escapeAttr(alt)}"${title ? ` title="${escapeAttr(title)}"` : ""} loading="lazy">`;
    },
  },
});

/** Article Markdown → HTML that is safe to put on the page. */
export function renderMarkdown(source: string): string {
  return markdown.parse(source, { async: false });
}
