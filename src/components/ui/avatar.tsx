import { cn, initials } from "@/lib/utils";

// Brand-tinted backgrounds; chosen by name so a person keeps their colour everywhere.
const TINTS = [
  "bg-[#804a95] text-white",
  "bg-[#212162] text-white dark:bg-[#34348a]",
  "bg-[#a36a1c] text-white",
  "bg-[#1f6b4f] text-white",
  "bg-[#2a5fa8] text-white",
  "bg-[#a8435f] text-white",
];

function tintFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

const SIZES = { xs: "size-6 text-[9.5px]", sm: "size-7 text-[10.5px]", md: "size-9 text-xs", lg: "size-12 text-sm", xl: "size-16 text-lg" };

type AvatarProps = { name: string | null | undefined; src?: string | null; size?: keyof typeof SIZES; className?: string };

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const label = name?.trim() || "Unknown";
  return (
    <span
      title={label}
      className={cn(
        "relative inline-grid shrink-0 select-none place-items-center overflow-hidden rounded-full font-bold tracking-wide ring-2 ring-surface",
        SIZES[size],
        !src && tintFor(label),
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied URLs from any host
        <img src={src} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span aria-hidden>{initials(label)}</span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = "sm" }: { people: { name: string; src?: string | null }[]; max?: number; size?: keyof typeof SIZES }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="flex -space-x-1.5">
      {shown.map((p) => <Avatar key={p.name} name={p.name} src={p.src} size={size} />)}
      {extra > 0 && (
        <span className={cn("inline-grid place-items-center rounded-full bg-surface-3 font-bold text-ink-2 ring-2 ring-surface", SIZES[size])}>
          +{extra}
        </span>
      )}
    </span>
  );
}
