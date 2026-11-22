import { dataAccess } from "@/lib/data-access";
import { uploadMessages, type UploadKind } from "@/lib/data-upload";
import { DataForm } from "./data-form";

const uploadLabels = {
  "import-upload": ["Importar extracto", "Analizar extracto", ".csv,.qif,.ofx"],
  "receipt-upload": [
    "Comprobantes",
    "Enviar a OCR",
    ".pdf,.jpeg,.jpg,.png,.webp",
  ],
};

export async function DataUploadPage({ kind }: { kind: UploadKind }) {
  const access = await dataAccess();
  const [title, label, accept] = uploadLabels[kind];
  return (
    <>
      <h1>{title}</h1>
      {!access ? (
        <p role="alert">No hay un espacio activo disponible.</p>
      ) : (
        <>
          <p className="eyebrow">{access.workspace.name}</p>
          <DataForm
            bound={{ workspaceId: access.workspace.id, kind }}
            upload={kind}
            label={label}
            resultLabel="Ver revisión"
          >
            <label className="field">
              Archivo
              <input name="file" type="file" accept={accept} required />
            </label>
            <p className="hint">{uploadMessages[kind]}</p>
            {kind === "receipt-upload" && <p>El OCR se realizará en Savia.</p>}
          </DataForm>
        </>
      )}
    </>
  );
}
