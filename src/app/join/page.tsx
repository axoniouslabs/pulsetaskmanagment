import type { Metadata } from "next";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Join your company" };

export default function JoinPage() {
  return <JoinForm />;
}
