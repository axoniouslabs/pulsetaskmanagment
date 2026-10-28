"use client";

import * as React from "react";
import { Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/primitives";
import { NewChannelDialog } from "@/components/pages/channels/channel-tools";
import { useApp } from "@/lib/store";
import { useQueryParam } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader, Panel } from "@/components/app/page-header";
import { ChannelList } from "@/components/pages/channels/channel-list";
import { ChannelDetail } from "@/components/pages/channels/channel-detail";
import { channelMembers, countsFor, sortChannels, useMediaQuery, type ChannelCounts } from "@/components/pages/channels/lib";

export default function ChannelsPage() {
  const role = useApp((s) => s.role);
  const meId = useApp((s) => s.userIds[s.role]);
  const channels = useApp((s) => s.channels);
  const announcements = useApp((s) => s.announcements);
  const people = useApp((s) => s.people);
  const teams = useApp((s) => s.teams);
  const groups = useApp((s) => s.groups);
  const departments = useApp((s) => s.departments);
  const org = React.useMemo(() => ({ people, teams, groups, departments }), [people, teams, groups, departments]);

  const [showArchived, setShowArchived] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  /* only channels the viewer belongs to; the owner sees all but private ones they weren't invited to */
  const mine = React.useMemo(() => channels.filter((c) => (role === "owner" && c.kind !== "private") || channelMembers(org, c).includes(meId)), [channels, org, role, meId]);
  const archivedCount = mine.filter((c) => c.archivedAt).length;
  const visible = React.useMemo(() => sortChannels(mine.filter((c) => showArchived || !c.archivedAt)), [mine, showArchived]);
  const counts = React.useMemo(() => {
    const out: Record<string, ChannelCounts> = {};
    for (const c of visible) out[c.id] = countsFor(c, channelMembers(org, c), announcements, meId);
    return out;
  }, [visible, org, announcements, meId]);

  /* desktop: list + detail side by side; phone: list, then detail with a back button */
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const fromUrl = useQueryParam("channel");
  const [picked, setPicked] = React.useState<string | null | undefined>(undefined);
  const fallback = isDesktop ? visible[0]?.id : undefined;
  const wanted = picked === undefined ? (fromUrl ?? fallback) : (picked ?? fallback);
  const active = visible.find((c) => c.id === wanted) ?? (isDesktop ? visible[0] : undefined);

  const select = (id: string) => {
    setPicked(id);
    if (!isDesktop) window.scrollTo({ top: 0 });
  };

  return (
    <div>
      <PageHeader
        title="Channels"
        description="Notices, shared resources and each unit's task feed. Day-to-day chat stays on WhatsApp."
        className={cn(active && "max-lg:hidden")}
        actions={
          role !== "employee" ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> New channel
            </Button>
          ) : undefined
        }
      />
      <NewChannelDialog open={creating} onOpenChange={setCreating} onMade={(id) => setPicked(id)} />

      {visible.length === 0 ? (
        <Panel>
          <EmptyState icon={Megaphone} title="You're not in any channels yet" body="Channels appear when you're added to a department, team or group. Ask your manager if one is missing." />
        </Panel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
          <div className={cn("lg:sticky lg:top-24", active && "max-lg:hidden")}>
            <ChannelList channels={visible} counts={counts} activeId={active?.id} onSelect={select} />
            {archivedCount > 0 && (
              <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 px-1 text-[13px] text-muted">
                Show archived channels ({archivedCount})
                <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label="Show archived channels" />
              </label>
            )}
          </div>
          {active && <ChannelDetail key={active.id} channel={active} org={org} onBack={() => setPicked(null)} />}
        </div>
      )}
    </div>
  );
}
