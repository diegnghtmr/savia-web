"use client";

import { useActionState, useId } from "react";
import { selectWorkspace } from "../_actions/workspace";

interface WorkspaceSelectorProps {
  items: readonly { id: string; name: string }[];
  active: string;
  action?: typeof selectWorkspace;
}

export function WorkspaceSelector({
  items,
  active,
  action = selectWorkspace,
}: WorkspaceSelectorProps) {
  const fieldId = useId();
  const [error, submit, pending] = useActionState(
    async (previous: string | null, form: FormData) => {
      const result = await action(previous, form, false);
      // Start a fresh request with the verified cookie instead of redirecting
      // into the same streaming route from within its server action.
      if (result === null) window.location.assign("/overview");
      return result;
    },
    null,
  );

  return (
    <form action={submit}>
      <div className="field">
        <label htmlFor={fieldId}>Espacio activo</label>
        <select id={fieldId} name="workspaceId" defaultValue={active} required>
          {items.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="outcome outcome-error" role="alert">
          {error}
        </p>
      )}
      <button className="submit" type="submit" disabled={pending}>
        {pending ? "Cambiando de espacio…" : "Cambiar de espacio"}
      </button>
    </form>
  );
}
