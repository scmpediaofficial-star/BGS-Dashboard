"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Settings } from "lucide-react";
import { useViewer } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { useAutoImport } from "@/components/payments/use-auto-import";
import { AttendanceSummary } from "@/components/tickets/attendance-summary";
import { SalesLedger } from "@/components/tickets/sales-ledger";
import type { TicketEvent } from "@/components/tickets/ticket-art";
import { TicketDesk } from "@/components/tickets/ticket-desk";
import type { Attendance, Sale, TicketRow, TicketType } from "@/components/tickets/types";
import { PageHeader } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Targets } from "@/lib/domain";
import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";
import type { VirtualSettings } from "@/lib/settings";

type Props = {
  ticketTypes: TicketType[]; sales: Sale[]; tickets: TicketRow[]; attendance: Attendance; programmePending: number;
  event: TicketEvent; countBlank: boolean; virtual: VirtualSettings; targets: Targets;
};

export function TicketsView({ ticketTypes, sales, tickets, attendance, programmePending, event, countBlank, virtual, targets }: Props) {
  const { can } = useViewer();
  useRealtimeRefresh(["ticket_sales", "ticket_types", "tickets"]);
  useAutoImport();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Links to a sale (`?item=`) or to "record a sale" (`?new=1`) open the ledger; everything else opens the tickets.
  const tab = params.get("tab") === "sales" || (!params.get("tab") && (params.get("item") || params.get("new") === "1")) ? "sales" : "tickets";
  function setTab(next: string) {
    // Each tab owns its own filters and open record, so none of them follow you across.
    router.replace(next === "tickets" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  }

  return (
    <>
      <PageHeader eyebrow="Commercial" title="Tickets & access" description="Who is coming, the ticket each person holds, and the sales behind them. Every ticket has a unique number and downloads as a PNG or PDF."
        actions={can("settings.manage") ? <Button asChild variant="outline"><Link href="/settings?tab=tickets"><Settings /> Ticket settings</Link></Button> : undefined} />
      <AttendanceSummary attendance={attendance} capacity={targets.tickets} countBlank={countBlank} className="mb-5" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="sales">Sales ledger</TabsTrigger>
        </TabsList>
        <TabsContent value="tickets"><TicketDesk tickets={tickets} event={event} programmePending={programmePending} /></TabsContent>
        <TabsContent value="sales"><SalesLedger ticketTypes={ticketTypes} sales={sales} tickets={tickets} event={event} virtual={virtual} targets={targets} /></TabsContent>
      </Tabs>
    </>
  );
}
