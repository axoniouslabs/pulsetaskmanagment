/** A company is either working normally or paused by the Pulse administrator (pure; shared by server and tests). */

export type AccessState = "active" | "paused";

export const accessOf = (org: { status: string }): AccessState => (org.status === "suspended" ? "paused" : "active");

export const PAUSED_MESSAGE = "Pulse is paused for your company. Contact the person who set up Pulse for you.";
