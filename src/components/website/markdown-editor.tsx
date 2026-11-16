"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bold, Heading2, ImagePlus, Italic, Link2, List, TextQuote, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { renderMarkdown } from "@/components/website/markdown";
import { ARTICLE_IMAGE_FOLDER, BODY_MAX } from "@/components/website/types";
import { WEB_IMAGE_TYPES, friendlyImageError, prepareWebImage, uploadWebImage } from "@/components/website/web-image";
import { cn } from "@/lib/utils";

type Edit = { text: string; start: number; end: number };

/** Wraps the selection (or a placeholder) in `before`/`after`; a second press unwraps it. */
function wrap(text: string, start: number, end: number, before: string, after: string, placeholder: string): Edit {
  if (start !== end && text.slice(start - before.length, start) === before && text.slice(end, end + after.length) === after) {
    return { text: text.slice(0, start - before.length) + text.slice(start, end) + text.slice(end + after.length), start: start - before.length, end: end - before.length };
  }
  const inner = text.slice(start, end) || placeholder;
  return { text: text.slice(0, start) + before + inner + after + text.slice(end), start: start + before.length, end: start + before.length + inner.length };
}

/** Adds `prefix` to every line the selection touches, or takes it away if they all have it. */
function prefixLines(text: string, start: number, end: number, prefix: string, strip: RegExp): Edit {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const stop = text.indexOf("\n", end);
  const to = stop === -1 ? text.length : stop;
  const lines = text.slice(from, to).split("\n");
  const remove = lines.every((line) => line.startsWith(prefix));
  const changed = lines.map((line) => (remove ? line.slice(prefix.length) : prefix + line.replace(strip, ""))).join("\n");
  return { text: text.slice(0, from) + changed + text.slice(to), start: from, end: from + changed.length };
}

/** Puts a block (an image) on its own paragraph at the cursor, and selects `select` inside it. */
function insertBlock(text: string, start: number, end: number, block: string, select: [number, number]): Edit {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = !before ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail = !after ? "\n" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const at = before.length + lead.length;
  return { text: before + lead + block + trail + after, start: at + select[0], end: at + select[1] };
}

const BLOCK_PREFIX = /^(#{1,6} |> |- |\* |\d+\. )/;

type Tool = "bold" | "italic" | "heading" | "link" | "quote" | "list";
const TOOLS: { id: Tool; label: string; shortcut?: string; icon: LucideIcon }[] = [
  { id: "bold", label: "Bold", shortcut: "Ctrl/⌘ B", icon: Bold },
  { id: "italic", label: "Italic", shortcut: "Ctrl/⌘ I", icon: Italic },
  { id: "heading", label: "Heading", icon: Heading2 },
  { id: "link", label: "Link", shortcut: "Ctrl/⌘ K", icon: Link2 },
  { id: "quote", label: "Quote", icon: TextQuote },
  { id: "list", label: "Bulleted list", icon: List },
];

function format(tool: Tool, t: string, s: number, e: number): Edit {
  switch (tool) {
    case "bold": return wrap(t, s, e, "**", "**", "bold text");
    case "italic": return wrap(t, s, e, "_", "_", "italic text");
    case "heading": return prefixLines(t, s, e, "## ", BLOCK_PREFIX);
    case "quote": return prefixLines(t, s, e, "> ", BLOCK_PREFIX);
    case "list": return prefixLines(t, s, e, "- ", BLOCK_PREFIX);
    case "link": {
      const selected = t.slice(s, e);
      if (/^(https?:\/\/|mailto:|\/)\S*$/i.test(selected)) {
        return { text: `${t.slice(0, s)}[link text](${selected})${t.slice(e)}`, start: s + 1, end: s + 10 };
      }
      const label = selected || "link text";
      const url = s + label.length + 3;
      return { text: `${t.slice(0, s)}[${label}](https://)${t.slice(e)}`, start: url, end: url + 8 };
    }
  }
}

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
};

