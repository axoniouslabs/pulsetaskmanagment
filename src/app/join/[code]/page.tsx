import { Suspense } from "react";
import type { Metadata } from "next";
import { JoinForm } from "../join-form";

export const metadata: Metadata = { title: "Join your company" };

async function WithCode({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinForm initialCode={code} />;
}

export default function JoinWithCode({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense>
      <WithCode params={params} />
    </Suspense>
  );
}
