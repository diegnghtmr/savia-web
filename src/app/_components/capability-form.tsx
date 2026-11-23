"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import { acknowledgeDraft } from "@/app/_actions/draft-receipt";
import type { CapabilityState } from "@/app/_actions/capabilities";
import { withDraftLock } from "@/lib/draft-client";
import { useHydrated } from "@/lib/use-hydrated";
import { DraftReceipt } from "./draft-receipt";

export function CapabilityForm({
  action,
  label,
  children,
  secret,
}: {
  action: (
    previous: CapabilityState | null,
    form: FormData,
  ) => Promise<CapabilityState>;
  label: string;
  children?: ReactNode;
  secret?: boolean;
}) {
  const hydrated = useHydrated();
  const [nativeState, submit, nativePending] = useActionState(action, null);
  const [enhanced, setEnhanced] = useState<CapabilityState>();
  const [pending, startTransition] = useTransition();
  const state = enhanced ?? nativeState;
  const busy = pending || nativePending;
  const title = state?.prepared ? "Confirmar envío" : label;
  return (
    <>
      {state?.receipt && (
        <>
          {enhanced ? (
            <DraftReceipt id={state.receipt} />
          ) : (
            <form action={acknowledgeDraft.bind(null, state.receipt)}>
              <button type="submit">Reconocer operación</button>
            </form>
          )}
          {state.href && (
            <p>
              <a href={state.href}>Continuar</a>
            </p>
          )}
        </>
      )}
      {state?.answer !== undefined && (
        <section aria-label="Respuesta del asistente">
          <p>{state.answer || "El asistente no devolvió texto."}</p>
          {state.approvalHref && (
            <a href={state.approvalHref}>Revisar aprobación requerida</a>
          )}
        </section>
      )}
      {!state?.receipt || state.answer !== undefined ? (
        <form
          action={submit}
          aria-label={label}
          data-enhanced={hydrated || undefined}
          autoComplete={secret ? "off" : undefined}
          onSubmit={(event) => {
            event.preventDefault();
            const button = (event.nativeEvent as SubmitEvent).submitter;
            const form = new FormData(event.currentTarget, button);
            if (secret) event.currentTarget.reset();
            startTransition(async () => {
              const result = await withDraftLock(async () => {
                const first = await action(null, form);
                if (!first.prepared) return first;
                form.set("draftPrepared", first.prepared);
                return action(null, form);
              });
              setEnhanced(result);
            });
          }}
        >
          <fieldset disabled={busy}>
            {children}
            {state?.prepared && (
              <>
                <input
                  type="hidden"
                  name="draftPrepared"
                  value={state.prepared}
                />
                <p role="status">Repite los datos y confirma el envío.</p>
              </>
            )}
            {state?.error && <p role="alert">{state.error}</p>}
            {state?.confirmation ? (
              <button
                className="submit"
                name="confirmDraft"
                value={state.confirmation}
              >
                Registrar de todos modos
              </button>
            ) : (
              <button className="submit" type="submit">
                {busy ? "Enviando…" : title}
              </button>
            )}
          </fieldset>
        </form>
      ) : (
        <p role="status">Solicitud completada.</p>
      )}
    </>
  );
}
