import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminMobileHeader } from "@/components/admin/mobile-header";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/yonetim");
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex-1 bg-gray-50 flex flex-col">
        <AdminMobileHeader />
        <div className="flex-1 p-6 md:p-8">{children}</div>
      </div>
    </div>
  );
}
