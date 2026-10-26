/** Shared by the admin panel's server and client code. */

export const PAYMENT_METHODS = ["Bank transfer", "JazzCash", "Easypaisa", "Cash", "Other"] as const;

export type { AccessState } from "./subscription";
import type { AccessState } from "./subscription";

export const pkr = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `Rs ${n.toLocaleString("en-PK")}`);

export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

/** how a company's access reads in one short phrase */
export function accessLabel(a: { state: AccessState; expiresAt: string | null; daysLeft: number | null }) {
  if (a.state === "suspended") return "Paused";
  if (!a.expiresAt) return "No end date";
  if (a.state === "expired") {
    const ago = -(a.daysLeft ?? 0);
    return ago <= 0 ? "Ended today" : `Ended ${ago === 1 ? "yesterday" : `${ago} days ago`}`;
  }
  if (a.state === "expiring") return a.daysLeft === 0 ? "Ends today" : `Ends in ${a.daysLeft} ${a.daysLeft === 1 ? "day" : "days"}`;
  return `Paid until ${shortDate(a.expiresAt)}`;
}

export const ago = (iso: string | null | undefined, now = Date.now()) => {
  if (!iso) return "Never";
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
};
