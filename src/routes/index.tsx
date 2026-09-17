import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CakeSlice,
  CheckCircle2,
  Clock,
  LifeBuoy,
  ListChecks,
  Plus,
  Trophy,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { NewTaskDialog, type TaskDraft } from "@/components/NewTaskDialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssignments, useMembers, useTeams, initials } from "@/lib/queries";
import { daysUntilBirthday, formatDateTime, formatDayMonth } from "@/lib/dates";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Дашборд — MXP Tasks" },
      {
        name: "description",
        content: "Обзор джейдишек, прогресса команд и дней рождения MXP AIESEC LC Astana.",
      },
      { property: "og:title", content: "Дашборд — MXP Tasks" },
      {
        property: "og:description",
        content: "Обзор джейдишек, прогресса команд и дней рождения MXP AIESEC LC Astana.",
      },
    ],
  }),
  component: Dashboard,
});

const WEEK = 7 * 86_400_000;

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof ListChecks;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className={`mb-3 flex size-10 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="size-5" />
      </div>
      <p className="text-3xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function Dashboard() {
  const { data: assignments = [], isLoading } = useAssignments();
  const { data: members = [] } = useMembers();
  const { data: teams = [] } = useTeams();
  const [draft, setDraft] = useState<TaskDraft | undefined>(undefined);
  const [open, setOpen] = useState(false);

  const stats = useMemo(() => {
    const active = assignments.filter((a) => ["sent", "accepted"].includes(a.status)).length;
    const weekDone = assignments.filter(
      (a) => a.status === "done" && a.done_at && Date.now() - new Date(a.done_at).getTime() < WEEK,
    ).length;
    const overdue = assignments.filter((a) => a.status === "overdue").length;
    const help = assignments.filter((a) => a.status === "help_needed").length;
    const done = assignments.filter((a) => a.status === "done").length;
    const rate = assignments.length ? Math.round((done / assignments.length) * 100) : 0;
    return { active, weekDone, overdue, help, done, rate };
  }, [assignments]);

  const weekly = useMemo(() => {
    const buckets: { name: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const end = Date.now() - i * WEEK;
      const start = end - WEEK;
      const value = assignments.filter(
        (a) =>
          a.status === "done" &&
          a.done_at &&
          new Date(a.done_at).getTime() >= start &&
          new Date(a.done_at).getTime() < end,
      ).length;
      buckets.push({ name: i === 0 ? "Эта нед." : `−${i}`, value });
    }
    return buckets;
  }, [assignments]);

  const teamProgress = useMemo(
    () =>
      teams.map((t) => {
        const rows = assignments.filter((a) => a.members?.team_id === t.id);
        const done = rows.filter((a) => a.status === "done").length;
        return {
          id: t.id,
          name: t.name,
          color: t.color,
          total: rows.length,
          done,
          pct: rows.length ? Math.round((done / rows.length) * 100) : 0,
        };
      }),
    [teams, assignments],
  );

  const leaderboard = useMemo(() => {
    const map = new Map<string, { name: string; done: number }>();
    for (const a of assignments) {
      if (!a.members) continue;
      const entry = map.get(a.members.id) ?? { name: a.members.full_name, done: 0 };
      if (a.status === "done") entry.done += 1;
      map.set(a.members.id, entry);
    }
    return [...map.values()].sort((a, b) => b.done - a.done).slice(0, 5);
  }, [assignments]);

  const attention = assignments.filter((a) => ["help_needed", "overdue"].includes(a.status));

  const birthdays = useMemo(
    () =>
      members
        .filter((m) => m.birthday && m.is_active)
        .map((m) => ({ member: m, days: daysUntilBirthday(m.birthday!) }))
        .filter((x) => x.days <= 14)
        .sort((a, b) => a.days - b.days),
    [members],
  );

  const donut = [
    { name: "Выполнено", value: stats.done, color: "var(--color-success, #00C16E)" },
    {
      name: "Остальное",
      value: Math.max(assignments.length - stats.done, 0),
      color: "color-mix(in oklab, currentColor 12%, transparent)",
    },
  ];

  return (
    <AppShell title="Дашборд">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Membership Experience · AIESEC LC Astana
        </p>
        <Button
          onClick={() => {
            setDraft(undefined);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Новая джейдишка
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Активные"
            value={stats.active}
            icon={ListChecks}
            tone="bg-primary/10 text-primary"
          />
          <KpiCard
            label="Выполнено за неделю"
            value={stats.weekDone}
            icon={CheckCircle2}
            tone="bg-success/15 text-success"
          />
          <KpiCard
            label="Просрочено"
            value={stats.overdue}
            icon={Clock}
            tone="bg-destructive/12 text-destructive"
          />
          <KpiCard
            label="Нужна помощь"
            value={stats.help}
            icon={LifeBuoy}
            tone="bg-warning/25 text-warning-foreground"
          />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-sm font-semibold text-foreground">Процент выполнения</p>
          <div className="relative mt-2 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donut}
                  dataKey="value"
                  innerRadius={58}
                  outerRadius={78}
                  paddingAngle={2}
                  stroke="none"
                >
                  {donut.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-semibold text-foreground">{stats.rate}%</span>
              <span className="text-xs text-muted-foreground">выполнено</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <p className="text-sm font-semibold text-foreground">Выполнено по неделям</p>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly}>
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip cursor={{ fill: "rgba(3,126,243,0.06)" }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#037EF3" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-sm font-semibold text-foreground">Прогресс команд</p>
          <div className="mt-4 space-y-4">
            {teamProgress.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пока нет данных.</p>
            ) : (
              teamProgress.map((t) => (
                <div key={t.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{t.name}</span>
                    <span className="text-muted-foreground">
                      {t.done}/{t.total}
                    </span>
                  </div>
                  <Progress value={t.pct} className="mt-2 h-2" />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Trophy className="size-4 text-warning-foreground" /> Топ мемберов
          </p>
          <div className="mt-4 space-y-3">
            {leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пока никто не выполнил джейдишек.</p>
            ) : (
              leaderboard.map((m, i) => (
                <div key={m.name} className="flex items-center gap-3">
                  <span className="w-4 text-sm text-muted-foreground">{i + 1}</span>
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {initials(m.name)}
                  </span>
                  <span className="flex-1 truncate text-sm text-foreground">{m.name}</span>
                  <span className="text-sm font-semibold text-foreground">{m.done}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CakeSlice className="size-4 text-flame" /> Дни рождения (14 дней)
          </p>
          <div className="mt-4 space-y-3">
            {birthdays.length === 0 ? (
              <p className="text-sm text-muted-foreground">В ближайшие две недели никого.</p>
            ) : (
              birthdays.map(({ member, days }) => (
                <div key={member.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {member.full_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDayMonth(member.birthday)} · через {days} дн.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDraft({
                        title: `Поздравление для ${member.full_name}`,
                        description:
                          "Собрать видео-поздравления и песенные ассоциации, смонтировать и опубликовать.",
                        category: "Дни рождения",
                      });
                      setOpen(true);
                    }}
                  >
                    Создать
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <AlertTriangle className="size-4 text-destructive" /> Требует внимания
        </p>
        <div className="mt-4">
          {attention.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Всё под контролем"
              description="Нет просроченных задач и просьб о помощи."
            />
          ) : (
            <div className="space-y-2">
              {attention.map((a) => (
                <Link
                  key={a.id}
                  to="/tasks/$taskId"
                  params={{ taskId: a.task_id }}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-3 transition-colors hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {a.tasks?.title ?? "Задача"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.members?.full_name} · дедлайн {formatDateTime(a.tasks?.deadline)}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <NewTaskDialog open={open} onOpenChange={setOpen} draft={draft} />
    </AppShell>
  );
}
