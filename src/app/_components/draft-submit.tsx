"use client";

import { useHydrated } from "@/lib/use-hydrated";

export function DraftSubmit({
  label,
  pending,
  confirmation,
}: {
  label: string;
  pending: boolean;
  confirmation?: string;
}) {
  const ready = useHydrated();
  const disabled = pending || !ready;
  return (
    <>
      <button className="submit" type="submit" disabled={disabled}>
        {label}
      </button>
      {confirmation && (
        <button
          className="submit"
          type="submit"
          name="confirmDraft"
          value={confirmation}
          disabled={disabled}
        >
          Registrar de todos modos
        </button>
      )}
    </>
  );
}
