import { AdminPanel } from "@/components/app/AdminPanel";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminPanel />;
}
