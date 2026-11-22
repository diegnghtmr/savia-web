"use client";

import { useActionState } from "react";
import { reserveDraftForm } from "@/app/_actions/draft-receipt";

export function withDraftLock<T>(run: () => Promise<T>) {
  return navigator.locks
    ? navigator.locks.request("savia-draft-cookie", run)
    : run();
}

type DraftKind =
  | "transaction"
  | "transfer"
  | "rate"
  | "budget"
  | "allocations"
  | "fund"
  | "debt-payment";
export const unavailableDraft =
  "Recarga la página antes de volver a intentarlo.";

export function useDraftAction<S>(
  kind: DraftKind,
  bound: unknown,
  action: (state: S | null, form: FormData) => Promise<S | null>,
  unavailable: S,
) {
  return useActionState<S | null, FormData>(
    (state, form) =>
      withDraftLock(async () => {
        form.set("draftContext", JSON.stringify({ kind, bound }));
        try {
          const result = await reserveDraftForm(form);
          if (!result.prepared) return result.state as S | null;
          form.set("draftPrepared", result.prepared);
        } catch {
          return unavailable;
        } finally {
          form.delete("draftContext");
        }
        // The browser has already installed the reservation cookie.
        return action(state, form);
      }),
    null,
  );
}
