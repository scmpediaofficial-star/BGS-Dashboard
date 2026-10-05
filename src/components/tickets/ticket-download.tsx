"use client";

import { useState } from "react";
import { Download, FileImage, FileText } from "lucide-react";
import { toast } from "sonner";
import { saveBlob, ticketFileName, ticketPng, ticketsPdf, type TicketEvent } from "@/components/tickets/ticket-art";
import { toFace, type TicketRow } from "@/components/tickets/types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown";

type Props = { ticket: Pick<TicketRow, "code" | "kind" | "holder_name" | "organization" | "role_label">; event: TicketEvent; variant?: "icon" | "button" };

/** Saves one e-ticket as a PNG image or a one-page PDF. */
export function TicketDownload({ ticket, event, variant = "icon" }: Props) {
  const [busy, setBusy] = useState(false);

  async function download(format: "png" | "pdf") {
    setBusy(true);
    try {
      const face = toFace(ticket);
      const blob = format === "png" ? await ticketPng(face, event) : await ticketsPdf([face], event);
      saveBlob(blob, `${ticketFileName(face)}.${format}`);
    } catch (error) {
      console.error("[ticket]", error);
      toast.error("The ticket could not be created. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button variant="ghost" size="icon-sm" loading={busy} aria-label={`Download ticket ${ticket.code}`} onClick={(e) => e.stopPropagation()}>{!busy && <Download />}</Button>
        ) : (
          <Button variant="outline" loading={busy}><Download /> Download ticket</Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => download("png")}><FileImage aria-hidden /> PNG image</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => download("pdf")}><FileText aria-hidden /> PDF</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
