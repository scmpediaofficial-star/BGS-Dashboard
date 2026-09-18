"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions";

type Options<T> = { success?: string | ((data: T) => string); onSuccess?: (data: T) => void; silent?: boolean };

/**
 * Runs a Server Action with consistent feedback: pending state, a toast for the
 * outcome, and a refresh so server-rendered data reflects the change.
 *
 *   const [save, saving] = useAction(saveDeliverable, { success: "Saved" });
 *   await save(values);
 */
export function useAction<A extends unknown[], T>(
  action: (...args: A) => Promise<ActionResult<T>>,
  options: Options<T> = {},
): [(...args: A) => Promise<ActionResult<T>>, boolean] {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { success, onSuccess, silent } = options;

  const execute = useCallback(
    (...args: A) =>
      new Promise<ActionResult<T>>((resolve) => {
        startTransition(async () => {
          let result: ActionResult<T>;
          try {
            result = await action(...args);
          } catch {
            // Thrown only for transport-level failures; validation and permission problems come back as results.
            result = { ok: false, error: "We couldn't reach the server. Check your connection and try again." };
          }
          if (result.ok) {
            const message = typeof success === "function" ? success(result.data) : (success ?? result.message);
            if (message && !silent) toast.success(message);
            onSuccess?.(result.data);
            router.refresh();
          } else {
            toast.error(result.error);
          }
          resolve(result);
        });
      }),
    [action, success, onSuccess, silent, router],
  );

  return [execute, pending];
}
