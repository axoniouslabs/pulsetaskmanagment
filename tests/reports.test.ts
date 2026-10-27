import { describe, expect, it } from "vitest";
import { buildXlsx } from "@/lib/xlsx";
import { burnDown, projectRows } from "@/components/pages/reports/projects";
import { pkt, task } from "./fixtures";

describe("reports", () => {
  it("writes a real .xlsx zip with one file per sheet", () => {
    const bytes = buildXlsx([
      {
        name: "People",
        rows: [
          ["Name", "Done"],
          ["Kamran", 4],
        ],
      },
      { name: "Days", rows: [["Date"]] },
    ]);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("xl/worksheets/sheet2.xml");
    expect(text).toContain("<v>4</v>");
  });

  it("sums a project's progress and lateness from its own tasks", () => {
    const now = pkt("2026-10-21T10:00:00");
    const p = { id: "pr1", name: "Launch", hue: 200 } as never;
    const tasks = [
      task({
        id: "a",
        assigneeId: "p_kamran",
        projectId: "pr1",
        status: "approved",
        approvedAt: pkt("2026-10-20T09:00:00").toISOString(),
        dueAt: pkt("2026-10-20T17:00:00").toISOString(),
        estimateHours: 4,
      }),
      task({ id: "b", assigneeId: "p_kamran", projectId: "pr1", status: "assigned", dueAt: pkt("2026-10-20T17:00:00").toISOString(), estimateHours: 6 }),
      task({ id: "c", assigneeId: "p_kamran", projectId: "other" }),
    ];
    const [r] = projectRows([p], tasks, now);
    expect(r).toMatchObject({ total: 2, done: 1, open: 1, overdue: 1, onTime: 100, estHours: 10 });
    const bd = burnDown(tasks.slice(0, 2), now)!;
    expect(bd.scope).toBe(10);
  });
});
