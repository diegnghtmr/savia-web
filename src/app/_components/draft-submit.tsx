"use client";

import { useEffect, useState } from "react";
import { withDraftLock } from "@/lib/draft-client";
import { admitDraftForm } from "../_actions/draft-receipt";

const admissions = new Map<string, Promise<boolean>>();

export function DraftSubmit({
  workspaceId,
  label,
  pending,
  confirmation,
}: {
  workspaceId: string;
  label: string;
  pending: boolean;
  confirmation?: string;
}) {
  const [ready, setReady] = useState<boolean>();
  useEffect(() => {
    let current = true;
    let admission = admissions.get(workspaceId);
    if (!admission) {
      admission = withDraftLock(() => admitDraftForm(workspaceId))
        .catch(() => false)
        .then((ok) => {
          if (!ok) admissions.delete(workspaceId);
          return ok;
        });
      admissions.set(workspaceId, admission);
    }
    void admission.then((ok) => {
      if (current) setReady(ok);
    });
    return () => {
      current = false;
    };
  }, [workspaceId]);
  return (
    <>
      {ready === false && (
        <p role="alert">Recarga la página antes de volver a intentarlo.</p>
      )}
      <button className="submit" type="submit" disabled={!ready || pending}>
        {label}
      </button>
      {confirmation && (
        <button
          className="submit"
          type="submit"
          name="confirmDraft"
          value={confirmation}
          disabled={!ready || pending}
        >
          Registrar de todos modos
        </button>
      )}
    </>
  );
}
