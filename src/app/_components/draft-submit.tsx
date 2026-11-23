"use client";

export function DraftSubmit({
  label,
  pending,
  confirmation,
}: {
  label: string;
  pending: boolean;
  confirmation?: string;
}) {
  return (
    <>
      <button className="submit" type="submit" disabled={pending}>
        {label}
      </button>
      {confirmation && (
        <button
          className="submit"
          type="submit"
          name="confirmDraft"
          value={confirmation}
          disabled={pending}
        >
          Registrar de todos modos
        </button>
      )}
    </>
  );
}
