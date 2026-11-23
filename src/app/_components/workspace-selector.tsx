"use client";

import { useActionState, useId, useState, useTransition } from "react";
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
  const [nativeError, submit] = useActionState(action, null, "/overview");
  const [error, setError] = useState(nativeError);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={submit}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await action(error, form, false);
          // Only the hydrated path needs a fresh request rather than an RSC
          // redirect back into the same streaming route.
          if (result === null) window.location.assign("/overview");
          setError(result);
        });
      }}
    >
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