/** Markdown body with a small formatting toolbar, image upload into the text, and a preview that matches what the website shows. */
export function MarkdownEditor({ id, value, onChange, disabled, invalid }: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const latest = useRef(value);
  const selection = useRef<[number, number] | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [uploading, setUploading] = useState(false);
  const preview = useMemo(() => (tab === "preview" ? renderMarkdown(value) : ""), [tab, value]);

  // The newest text, for edits that finish after an upload while the writer kept typing.
  useEffect(() => { latest.current = value; }, [value]);
  // Put the cursor back where the edit wants it once React has rendered the new text.
  useLayoutEffect(() => {
    const el = textarea.current;
    const next = selection.current;
    if (!el || !next) return;
    selection.current = null;
    el.focus();
    el.setSelectionRange(next[0], next[1]);
  }, [value]);

  function apply(edit: (text: string, start: number, end: number) => Edit) {
    const el = textarea.current;
    if (!el || disabled) return;
    const text = latest.current;
    const result = edit(text, Math.min(el.selectionStart, text.length), Math.min(el.selectionEnd, text.length));
    if (result.text.length > BODY_MAX) return void toast.error("The article is at its length limit.");
    selection.current = [result.start, result.end];
    latest.current = result.text;
    onChange(result.text);
  }

  const runTool = (tool: Tool) => apply((t, s, e) => format(tool, t, s, e));

  async function insertImage(file: File) {
    setUploading(true);
    try {
      const { blob } = await prepareWebImage(file);
      const { url } = await uploadWebImage(blob, ARTICLE_IMAGE_FOLDER);
      apply((t, s, e) => {
        const alt = t.slice(s, e).replace(/[[\]\n]/g, " ").trim() || "Describe the photo";
        return insertBlock(t, s, e, `![${alt}](${url})`, [2, 2 + alt.length]);
      });
      toast.success("Image added. Describe it in the square brackets for people using screen readers.");
    } catch (err) {
      toast.error(friendlyImageError(err));
    } finally {
      setUploading(false);
      if (picker.current) picker.current.value = "";
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    const tool: Tool | null = ({ b: "bold", i: "italic", k: "link" } as const)[e.key.toLowerCase() as "b" | "i" | "k"] ?? null;
    if (tool) { e.preventDefault(); runTool(tool); }
  }

  return (
    <Tabs value={tab} onValueChange={(next) => setTab(next === "preview" ? "preview" : "write")}>
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 border-b border-line">
        <TabsList className="border-b-0">
          <TabsTrigger value="write">{disabled ? "Markdown" : "Write"}</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        {tab === "write" && !disabled && (
          <div role="toolbar" aria-label="Formatting" aria-controls={id} className="-mr-1.5 flex flex-wrap items-center gap-0.5 pb-1">
            {TOOLS.map((tool) => (
              <Tooltip key={tool.id} content={tool.shortcut ? `${tool.label} · ${tool.shortcut}` : tool.label}>
                <Button type="button" variant="ghost" size="icon" aria-label={tool.label} onMouseDown={(e) => e.preventDefault()} onClick={() => runTool(tool.id)}>
                  <tool.icon aria-hidden />
                </Button>
              </Tooltip>
            ))}
            <Button type="button" variant="ghost" className="h-9 px-2.5" loading={uploading} onMouseDown={(e) => e.preventDefault()} onClick={() => picker.current?.click()}>
              {!uploading && <ImagePlus aria-hidden />}
              <span className="max-sm:sr-only">{uploading ? "Uploading…" : "Insert image"}</span>
            </Button>
            <input ref={picker} type="file" accept={WEB_IMAGE_TYPES.join(",")} className="sr-only" tabIndex={-1} onChange={(e) => { const file = e.target.files?.[0]; if (file) void insertImage(file); }} />
          </div>
        )}
      </div>

      <TabsContent value="write" forceMount className="pt-2.5 data-[state=inactive]:hidden">
        <Textarea
          ref={textarea}
          id={id}
          value={value}
          onChange={(e) => { latest.current = e.target.value; onChange(e.target.value); }}
          onKeyDown={onKeyDown}
          readOnly={disabled}
          maxLength={BODY_MAX}
          spellCheck
          aria-invalid={invalid || undefined}
          placeholder={"Start with the news itself.\n\n## A heading\n\nParagraphs are separated by a blank line."}
          className="min-h-[22rem] font-mono text-[13px] leading-relaxed"
        />
        {!disabled && (
          <p className="mt-1.5 text-xs text-ink-3">
            Markdown: <code>**bold**</code>, <code>_italic_</code>, <code>## Heading</code>, <code>[text](https://…)</code>, <code>&gt; quote</code>, <code>- list</code>. HTML tags show as plain text.
          </p>
        )}
      </TabsContent>
      <TabsContent value="preview" className="pt-2.5">
        {value.trim() ? (
          <div
            className={cn(
              "min-h-[22rem] rounded-[10px] border border-line bg-surface px-4 py-3.5 text-[14px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]",
              "[&>*:first-child]:mt-0 [&_p]:my-3 [&_strong]:font-bold [&_strong]:text-ink [&_em]:italic",
              "[&_h1]:mb-2 [&_h1]:mt-6 [&_h1]:text-xl [&_h1]:font-extrabold [&_h1]:text-ink [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_h3]:mb-1.5 [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-ink [&_h4]:mt-4 [&_h4]:font-bold [&_h4]:text-ink",
              "[&_a]:font-semibold [&_a]:text-accent-ink [&_a]:underline [&_a]:underline-offset-2",
              "[&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-ink",
              "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1",
              "[&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl [&_hr]:my-6 [&_hr]:border-line",
              "[&_code]:rounded [&_code]:bg-surface-3 [&_code]:px-1 [&_code]:text-[12.5px] [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface-3 [&_pre]:p-3",
              "[&_table]:my-4 [&_table]:w-full [&_table]:text-[13px] [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-line [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
            )}
            // The renderer escapes raw HTML and drops unsafe links, so this is the article's text and nothing more.
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        ) : (
          <p className="grid min-h-40 place-items-center rounded-[10px] border border-dashed border-line-strong px-4 text-center text-[13px] text-ink-3">Nothing to preview yet.</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
