import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  BellRing,
  CalendarClock,
  History,
  MessageSquareText,
  Repeat,
  Send,
  ThumbsUp,
  Trash2,
  Undo2,
  UsersRound,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge, STATUS_LABEL } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { resendTask, reviewAssignment, sendReminder } from "@/lib/telegram.functions";
import { useAuth } from "@/hooks/useAuth";
import { Textarea } from "@/components/ui/textarea";
import { useAssignmentsRealtime } from "@/hooks/useRealtime";
import {
  aggregateStatus,
  initials,
  useActivity,
  useProfiles,
  useTask,
  useTaskAssignments,
  useTeams,
} from "@/lib/queries";
import { formatDateTime, formatRelative, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tasks/$taskId")({
  head: () => ({ meta: [{ title: "Задача · MXP Tasks" }] }),
  component: TaskDetail,
});

const MANUAL_STATUSES = [
  "sent",
  "accepted",
  "submitted",
  "done",
  "help_needed",
  "overdue",
] as const;
type ManualStatus = (typeof MANUAL_STATUSES)[number];

function TaskDetail() {
  const { taskId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: task, isLoading } = useTask(taskId);
  const { data: rows = [] } = useTaskAssignments(taskId);
  const { data: teams = [] } = useTeams();
  const { data: profiles = [] } = useProfiles();
  const { data: activity = [] } = useActivity(rows.map((r) => r.id));
  useAssignmentsRealtime();

  const resend = useServerFn(resendTask);
  const remind = useServerFn(sendReminder);
  const review = useServerFn(reviewAssignment);
  const { profile, isVp } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [returnFor, setReturnFor] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState("");

  if (isLoading) {
    return (
      <AppShell title="Задача">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="mt-4 h-64 rounded-2xl" />
      </AppShell>
    );
  }

  if (!task) {
    return (
      <AppShell title="Задача">
        <EmptyState
          icon={History}
          title="Задача не найдена"
          description="Возможно, её удалили."
          action={
            <Button asChild>
              <Link to="/tasks">К задачам</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  const done = rows.filter((r) => r.status === "done").length;
  const overall = aggregateStatus(rows);
  const teamName = teams.find((t) => t.id === task.team_id)?.name ?? "Весь MXP";
  const creator = profiles.find((p) => p.id === task.created_by)?.full_name ?? "-";
  const canReview = isVp || task.created_by === profile?.id;
  const nameById = new Map(rows.map((r) => [r.member_id, r.members?.full_name ?? "-"]));

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["assignments"] });
    await qc.invalidateQueries({ queryKey: ["activity"] });
  }

  async function doResend(ids: string[], key: string) {
    setBusy(key);
    try {
      const res = await resend({ data: { assignment_ids: ids } });
      toast.success(`Отправлено: ${res.sent}`);
      if (res.failed.length) toast.warning("Не доставлено", { description: res.failed.join(", ") });
      await refresh();
    } catch (e) {
      toast.error("Ошибка отправки", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function doRemind(id: string) {
    setBusy(`r-${id}`);
    try {
      const res = await remind({ data: { assignment_id: id } });
      if (res.ok) toast.success("Напоминание отправлено");
      else toast.error("Не удалось напомнить", { description: res.reason ?? "" });
      await refresh();
    } catch (e) {
      toast.error("Ошибка", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(id: string, memberId: string, status: ManualStatus) {
    const now = new Date().toISOString();
    const patch: { status: ManualStatus; accepted_at?: string; done_at?: string } = { status };
    if (status === "accepted") patch.accepted_at = now;
    if (status === "done") patch.done_at = now;
    const { error } = await supabase.from("task_assignments").update(patch).eq("id", id);
    if (error) {
      toast.error("Не удалось изменить статус", { description: error.message });
      return;
    }
    await supabase.from("activity_log").insert({
      assignment_id: id,
      member_id: memberId,
      action: `Статус изменён вручную: ${STATUS_LABEL[status]}`,
    });
    toast.success("Статус обновлён");
    await refresh();
  }

  async function doReview(id: string, approve: boolean, comment?: string) {
    setBusy(`v-${id}`);
    try {
      await review({
        data: {
          assignment_id: id,
          approve,
          ...(comment?.trim() ? { comment: comment.trim() } : {}),
        },
      });
      toast.success(approve ? "Работа принята" : "Вернул на доработку");
      setReturnFor(null);
      setReturnNote("");
      await refresh();
    } catch (e) {
      toast.error("Не получилось", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function deleteTask() {
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) {
      toast.error("Не удалось удалить", { description: error.message });
      return;
    }
    toast.success("Задача удалена");
    await qc.invalidateQueries();
    void navigate({ to: "/tasks" });
  }

  const openIds = rows.filter((r) => r.status !== "done").map((r) => r.id);

  return (
    <AppShell title="Карточка задачи">
      <Link
        to="/tasks"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Все задачи
      </Link>

      <div className="card-soft p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={overall} />
              {task.category ? (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {task.category}
                </span>
              ) : null}
              {task.is_recurring ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  <Repeat className="size-3" /> Еженедельно
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              {task.title}
            </h2>
            {task.description ? (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {task.description}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={openIds.length === 0 || busy === "all"}
              onClick={() => void doResend(openIds, "all")}
            >
              <Send className="size-4" /> Отправить незавершённым
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-destructive hover:text-destructive">
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить задачу?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Все назначения и история по ней тоже удалятся.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void deleteTask()}>Удалить</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-4">
          <Info
            icon={CalendarClock}
            label="Дедлайн"
            value={formatDateTime(task.deadline)}
            hint={formatRelative(task.deadline)}
            danger={isOverdue(task.deadline) && overall !== "done"}
          />
          <Info icon={UsersRound} label="Команда" value={teamName} />
          <Info
            icon={History}
            label="Создал"
            value={creator}
            hint={formatDateTime(task.created_at)}
          />
          <div>
            <p className="text-xs text-muted-foreground">Прогресс</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {done} из {rows.length}
            </p>
            <Progress value={rows.length ? (done / rows.length) * 100 : 0} className="mt-2 h-1.5" />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card-soft p-5 lg:col-span-2">
          <p className="mb-4 text-sm font-semibold text-foreground">Исполнители</p>
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    to="/members/$memberId"
                    params={{ memberId: r.member_id }}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initials(r.members?.full_name ?? "?")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {r.members?.full_name ?? "-"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.done_at
                          ? `Сделал ${formatDateTime(r.done_at)}`
                          : r.accepted_at
                            ? `Принял ${formatDateTime(r.accepted_at)}`
                            : r.sent_at
                              ? `Отправлено ${formatDateTime(r.sent_at)}`
                              : "Не отправлено"}
                        {r.members?.telegram_chat_id ? "" : " · нет Telegram"}
                      </p>
                    </div>
                  </Link>
                  <Select
                    value={r.status}
                    onValueChange={(v) => void changeStatus(r.id, r.member_id, v as ManualStatus)}
                  >
                    <SelectTrigger className="h-8 w-[150px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {r.status === "not_delivered" ? (
                        <SelectItem value="not_delivered">
                          {STATUS_LABEL["not_delivered"]}
                        </SelectItem>
                      ) : null}
                      {MANUAL_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Отправить повторно"
                      disabled={busy === r.id}
                      onClick={() => void doResend([r.id], r.id)}
                    >
                      <Send className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Напомнить"
                      disabled={busy === `r-${r.id}` || r.status === "done"}
                      onClick={() => void doRemind(r.id)}
                    >
                      <BellRing className="size-4" />
                    </Button>
                  </div>
                </div>
                {r.comment ? (
                  <div className="mt-3 flex gap-2 rounded-lg bg-muted/60 p-3 text-sm text-foreground">
                    <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <p className="whitespace-pre-wrap break-words">{r.comment}</p>
                  </div>
                ) : null}
                {r.status === "submitted" ? (
                  canReview ? (
                    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <p className="text-xs font-medium text-foreground">
                        Сдал на проверку. Принять работу или вернуть на доработку?
                      </p>
                      {returnFor === r.id ? (
                        <div className="mt-2 space-y-2">
                          <Textarea
                            rows={2}
                            value={returnNote}
                            onChange={(e) => setReturnNote(e.target.value)}
                            placeholder="Что доделать? Комментарий уйдёт мемберу в бот."
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={busy === `v-${r.id}`}
                              onClick={() => void doReview(r.id, false, returnNote)}
                            >
                              Вернуть на доработку
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setReturnFor(null);
                                setReturnNote("");
                              }}
                            >
                              Отмена
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={busy === `v-${r.id}`}
                            onClick={() => void doReview(r.id, true)}
                          >
                            <ThumbsUp className="size-4" /> Принять
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setReturnFor(r.id)}>
                            <Undo2 className="size-4" /> Вернуть
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Ждёт проверки от того, кто выдал задачу.
                    </p>
                  )
                ) : null}
              </div>
            ))}
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет исполнителей.</p>
            ) : null}
          </div>
        </div>

        <div className="card-soft p-5">
          <p className="mb-4 text-sm font-semibold text-foreground">История</p>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока пусто.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-4">
              {activity.map((a) => (
                <li key={a.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-card",
                      a.action.includes("выполн")
                        ? "bg-success"
                        : a.action.includes("помощь") || a.action.includes("Просроч")
                          ? "bg-destructive"
                          : "bg-primary",
                    )}
                  />
                  <p className="text-sm text-foreground">
                    <span className="font-medium">
                      {a.member_id ? (nameById.get(a.member_id) ?? "") : ""}
                    </span>{" "}
                    {a.action}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Info({
  icon: Icon,
  label,
  value,
  hint,
  danger,
}: {
  icon: typeof History;
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </p>
      <p
        className={cn("mt-1 text-sm font-medium", danger ? "text-destructive" : "text-foreground")}
      >
        {value}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
