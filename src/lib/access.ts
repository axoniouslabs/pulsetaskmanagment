/**
 * Whether a company can use Pulse (pure; shared by server and tests):
 * - active: a paying company, working normally
 * - trial: signed up on its own, inside its free trial
 * - trial_ended: the trial is over; everything stays readable, nothing changes
 * - paused: stopped by the Pulse administrator
 */

export type AccessState = "active" | "trial" | "trial_ended" | "paused";

export const TRIAL_DAYS = 3;
/** people a trial company can have, so a trial can't quietly run a whole firm */
export const TRIAL_MAX_PEOPLE = 15;

export const accessOf = (org: { status: string; trialEndsAt?: Date | string | null }, now = new Date()): AccessState => {
  if (org.status === "suspended") return "paused";
  if (!org.trialEndsAt) return "active";
  return new Date(org.trialEndsAt).getTime() > now.getTime() ? "trial" : "trial_ended";
};

/** whole days left, rounded up ("2 days left" until the last hours) */
export const trialDaysLeft = (endsAt: Date | string, now = new Date()) => Math.max(0, Math.ceil((new Date(endsAt).getTime() - now.getTime()) / 864e5));

export const PAUSED_MESSAGE = "Pulse is paused for your company. Contact the person who set up Pulse for you.";
export const TRIAL_ENDED_MESSAGE = "Your free trial has ended. Everything you added is saved and can still be viewed. Contact us to keep using Pulse.";

/** changes that touch nobody else's work, allowed even after a trial ends */
export const ALLOWED_AFTER_TRIAL = new Set(["markRead", "markAllRead", "readAnnouncement", "setPref", "setDayOrder", "setSavedViews"]);
