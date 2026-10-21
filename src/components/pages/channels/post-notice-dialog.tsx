"use client";

import * as React from "react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import type { ChannelSpace } from "@/lib/types";
import { plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Field, Input, Switch, Textarea } from "@/components/ui/primitives";

export function PostNoticeDialog({
  channel,
  audienceCount,
  open,
  onOpenChange,
}: {
  channel: ChannelSpace;
  audienceCount: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent
          title="Post a notice"
          description={`Goes to ${plural(audienceCount, "person", "people")} in ${channel.name}, on their phone and PC.`}
        >
          <PostNoticeForm channel={channel} audienceCount={audienceCount} onDone={() => onOpenChange(false)} />
        </DialogContent>
      )}
    </Dialog>
  );
}

/** mounted fresh each time the dialog opens, so the form always starts empty */
function PostNoticeForm({ channel, audienceCount, onDone }: { channel: ChannelSpace; audienceCount: number; onDone: () => void }) {
  const post = useApp((s) => s.postAnnouncement);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [requiresAck, setRequiresAck] = React.useState(false);
  const [due, setDue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    let ackDueAt: string | undefined;
    if (requiresAck && due) {
      const d = new Date(due);
      if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
        setError("That time has already passed. Pick a later time, or leave it empty.");
        return;
      }
      ackDueAt = d.toISOString();
    }
    post({ channelId: channel.id, title: title.trim(), body: body.trim(), requiresAck, ackDueAt });
    onDone();
    toast.success("Notice posted", {
      description: requiresAck
        ? `${plural(audienceCount, "person", "people")} will be reminded until they acknowledge.`
        : `${plural(audienceCount, "person", "people")} notified.`,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Title" htmlFor="notice-title">
        <Input id="notice-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is this about?" maxLength={120} />
      </Field>
      <Field label="Message" htmlFor="notice-body" hint="Keep it to what people need to know or do. Questions and back-and-forth belong on WhatsApp.">
        <Textarea id="notice-body" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-28" placeholder="Write the notice" />
      </Field>

      <div className="rounded-[var(--radius-md)] border border-line p-3.5">
        <label className="flex cursor-pointer items-start justify-between gap-4">
          <span>
            <span className="block text-[14px] font-medium text-text">Everyone must acknowledge</span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">They&apos;ll be reminded until they do, like a task.</span>
          </span>
          <Switch
            checked={requiresAck}
            onCheckedChange={(v) => {
              setRequiresAck(v);
              setError(null);
            }}
            aria-label="Everyone must acknowledge"
            className="mt-0.5"
          />
        </label>
        {requiresAck && (
          <Field label="Acknowledge by (optional)" htmlFor="notice-due" className="mt-3.5" hint={error ? undefined : "After this time, the notice shows as late for anyone who hasn't confirmed."}>
            <Input
              id="notice-due"
              type="datetime-local"
              value={due}
              onChange={(e) => {
                setDue(e.target.value);
                setError(null);
              }}
              aria-invalid={!!error}
            />
            {error && <p className="text-xs leading-snug text-heat-3">{error}</p>}
          </Field>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!title.trim() || !body.trim()}>
          Post notice
        </Button>
      </div>
    </form>
  );
}
