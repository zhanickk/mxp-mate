import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, ClipboardCheck, Clock, Target, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  initials,
  useAssignments,
  useMembers,
  useProfiles,
  useTeams,
  type AssignmentWithRefs,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Статистика · MXP Tasks" },
      { name: "description", content: "Кто сколько сделал и как идут дела у команд MXP." },
    ],
  }),
  component: StatsPage,
});

// Обе серии проверены валидатором палитры в светлой и тёмной теме:
// разделение по протанопии/тританопии с запасом, контраст к фону выше 3:1.
const SERIES_A = "#0182f0";
const SERIES_B = "#e14b34";

const WEEK = 7 * 24 * 60 * 60 * 1000;

const PERIODS = [
  { id: "4", label: "4 недели", weeks: 4 },
  { id: "12", label: "12 недель", weeks: 12 },
  { id: "all", label: "Всё время", weeks: 0 },
] as const;

type PeriodId = (typeof PERIODS)[number]["id"];

/** Дата, по которой назначение попадает в период: когда его выдали. */
function issuedAt(a: AssignmentWithRefs): number {
  return new Date(a.sent_at ?? a.created_at).getTime();
}

function isOnTime(a: AssignmentWithRefs): boolean {
  if (!a.done_at || !a.tasks?.deadline) return false;
  return new Date(a.done_at).getTime() <= new Date(a.tasks.deadline).getTime();
}

function pct(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0;
}

