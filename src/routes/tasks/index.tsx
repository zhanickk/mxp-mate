import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CalendarClock,
  KanbanSquare,
  List,
  ListChecks,
  Loader2,
  Plus,
  Repeat,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge, STATUS_LABEL } from "@/components/StatusBadge";
import { NewTaskDialog } from "@/components/NewTaskDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { deleteTasks } from "@/lib/telegram.functions";
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

const KANBAN = ["sent", "accepted", "submitted", "help_needed", "overdue", "done"] as const;

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const qc = useQueryClient();
  const removeTasks = useServerFn(deleteTasks);
  const { profile, isVp } = useAuth();

  /** VP удаляет любые задачи, тимлид только те, что выдал сам. */
  const canDelete = (t: Task) => isVp || t.created_by === profile?.id;

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

  const deletable = filtered.filter(canDelete);
  const chosen = filtered.filter((r) => selected.has(r.id));
  const allChosen = deletable.length > 0 && deletable.every((r) => selected.has(r.id));
  const someChosen = chosen.length > 0 && !allChosen;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allChosen ? new Set() : new Set(deletable.map((r) => r.id)));
  }

  async function removeChosen() {
    const ids = chosen.map((r) => r.id);
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      const res = await removeTasks({ data: { task_ids: ids } });
      toast.success(`Удалено задач: ${res.deleted}`, {
        description: res.notified
          ? `Мемберам в боте написали, что задача отменена (${res.notified}).`
          : undefined,
      });
      if (res.skipped > 0) {
        toast.warning(`Не удалось удалить: ${res.skipped}`, {
          description: "Удалять можно только задачи, которые ты выдал сам.",
        });
      }
      setSelected(new Set());
      setConfirmOpen(false);
      await qc.invalidateQueries();
    } catch (e) {
      toast.error("Не получилось удалить", { description: (e as Error).message });
    } finally {
      setDeleting(false);
    }
  }

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
          {deletable.length > 0 ? (
            <div className="flex items-center gap-3 px-4 pb-1">
              <Checkbox
                checked={allChosen ? true : someChosen ? "indeterminate" : false}
                onCheckedChange={toggleAll}
                aria-label="Выбрать все"
              />
              <span className="text-xs text-muted-foreground">
                {chosen.length > 0 ? `Выбрано ${chosen.length}` : "Выбрать все"}
              </span>
            </div>
          ) : null}
          {filtered.map((r) => (
            <div
              key={r.id}
              className={cn(
                "card-interactive flex items-start gap-3 p-4 transition-colors sm:items-center",
                selected.has(r.id) && "ring-2 ring-primary/40",
              )}
            >
              <Checkbox
                className="mt-1 sm:mt-0"
                checked={selected.has(r.id)}
                disabled={!canDelete(r)}
                onCheckedChange={() => toggleOne(r.id)}
                aria-label={`Выбрать «${r.title}»`}
                title={canDelete(r) ? undefined : "Эту задачу выдал не ты"}
              />
              <Link
                to="/tasks/$taskId"
                params={{ taskId: r.id }}
                className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center"
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
            </div>
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

      {chosen.length > 0 && view === "list" ? (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6 md:pl-64">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-lg">
            <span className="text-sm font-medium text-foreground">Выбрано: {chosen.length}</span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X className="size-4" /> Снять
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="size-4" /> Удалить
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={(v) => !deleting && setConfirmOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить задачи: {chosen.length}?</AlertDialogTitle>
            <AlertDialogDescription>
              Задачи удалятся вместе с назначениями, этапами и историей. Мемберам, у которых они ещё
              не выполнены, бот заменит сообщение на «задача отменена». Отменить это нельзя.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-muted/50 p-3 text-sm">
            {chosen.map((r) => (
              <p key={r.id} className="truncate text-foreground">
                {r.title}
              </p>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void removeChosen();
              }}
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NewTaskDialog open={open} onOpenChange={setOpen} />
    </AppShell>
  );
}
