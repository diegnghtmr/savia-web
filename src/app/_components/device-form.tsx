"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { DeviceState } from "@/app/_actions/cli-device";

export function DeviceForm({
  action,
}: {
  action: (state: DeviceState | null, form: FormData) => Promise<DeviceState>;
}) {
  const [state, submit, pending] = useActionState(action, null, "/cli/device");
  if (state?.approved)
    return <p role="status">Dispositivo autorizado. Vuelve a la terminal.</p>;
  return (
    <>
      <p>Introduce el código que aparece en tu terminal.</p>
      <form action={submit} aria-label="Autorizar dispositivo">
        {state?.error && <p role="alert">{state.error}</p>}
        <label className="field">
          Código del dispositivo
          <input name="userCode" autoComplete="off" required maxLength={16} />
        </label>
        <button className="submit" type="submit" disabled={pending}>
          Autorizar dispositivo
        </button>
      </form>
      <Link href="/overview" aria-describedby="device-cancel-note">
        Cancelar
      </Link>
      <p id="device-cancel-note">No invalida el código; caducará solo.</p>
    </>
  );
}