function StatsPage() {
  const { data: assignments = [], isLoading } = useAssignments();
  const { data: members = [] } = useMembers();
  const { data: teams = [] } = useTeams();
  const { data: profiles = [] } = useProfiles();
  const [period, setPeriod] = useState<PeriodId>("12");

  const weeks = PERIODS.find((p) => p.id === period)?.weeks ?? 0;

  const rows = useMemo(() => {
    if (!weeks) return assignments;
    const from = Date.now() - weeks * WEEK;
    return assignments.filter((a) => issuedAt(a) >= from);
  }, [assignments, weeks]);

  const totals = useMemo(() => {
    const done = rows.filter((a) => a.status === "done");
    const onTime = done.filter(isOnTime).length;
    return {
      total: rows.length,
      done: done.length,
      review: rows.filter((a) => a.status === "submitted").length,
      overdue: rows.filter((a) => a.status === "overdue").length,
      rate: pct(done.length, rows.length),
      onTimeRate: pct(onTime, done.length),
    };
  }, [rows]);

  // Личная статистика мембера: считается за всё его время в департаменте,
  // независимо от того, в какой команде он был, когда получил джейдишку.
  const byMember = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        teamId: string | null;
        total: number;
        done: number;
        onTime: number;
        overdue: number;
        review: number;
        help: number;
      }
    >();

    for (const a of rows) {
      const m = a.members;
      if (!m) continue;
      const entry = map.get(m.id) ?? {
        id: m.id,
        name: m.full_name,
        teamId: m.team_id,
        total: 0,
        done: 0,
        onTime: 0,
        overdue: 0,
        review: 0,
        help: 0,
      };
      entry.total += 1;
      if (a.status === "done") {
        entry.done += 1;
        if (isOnTime(a)) entry.onTime += 1;
      }
      if (a.status === "overdue") entry.overdue += 1;
      if (a.status === "submitted") entry.review += 1;
      if (a.status === "help_needed") entry.help += 1;
      map.set(m.id, entry);
    }

    return [...map.values()]
      .map((e) => ({ ...e, rate: pct(e.done, e.total), onTimeRate: pct(e.onTime, e.done) }))
      .sort((a, b) => b.done - a.done || b.rate - a.rate);
  }, [rows]);

  // Команда берётся из снапшота на момент выдачи, поэтому переходы между
  // командами не переписывают историю задним числом.
  const byTeam = useMemo(
    () =>
      teams.map((t) => {
        const teamRows = rows.filter((a) => (a.team_id ?? a.members?.team_id) === t.id);
        const done = teamRows.filter((a) => a.status === "done");
        return {
          id: t.id,
          name: t.name,
          total: teamRows.length,
          done: done.length,
          overdue: teamRows.filter((a) => a.status === "overdue").length,
          review: teamRows.filter((a) => a.status === "submitted").length,
          rate: pct(done.length, teamRows.length),
          onTimeRate: pct(done.filter(isOnTime).length, done.length),
          people: new Set(teamRows.map((a) => a.member_id)).size,
        };
      }),
    [teams, rows],
  );

  const teamChart = useMemo(
    () =>
      byTeam.map((t) => ({
        name: t.name.replace("Team ", ""),
        Выдано: t.total,
        Сделано: t.done,
      })),
    [byTeam],
  );

  const weekly = useMemo(() => {
    const span = weeks || 12;
    const out: { name: string; Выдано: number; Сделано: number }[] = [];
    for (let i = span - 1; i >= 0; i--) {
      const end = Date.now() - i * WEEK;
      const start = end - WEEK;
      out.push({
        name: i === 0 ? "Эта" : `−${i}`,
        Выдано: rows.filter((a) => issuedAt(a) >= start && issuedAt(a) < end).length,
        Сделано: rows.filter(
          (a) =>
            a.status === "done" &&
            a.done_at &&
            new Date(a.done_at).getTime() >= start &&
            new Date(a.done_at).getTime() < end,
        ).length,
      });
    }
    return out;
  }, [rows, weeks]);

  const byCreator = useMemo(() => {
    const map = new Map<
      string,
      { name: string; tasks: Set<string>; issued: number; review: number }
    >();
    for (const a of rows) {
      const id = a.tasks?.created_by;
      if (!id) continue;
      const name = profiles.find((p) => p.id === id)?.full_name || "Без имени";
      const entry = map.get(id) ?? { name, tasks: new Set<string>(), issued: 0, review: 0 };
      if (a.task_id) entry.tasks.add(a.task_id);
      entry.issued += 1;
      if (a.status === "submitted") entry.review += 1;
      map.set(id, entry);
    }
    return [...map.values()]
      .map((e) => ({ name: e.name, tasks: e.tasks.size, issued: e.issued, review: e.review }))
      .sort((a, b) => b.issued - a.issued);
  }, [rows, profiles]);

  const activeMembers = members.filter((m) => m.is_active).length;

  if (isLoading) {
    return (
      <AppShell title="Статистика">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="mt-4 h-72 rounded-2xl" />
        <Skeleton className="mt-4 h-72 rounded-2xl" />
      </AppShell>
    );
  }

  return (
    <AppShell title="Статистика">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={period === p.id ? "default" : "outline"}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </Button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {activeMembers} активных мемберов
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Пока нечего считать"
          description="Статистика появится, когда мемберы начнут получать и сдавать джейдишки."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi
              label="Выдано"
              value={totals.total}
              icon={Target}
              tone="bg-primary/10 text-primary"
            />
            <Kpi
              label="Выполнено"
              value={totals.done}
              icon={TrendingUp}
              tone="bg-success/15 text-success"
            />
            <Kpi
              label="Процент выполнения"
              value={`${totals.rate}%`}
              icon={BarChart3}
              tone="bg-primary/10 text-primary"
            />
            <Kpi
              label="Сдано в срок"
              value={`${totals.onTimeRate}%`}
              icon={Clock}
              tone="bg-success/15 text-success"
            />
            <Kpi
              label="На проверке"
              value={totals.review}
              icon={ClipboardCheck}
              tone="bg-accent/20 text-accent-foreground"
            />
          </div>

          <Card title="Динамика по неделям" hint="Сколько джейдишек выдали и сколько закрыли">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weekly} margin={{ top: 8, right: 16, bottom: 0, left: -18 }}>
                  <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.08} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      fontSize: 12,
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="Выдано"
                    stroke={SERIES_A}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Сделано"
                    stroke={SERIES_B}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Команды" hint="Команда считается по составу на момент выдачи задачи">
              <div className="space-y-3">
                {byTeam.map((t) => (
                  <div key={t.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">{t.name}</p>
                      <span className="text-xs text-muted-foreground">{t.people} чел.</span>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                      <Mini label="Выдано" value={t.total} />
                      <Mini label="Сделано" value={t.done} />
                      <Mini label="В срок" value={`${t.onTimeRate}%`} />
                      <Mini label="Просрочено" value={t.overdue} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teamChart} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.08} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                    <Tooltip
                      cursor={{ fill: "currentColor", fillOpacity: 0.05 }}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                        fontSize: 12,
                      }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Выдано" fill={SERIES_A} radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="Сделано" fill={SERIES_B} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Кто выдаёт джейдишки" hint="Задачи, созданные каждым тимлидом">
              {byCreator.length === 0 ? (
                <p className="text-sm text-muted-foreground">Пока никто не выдавал задач.</p>
              ) : (
                <div className="space-y-3">
                  {byCreator.map((c) => {
                    const max = byCreator[0]?.issued || 1;
                    return (
                      <div key={c.name}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate font-medium text-foreground">{c.name}</span>
                          <span className="text-muted-foreground">
                            {c.tasks} задач · {c.issued} назначений
                            {c.review ? ` · ${c.review} на проверке` : ""}
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(pct(c.issued, max), 4)}%`,
                              background: SERIES_A,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <Card
            title="Рейтинг мемберов"
            hint="Личная статистика за всё время, команда на неё не влияет"
          >
            <div className="space-y-3">
              {byMember.slice(0, 10).map((m, i) => {
                const max = byMember[0]?.done || 1;
                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <span className="w-4 shrink-0 text-sm text-muted-foreground">{i + 1}</span>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initials(m.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium text-foreground">{m.name}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {m.done} из {m.total}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(pct(m.done, max), 3)}%`,
                            background: SERIES_A,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Мембер</TableHead>
                    <TableHead className="text-right">Выдано</TableHead>
                    <TableHead className="text-right">Сделано</TableHead>
                    <TableHead className="text-right">Процент</TableHead>
                    <TableHead className="text-right">В срок</TableHead>
                    <TableHead className="text-right">Просрочено</TableHead>
                    <TableHead className="text-right">Помощь</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byMember.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-foreground">{m.name}</TableCell>
                      <TableCell className="text-right">{m.total}</TableCell>
                      <TableCell className="text-right">{m.done}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium",
                          m.rate >= 80
                            ? "text-success"
                            : m.rate < 50
                              ? "text-destructive"
                              : "text-foreground",
                        )}
                      >
                        {m.rate}%
                      </TableCell>
                      <TableCell className="text-right">{m.onTimeRate}%</TableCell>
                      <TableCell className="text-right">{m.overdue}</TableCell>
                      <TableCell className="text-right">{m.help}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card-soft p-5">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <div className="card-soft p-5">
      <div className={cn("flex size-10 items-center justify-center rounded-xl", tone)}>
        <Icon className="size-5" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/60 p-2">
      <p className="text-sm font-semibold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
