import { Skeleton } from "@/components/ui/misc";

/** Route-level boundary: gives instant feedback, and is the shell Next.js prefetches for offline navigation. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="grid gap-5">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-card" />)}
      </div>
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}
