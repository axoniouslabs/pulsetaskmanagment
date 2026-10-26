/** Shared by the admin panel's server and client code. */

export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

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
