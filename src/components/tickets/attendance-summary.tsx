import { MicVocal, Sparkles, Ticket, UsersRound } from "lucide-react";
import { StatTile } from "@/components/charts/stat-tile";
import type { Attendance } from "@/lib/attendance";
import { cn, formatNumber, pluralize } from "@/lib/utils";

/**
 * Attendees so far, counted from issued tickets: paid ticket holders, delegates
 * and complimentary tickets — with the total shown both without and with the
 * complimentary ones, so the firm number and the full house are both visible.
 */
type Props = {
  attendance: Attendance;
  /** Seats available, from Settings → Tickets & payments. */
  capacity?: number | null;
  /** False = only complimentary tickets with a name on them count towards the total. */
  countBlank?: boolean;
  linked?: boolean;
  className?: string;
};

export function AttendanceSummary({ attendance, capacity, countBlank = true, linked, className }: Props) {
  const { paid, delegates, complimentary, complimentaryNamed } = attendance;
  const firm = paid + delegates;
  const everyone = firm + (countBlank ? complimentary : complimentaryNamed);
  const href = (kind?: string) => (linked ? `/tickets?tab=tickets${kind ? `&kind=${kind}` : ""}` : undefined);

  return (
    <section aria-label="Attendees so far" className={cn("grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5", className)}>
      <StatTile label="Ticket holders" value={formatNumber(paid)} icon={Ticket} href={href("paid")} caption="Paid tickets issued" />
      <StatTile label="Delegates" value={formatNumber(delegates)} icon={MicVocal} href={href("delegate")} caption="Chairperson, panel members, moderators and guests" />
      <StatTile label="Complimentary" value={formatNumber(complimentary)} icon={Sparkles} href={href("complimentary")}
        caption={complimentary ? `${formatNumber(complimentaryNamed)} named · ${formatNumber(complimentary - complimentaryNamed)} still blank` : "None issued yet"} />
      <StatTile label="Total without complimentary" value={formatNumber(firm)} icon={UsersRound} href={href()} caption="Ticket holders + delegates" />
      <div className="col-span-2 lg:col-span-1">
        <StatTile label="Total with complimentary" value={formatNumber(everyone)} unit={capacity ? `of ${formatNumber(capacity)}` : undefined} icon={UsersRound} tone="good" href={href()}
          meter={capacity ? { value: everyone, max: capacity, tone: "gold" } : undefined}
          caption={`${capacity ? `${pluralize(Math.max(0, capacity - everyone), "seat")} left` : "Everyone with a ticket"}${countBlank || complimentary === complimentaryNamed ? "" : " · blank complimentary not counted"}`} />
      </div>
    </section>
  );
}
