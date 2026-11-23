import { approveDevice } from "@/app/_actions/cli-device";
import { DeviceForm } from "@/app/_components/device-form";
import { requireProfile } from "@/lib/require-profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Autorizar dispositivo CLI" };

export default async function DevicePage() {
  const profile = await requireProfile();
  return (
    <>
      <h1>Autorizar dispositivo CLI</h1>
      {profile.kind === "ready" ? (
        <DeviceForm action={approveDevice.bind(null, profile.userId)} />
      ) : (
        <p role="alert">No pudimos consultar tu perfil.</p>
      )}
    </>
  );
}
