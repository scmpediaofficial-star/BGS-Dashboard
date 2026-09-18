import { AtSign, Camera, FlaskConical, Globe, Music2, Send } from "lucide-react";
import { PROVIDERS, type ProviderId } from "@/lib/social/catalog";
import { cn } from "@/lib/utils";

const SIZES = { xs: "size-5 rounded-md text-[9px]", sm: "size-7 rounded-lg text-[11px]", md: "size-9 rounded-[10px] text-sm", lg: "size-11 rounded-xl text-base" };
const ICON = { xs: "size-3", sm: "size-3.5", md: "size-[18px]", lg: "size-5" };

/** Network tile in the network's own colour. Lettermarks rather than traced logos: crisp at every size and nothing to mis-draw. */
export function BrandIcon({ provider, size = "md", className }: { provider: ProviderId; size?: keyof typeof SIZES; className?: string }) {
  const info = PROVIDERS[provider];
  const glyph: Partial<Record<ProviderId, React.ReactNode>> = {
    linkedin: <span className="font-extrabold lowercase tracking-tight">in</span>,
    facebook: <span className="font-extrabold lowercase">f</span>,
    x: <span className="font-extrabold">𝕏</span>,
    bluesky: <span className="font-extrabold">B</span>,
    mastodon: <span className="font-extrabold">M</span>,
    instagram: <Camera className={ICON[size]} strokeWidth={2.4} aria-hidden />,
    threads: <AtSign className={ICON[size]} strokeWidth={2.6} aria-hidden />,
    tiktok: <Music2 className={ICON[size]} strokeWidth={2.4} aria-hidden />,
    wordpress: <Globe className={ICON[size]} strokeWidth={2.2} aria-hidden />,
    telegram: <Send className={ICON[size]} strokeWidth={2.4} aria-hidden />,
    sandbox: <FlaskConical className={ICON[size]} strokeWidth={2.2} aria-hidden />,
  };
  const background = provider === "instagram" ? "linear-gradient(45deg,#f09433,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888)" : info.color;
  return (
    <span role="img" aria-label={info.name} className={cn("inline-grid shrink-0 select-none place-items-center text-white", SIZES[size], className)} style={{ background }}>
      {glyph[provider]}
    </span>
  );
}
