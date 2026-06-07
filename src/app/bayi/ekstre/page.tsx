import { redirect } from "next/navigation";

// Cari ekstre (bakiye/limit/hareket) bayi panelinden kaldirildi — sayfa kapali.
export default function DealerStatementPage(): never {
  redirect("/bayi");
}
