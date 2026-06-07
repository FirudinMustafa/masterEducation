import { redirect } from "next/navigation";

// İskonto oranlari bayi panelinden kaldirildi — sayfa kapali.
export default function DealerDiscountsPage(): never {
  redirect("/bayi");
}
