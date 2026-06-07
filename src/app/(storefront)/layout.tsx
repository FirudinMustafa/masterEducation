import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { AnalyticsTracker } from "@/components/analytics-tracker";

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Admin de storefront'i görebilir — QA/test amacli. Admin paneli icin
  // Header/Footer uzerinden "/admin" linki var.
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <AnalyticsTracker />
    </>
  );
}
