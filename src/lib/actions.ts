import "server-only";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { PermissionError } from "@/lib/auth/session";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

/**
 * Wraps a Server Action body so every action returns the same shape and no
 * internal error text ever reaches the browser. `redirect()` and `notFound()`
 * are passed through untouched.
 */
export async function run<T>(fn: () => Promise<T>, successMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: successMessage };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".") || "_";
        fieldErrors[key] ??= issue.message;
      }
      return { ok: false, error: Object.values(fieldErrors)[0] ?? "Please check the form and try again.", fieldErrors };
    }
    if (err instanceof PermissionError || err instanceof ActionError) return { ok: false, error: err.message };
    console.error("[action] unexpected error:", err);
    return { ok: false, error: "Something went wrong on our side. Please try again." };
  }
}

/** Turns a Supabase error into a friendly ActionError (RLS denials read as permission problems). */
export function check<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) {
    const { code, message } = result.error;
    if (code === "42501" || /row-level security/i.test(message)) throw new PermissionError();
    if (code === "23505") throw new ActionError("That already exists.");
    if (code === "23503") throw new ActionError("This record is still linked to other records.");
    if (code === "P0001") throw new ActionError(message); // raised deliberately by a database guard
    console.error("[db]", code, message);
    throw new ActionError("The database rejected that change. Please try again.");
  }
  return result.data;
}

/** Like `check`, for single-row reads: a missing row becomes a clear, user-facing error. */
export function one<T>(result: { data: T; error: { message: string; code?: string } | null }): NonNullable<T> {
  // PGRST116 = .single() matched no rows (deleted by someone else, or hidden by row-level security).
  if (result.error?.code === "PGRST116") throw new ActionError("That record no longer exists.");
  const data = check(result);
  if (data === null || data === undefined) throw new ActionError("That record no longer exists.");
  return data as NonNullable<T>;
}

// ── Shared field schemas ────────────────────────────────────────────────────
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const f = {
  id: z.uuid("Invalid reference."),
  text: (max = 300) => z.string().trim().min(1, "This field is required.").max(max, `Keep this under ${max} characters.`),
  optionalText: (max = 2000) => z.preprocess(emptyToNull, z.string().trim().max(max, `Keep this under ${max} characters.`).nullable().optional()),
  optionalEmail: z.preprocess(emptyToNull, z.email("Enter a valid email address.").max(254).nullable().optional()),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254)),
  optionalUrl: z.preprocess(emptyToNull, z.url("Enter a full link, starting with https://").max(2000).nullable().optional()),
  optionalDate: z.preprocess(emptyToNull, z.iso.date("Use a valid date.").nullable().optional()),
  optionalId: z.preprocess(emptyToNull, z.uuid().nullable().optional()),
  optionalInt: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().min(0).max(1_000_000).nullable().optional()),
  optionalMoney: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().min(0).max(1_000_000_000).nullable().optional()),
};
