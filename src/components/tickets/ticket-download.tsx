"use client";

import { useState } from "react";
import { Download, FileArchive, FileImage, FileText } from "lucide-react";
import { toast } from "sonner";
import { saveBlob, ticketFileName, ticketPng, ticketsPdf, ticketsPngZip, type TicketEvent, type TicketFace } from "@/components/tickets/ticket-art";
import { toFace, type TicketRow } from "@/components/tickets/types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown";

export type TicketLike = Pick<TicketRow, "code" | "kind" | "holder_name" | "organization" | "role_label">;

type Props = {
  /** One ticket … */
  ticket?: TicketLike;
  /** … or every ticket of one buyer, saved together. */
  tickets?: TicketLike[];
  event: TicketEvent;
  /** `label` is the standard labelled button for table rows, `button` the larger one in a record, `icon` only where there is no room for words. */
  variant?: "label" | "button" | "icon";
};

/** Saves an e-ticket as a PNG image or a PDF. With several tickets: one PDF (a page each) or a .zip of PNGs. */
export function TicketDownload({ ticket, tickets, event, variant = "label" }: Props) {
  const [busy, setBusy] = useState(false);
  const list = tickets ?? (ticket ? [ticket] : []);
  if (!list.length) return null;
  const many = list.length > 1;

  async function download(format: "png" | "pdf") {
    setBusy(true);
    try {
      const faces = list.map(toFace);
      if (!many) {
        saveBlob(format === "png" ? await ticketPng(faces[0], event) : await ticketsPdf(faces, event), `${ticketFileName(faces[0])}.${format}`);
      } else {
        // Named after the first ticket so a buyer's set stays together in the downloads folder.
        const name = `${ticketFileName(faces[0])}-and-${faces.length - 1}-more`;
        if (format === "pdf") saveBlob(await ticketsPdf(faces, event), `${name}.pdf`);
        else saveBlob(await ticketsPngZip(faces, event, (face: TicketFace) => `${ticketFileName(face)}.png`), `${name}.zip`);
      }
    } catch (error) {
      console.error("[ticket]", error);
      toast.error("The ticket could not be created. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const what = many ? `${list.length} tickets` : `ticket ${list[0].code}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button variant="ghost" size="icon-sm" loading={busy} aria-label={`Download ${what}`} onClick={(e) => e.stopPropagation()}>{!busy && <Download />}</Button>
        ) : variant === "button" ? (
          <Button variant="outline" loading={busy}>{!busy && <Download />} {many ? `Download ${list.length} tickets` : "Download ticket"}</Button>
        ) : (
          <Button variant="outline" size="sm" loading={busy} aria-label={`Download ${what}`} onClick={(e) => e.stopPropagation()}>{!busy && <Download />} Download{many ? ` (${list.length})` : ""}</Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        {many ? (
          <>
            <DropdownMenuItem onSelect={() => download("pdf")}><FileText aria-hidden /> One PDF, a ticket per page</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => download("png")}><FileArchive aria-hidden /> PNG images in a .zip</DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onSelect={() => download("png")}><FileImage aria-hidden /> PNG image</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => download("pdf")}><FileText aria-hidden /> PDF</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
