import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSkeleton } from "@/components/admin/bits";
import { SupportSettings } from "@/components/admin/support";
import { getPlatformSettings } from "@/server/platform";
import { requireAdmin } from "../guard";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const me = await requireAdmin();
  const s = await getPlatformSettings();
  return <SupportSettings initial={{ supportName: s.supportName ?? "", supportPhone: s.supportPhone ?? "", supportEmail: s.supportEmail ?? "" }} adminEmail={me.email} />;
}
