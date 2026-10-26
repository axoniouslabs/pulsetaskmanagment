import type { Metadata } from "next";
import { AdminChrome } from "@/components/admin/chrome";

export const metadata: Metadata = { title: { template: "%s · Pulse admin", default: "Pulse admin" }, robots: { index: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminChrome>{children}</AdminChrome>;
}
