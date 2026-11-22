"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { saveData } from "@/app/_actions/data";
import { unavailableDraft, useDraftAction } from "@/lib/draft-client";
import {
  uploadFormat,
  uploadMessages,
  type UploadKind,
} from "@/lib/data-upload";
import { DraftReceipt } from "./draft-receipt";
import { DraftSubmit } from "./draft-submit";

export function DataForm({
  bound,
  children,
  label,
  resultLabel,
  upload,
}: {
  bound: Parameters<typeof saveData>[0];
  children: ReactNode;
  label: string;
  resultLabel: string;
  upload?: UploadKind;
}) {
  const [error, setError] = useState("");
  const [state, submit, pending] = useDraftAction(
    "data",
    bound,
    saveData.bind(null, bound),
    { error: unavailableDraft },
  );
  if (state?.receipt && state.href)
    return (
      <>
        <DraftReceipt id={state.receipt} />
        <a href={state.href}>{resultLabel}</a>
      </>
    );
  return (
    <form
      action={submit}
      onReset={(event) => event.preventDefault()}
      onSubmit={(event) => {
        if (
          upload &&
          !uploadFormat(upload, new FormData(event.currentTarget).get("file"))
        ) {
          event.preventDefault();
          setError(uploadMessages[upload]);
        } else setError("");
      }}
    >
      <fieldset disabled={pending}>
        {children}
        {(error || state?.error) && <p role="alert">{error || state?.error}</p>}
        {state?.href && <a href={state.href}>Revisar estado actual</a>}
        <DraftSubmit
          workspaceId={bound.workspaceId}
          label={pending ? "Enviando…" : label}
          pending={pending}
          confirmation={error ? undefined : state?.confirmation}
        />
      </fieldset>
    </form>
  );
}
