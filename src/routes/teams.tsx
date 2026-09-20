import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { UsersRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { POSITION_LABEL, initials, useAssignments, useMembers, useTeams } from "@/lib/queries";

export const Route = createFileRoute("/teams")({
  head: () => ({ meta: [{ title: "Команды · MXP Tasks" }] }),
  component: TeamsPage,
});

function TeamsPage() {
  const { data: teams = [], isLoading } = useTeams();
  const { data: members = [] } = useMembers();
  const { data: assignments = [] } = useAssignments();

  const data = useMemo(
    () =>
      teams.map((t) => {
        const ms = members.filter((m) => m.team_id === t.id);
        const ids = new Set(ms.map((m) => m.id));
        const rows = assignments.filter((a) => ids.has(a.member_id));
        const done = rows.filter((a) => a.status === "done").length;
        const perMember = new Map<string, { done: number; total: number }>();
        for (const a of rows) {
          const e = perMember.get(a.member_id) ?? { done: 0, total: 0 };
          e.total += 1;
          if (a.status === "done") e.done += 1;
          perMember.set(a.member_id, e);
        }
        return {
          team: t,
          members: ms,
          perMember,
          total: rows.length,
          done,
          open: rows.filter((a) =>
            ["sent", "accepted", "help_needed", "submitted"].includes(a.status),
          ).length,
          overdue: rows.filter((a) => a.status === "overdue").length,
          connected: ms.filter((m) => m.telegram_chat_id).length,
        };
      }),
    [teams, members, assignments],
  );

  return (
    <AppShell title="Команды">
      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={UsersRound} title="Команд пока нет" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {data.map((d) => (
            <div key={d.team.id} className="card-soft overflow-hidden">
              <div
                className="p-5 text-white"
                style={{ background: `linear-gradient(120deg, ${d.team.color}, #0A2540)` }}
              >
                <p className="text-lg font-semibold">{d.team.name}</p>
                <p className="mt-1 text-sm text-white/80">{d.team.description}</p>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[
                    ["Мемберов", d.members.length],
                    ["Открыто", d.open],
                    ["Готово", d.done],
                    ["Просроч.", d.overdue],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-xl bg-white/15 px-2 py-2">
                      <p className="text-xl font-semibold">{v}</p>
                      <p className="text-[11px] text-white/80">{l}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-5">
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-muted-foreground">Выполнение</span>
                  <span className="font-medium text-foreground">
                    {d.total ? Math.round((d.done / d.total) * 100) : 0}%
                  </span>
                </div>
                <Progress value={d.total ? (d.done / d.total) * 100 : 0} className="h-2" />
                <p className="mt-2 text-xs text-muted-foreground">
                  Telegram подключён: {d.connected}/{d.members.length}
                </p>

                <div className="mt-5 space-y-2">
                  {d.members.length === 0 ? (
                    <p className="text-sm text-muted-foreground">В команде пока никого.</p>
                  ) : null}
                  {d.members.map((m) => {
                    const s = d.perMember.get(m.id);
                    return (
                      <Link
                        key={m.id}
                        to="/members/$memberId"
                        params={{ memberId: m.id }}
                        className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60"
                      >
                        <span
                          className="flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                          style={{ background: d.team.color }}
                        >
                          {initials(m.full_name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {m.full_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {POSITION_LABEL[m.position]}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {s ? `${s.done}/${s.total}` : "-"}
                        </span>
                        <span
                          className={
                            m.telegram_chat_id
                              ? "size-2 rounded-full bg-success"
                              : "size-2 rounded-full bg-muted-foreground/30"
                          }
                        />
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
