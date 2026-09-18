"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReloadButton() {
  return (
    <Button variant="gold" size="lg" className="mt-7" onClick={() => window.location.reload()}>
      <RefreshCw /> Try again
    </Button>
  );
}
