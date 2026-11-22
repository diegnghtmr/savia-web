import { DataUploadPage } from "@/app/_components/data-upload-page";

export const dynamic = "force-dynamic";

export default function ReceiptsPage() {
  return <DataUploadPage kind="receipt-upload" />;
}
