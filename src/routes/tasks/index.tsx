import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarClock, KanbanSquare, List, ListChecks, Plus, Repeat, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge, STATUS_LABEL } from "@/components/StatusBadge";
import { NewTaskDialog } from "@/components/NewTaskDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAssignmentsRealtime } from "@/hooks/useRealtime";
import {
  CATEGORIES,
  aggregateStatus,
  initials,
  useAssignments,
  useMembers,
  useTasks,
  useTeams,
  type Task,
} from "@/lib/queries";
import { formatDateTime, formatRelative, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tasks/")({
  head: () => ({ meta: [{ title: "Задачи · MXP Tasks" }] }),
  component: TasksPage,
});

type Row = Task & {
  status: string;
  done: number;
  total: number;
  memberIds: string[];
  names: string[];
};

const KANBAN = ["sent", "accepted", "help_needed", "overdue", "done"] as const;

function TasksPage() {
  const { data: tasks = [], isLoading } = useTasks();
  const { data: assignments = [] } = useAssignments();
  const { data: teams = [] } = useTeams();
  const { data: members = [] } = useMembers();
  useAssignmentsRealtime();

  const [view, setView] = useState<"list" | "kanban">("list");
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("all");
  const [status, setStatus] = useState("all");
  const [member, setMember] = useState("all");
  const [category, setCategory] = useState("all");
  const [open, setOpen] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const byTask = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const list = byTask.get(a.task_id) ?? [];
      list.push(a);
      byTask.set(a.task_id, list);
    }
    return tasks.map((t) => {
      const list = byTask.get(t.id) ?? [];
      return {
        ...t,
        status: aggregateStatus(list),
        done: list.filter((a) => a.status === "done").length,
        total: list.length,
        memberIds: list.map((a) => a.member_id),
        names: list.map((a) => a.members?.full_name ?? ""),
      };
    });
  }, [tasks, assignments]);

  const filtered = rows.filter((r) => {
    if (q && !`${r.title} ${r.description ?? ""}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    if (team !== "all" && r.team_id !== team) return false;
    if (status !== "all" && r.status !== status) return false;
    if (member !== "all" && !r.memberIds.includes(member)) return false;
    if (category !== "all" && r.category !== category) return false;
    return true;
  });

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "Весь MXP";

  return (
    <AppShell title="Задачи">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Поиск по задачам"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex rounded-xl border border-border bg-card p-1">
          <Button
            size="sm"
            variant={view === "list" ? "secondary" : "ghost"}
            onClick={() => setView("list")}
          >
            <List className="size-4" /> Список
          </Button>
          <Button
            size="sm"
            variant={view === "kanban" ? "secondary" : "ghost"}
            onClick={() => setView("kanban")}
          >
            <KanbanSquare className="size-4" /> Канбан
          </Button>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Новая джейдишка
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Select value={team} onValueChange={setTeam}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все команды</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={member} onValueChange={setMember}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все мемберы</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все категории</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={rows.length === 0 ? "Пока нет джейдишек" : "Ничего не найдено"}
          description={
            rows.length === 0
              ? "Создай первую задачу, она сразу уйдёт мемберам в Telegram."
              : "Попробуй изменить фильтры."
          }
          action={
            rows.length === 0 ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" /> Новая джейдишка
              </Button>
            ) : undefined
          }
        />
      ) : view === "list" ? (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Link
              key={r.id}
              to="/tasks/$taskId"
              params={{ taskId: r.id }}
              className="card-interactive flex flex-col gap-3 p-4 hover:-translate-y-0.5 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium text-foreground">{r.title}</p>
                  {r.is_recurring ? <Repeat className="size-3.5 text-primary" /> : null}
                  {r.category ? (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {r.category}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {teamName(r.team_id)} · {r.names.slice(0, 3).join(", ")}
                  {r.names.length > 3 ? ` +${r.names.length - 3}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-4 sm:w-[420px] sm:justify-end">
                <div className="w-24">
                  <Progress value={r.total ? (r.done / r.total) * 100 : 0} className="h-1.5" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.done}/{r.total}
                  </p>
                </div>
                <div
                  className={cn(
                    "flex items-center gap-1 text-xs",
                    isOverdue(r.deadline) && r.status !== "done"
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  <CalendarClock className="size-3.5" />
                  <span title={formatDateTime(r.deadline)}>{formatRelative(r.deadline)}</span>
                </div>
                <StatusBadge status={r.status} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {KANBAN.map((col) => {
            const items = filtered.filter((r) =>
              col === "sent"
                ? r.status === "sent" || r.status === "not_delivered"
                : r.status === col,
            );
            return (
              <div key={col} className="w-72 shrink-0 rounded-2xl bg-muted/50 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <StatusBadge status={col} />
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((r) => (
                    <Link
                      key={r.id}
                      to="/tasks/$taskId"
                      params={{ taskId: r.id }}
                      className="card-interactive block p-3 hover:-translate-y-0.5"
                    >
                      <p className="text-sm font-medium text-foreground">{r.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(r.deadline)}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex -space-x-2">
                          {r.names.slice(0, 4).map((n, i) => (
                            <span
                              key={i}
                              className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-primary/15 text-[10px] font-semibold text-primary"
                            >
                              {initials(n)}
                            </span>
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {r.done}/{r.total}
                        </span>
                      </div>
                    </Link>
                  ))}
                  {items.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-muted-foreground">Пусто</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NewTaskDialog open={open} onOpenChange={setOpen} />
    </AppShell>
  );
}
