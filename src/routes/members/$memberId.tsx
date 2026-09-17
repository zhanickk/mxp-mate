import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CakeSlice,
  CheckCircle2,
  Clock,
  Pencil,
  Plus,
  QrCode,
  Send,
  Timer,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { MemberDialog } from "@/components/MemberDialog";
import { InviteDialog } from "@/components/InviteDialog";
import { NewTaskDialog } from "@/components/NewTaskDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssignmentsRealtime } from "@/hooks/useRealtime";
import {
  POSITION_LABEL,
  initials,
  useAssignments,
  useMembers,
  useTasks,
  useTeams,
} from "@/lib/queries";
import { formatDate, formatDateTime } from "@/lib/dates";

export const Route = createFileRoute("/members/$memberId")({
  head: () => ({ meta: [{ title: "Профиль мембера — MXP Tasks" }] }),
  component: MemberProfile,
});

function MemberProfile() {
  const { memberId } = Route.useParams();
  const { data: members = [], isLoading } = useMembers();
  const { data: teams = [] } = useTeams();
  const { data: assignments = [] } = useAssignments();
  const { data: tasks = [] } = useTasks();
  useAssignmentsRealtime();
  const [edit, setEdit] = useState(false);
  const [invite, setInvite] = useState(false);
  const [newTask, setNewTask] = useState(false);

  const member = members.find((m) => m.id === memberId);
  const rows = useMemo(
    () => assignments.filter((a) => a.member_id === memberId),
    [assignments, memberId],
  );
  const deadlineOf = useMemo(() => new Map(tasks.map((t) => [t.id, t.deadline])), [tasks]);

  const stats = useMemo(() => {
    const done = rows.filter((r) => r.status === "done");
    const onTime = done.filter((r) => {
      const d = deadlineOf.get(r.task_id);
      return r.done_at && d && r.done_at <= d;
    }).length;
    return {
      total: rows.length,
      done: done.length,
      open: rows.filter((r) => ["sent", "accepted", "help_needed"].includes(r.status)).length,
      overdue: rows.filter((r) => r.status === "overdue").length,
      rate: rows.length ? Math.round((done.length / rows.length) * 100) : 0,
      onTime: done.length ? Math.round((onTime / done.length) * 100) : 0,
    };
  }, [rows, deadlineOf]);

  if (isLoading)
    return (
      <AppShell title="Профиль">
        <Skeleton className="h-48 rounded-2xl" />
      </AppShell>
    );
  if (!member) {
    return (
      <AppShell title="Профиль">
        <EmptyState
          icon={Send}
          title="Мембер не найден"
          action={
            <Button asChild>
              <Link to="/members">К мемберам</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }
  const team = teams.find((t) => t.id === member.team_id);

  return (
    <AppShell title="Профиль мембера">
      <Link
        to="/members"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Все мемберы
      </Link>

      <div className="card-soft overflow-hidden">
        <div
          className="h-20"
          style={{ background: `linear-gradient(120deg, ${team?.color ?? "#037EF3"}, #0A2540)` }}
        />
        <div className="-mt-10 flex flex-wrap items-end gap-4 px-6 pb-6">
          <span
            className="flex size-20 items-center justify-center rounded-2xl border-4 border-card text-2xl font-semibold text-white shadow-md"
            style={{ background: team?.color ?? "#037EF3" }}
          >
            {initials(member.full_name)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-foreground">{member.full_name}</h2>
            <p className="text-sm text-muted-foreground">
              {POSITION_LABEL[member.position]} · {team?.name ?? "Без команды"}
              {member.telegram_username ? ` · @${member.telegram_username}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span
                className={
                  member.telegram_chat_id
                    ? "rounded-full bg-success/15 px-2.5 py-1 text-success"
                    : "rounded-full bg-muted px-2.5 py-1 text-muted-foreground"
                }
              >
                {member.telegram_chat_id ? "Telegram подключён" : "Telegram не подключён"}
              </span>
              {member.birthday ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-flame/10 px-2.5 py-1 text-flame">
                  <CakeSlice className="size-3" /> {formatDate(member.birthday)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setInvite(true)}>
              <QrCode className="size-4" /> Ссылка
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEdit(true)}>
              <Pencil className="size-4" /> Изменить
            </Button>
            <Button size="sm" onClick={() => setNewTask(true)}>
              <Plus className="size-4" /> Задача
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          icon={CheckCircle2}
          label="Выполнено"
          value={`${stats.done}/${stats.total}`}
          tone="bg-success/15 text-success"
        />
        <Stat
          icon={Timer}
          label="Процент выполнения"
          value={`${stats.rate}%`}
          tone="bg-primary/10 text-primary"
        />
        <Stat
          icon={Clock}
          label="Вовремя"
          value={`${stats.onTime}%`}
          tone="bg-warning/25 text-warning-foreground"
        />
        <Stat
          icon={Send}
          label="Открытые / просроч."
          value={`${stats.open} / ${stats.overdue}`}
          tone="bg-destructive/12 text-destructive"
        />
      </div>

      <div className="card-soft mt-6 p-5">
        <p className="mb-4 text-sm font-semibold text-foreground">История задач</p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Задач пока не было.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Link
                key={r.id}
                to="/tasks/$taskId"
                params={{ taskId: r.task_id }}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-3 transition-colors hover:bg-muted/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {r.tasks?.title ?? "Задача"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Дедлайн {formatDateTime(r.tasks?.deadline)}
                    {r.done_at ? ` · сделал ${formatDateTime(r.done_at)}` : ""}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </Link>
            ))}
          </div>
        )}
      </div>

      <MemberDialog open={edit} onOpenChange={setEdit} member={member} />
      <InviteDialog member={invite ? member : null} onOpenChange={setInvite} />
      <NewTaskDialog open={newTask} onOpenChange={setNewTask} draft={{ memberIds: [member.id] }} />
    </AppShell>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Send;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="card-soft p-4">
      <div className={`mb-3 flex size-9 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="size-4" />
      </div>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
