"use server";

import { dataId } from "@/lib/data-access";
import { insightsTransport } from "@/lib/insights-gateway";
import { requireProfile } from "@/lib/require-profile";

export type DeviceState = { error?: string; approved?: true };

export async function approveDevice(
  userId: string,
  _previous: DeviceState | null,
  form: FormData,
): Promise<DeviceState> {
  const invalid = { error: "Revisa el código del dispositivo." };
  const values = form.getAll("userCode");
  const [raw] = values;
  if (
    !dataId(userId) ||
    values.length !== 1 ||
    typeof raw !== "string" ||
    [...raw].length > 16
  )
    return invalid;
  const userCode = raw.replace(/[\s-]/gu, "").toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(userCode)) return invalid;
  const profile = await requireProfile();
  const failed = { error: "No pudimos autorizar el dispositivo." };
  if (profile.kind !== "ready") return failed;
  if (profile.userId !== userId)
    return { error: "La sesión cambió. Vuelve a abrir el formulario." };
  // This account-level endpoint checks expiry against the backend's clock.
  const response = await insightsTransport(profile.accessToken)(
    "cli/device/approve",
    undefined,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userCode }),
      signal: AbortSignal.timeout(5000),
    },
  );
  if (response?.status === 204) return { approved: true };
  if (response?.status === 400)
    return { error: "El código no es válido o ya caducó." };
  if (response?.status === 429)
    return { error: "Demasiados intentos. Inténtalo más tarde." };
  return failed;
}
