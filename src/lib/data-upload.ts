export type UploadKind = "import-upload" | "receipt-upload";

// Leave room for the multipart envelope under Next's 1 MiB action limit.
export const uploadLimit = 768 * 1024;
export const uploadMessages = {
  "import-upload": "Selecciona un archivo CSV, QIF u OFX de hasta 768 KiB.",
  "receipt-upload": "Selecciona un PDF, JPEG, PNG o WebP de hasta 768 KiB.",
};
const importTypes = {
  csv: ["text/csv", "application/csv", "application/vnd.ms-excel"],
  qif: ["application/qif", "application/x-qif", "text/qif", "text/x-qif"],
  ofx: ["application/ofx", "application/x-ofx", "text/ofx", "text/x-ofx"],
} as const;
const receiptTypes = new Map([
  ["pdf", "application/pdf"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);

export function uploadFormat(
  kind: UploadKind,
  value: FormDataEntryValue | null,
) {
  if (
    !(value instanceof File) ||
    !value.size ||
    value.size > uploadLimit ||
    value.name.length > 255 ||
    /[\p{Cc}/\\]/u.test(value.name)
  )
    return null;
  const ext = /\.([a-z]+)$/i.exec(value.name)?.[1].toLowerCase();
  if (!ext) return null;
  if (kind === "receipt-upload")
    return receiptTypes.get(ext) === value.type ? ext : null;
  const allowed = importTypes[ext as keyof typeof importTypes];
  if (!Array.isArray(allowed)) return null;
  const common = ["", "application/octet-stream", "text/plain"];
  return [...common, ...allowed].includes(value.type) ? ext : null;
}
