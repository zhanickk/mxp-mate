import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendTask } from "@/lib/telegram.functions";
import { useAuth } from "@/hooks/useAuth";
import { CATEGORIES, useMembers, useTeams, useTemplates } from "@/lib/queries";
import { almatyInputToIso, isoToAlmatyInputs } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TaskDraft = {
  title?: string;
  description?: string;
  category?: string;
  memberIds?: string[];
  deadlineIso?: string;
};

function defaultDeadline(days = 3) {
  return isoToAlmatyInputs(new Date(Date.now() + days * 86_400_000).toISOString());
}

export function NewTaskDialog({
  open,
  onOpenChange,
  draft,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft?: TaskDraft | undefined;
}) {
  const { profile, isVp } = useAuth();
  const qc = useQueryClient();
  const send = useServerFn(sendTask);
  const { data: members = [] } = useMembers();
  const { data: teams = [] } = useTeams();
  const { data: templates = [] } = useTemplates();

  const [templateId, setTemplateId] = useState("blank");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("Другое");
  const [teamId, setTeamId] = useState<string>("all");
  const [date, setDate] = useState(defaultDeadline().date);
  const [time, setTime] = useState("18:00");
  const [selected, setSelected] = useState<string[]>([]);
  const [recurring, setRecurring] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const d = draft?.deadlineIso ? isoToAlmatyInputs(draft.deadlineIso) : defaultDeadline();
    setTemplateId("blank");
    setTitle(draft?.title ?? "");
    setDescription(draft?.description ?? "");
    setCategory(draft?.category ?? "Другое");
    setTeamId(isVp ? "all" : (profile?.team_id ?? "all"));
    setDate(d.date);
    setTime(d.time || "18:00");
    setSelected(draft?.memberIds ?? []);
    setRecurring(false);
  }, [open, draft, isVp, profile?.team_id]);

  const activeMembers = useMemo(() => members.filter((m) => m.is_active), [members]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setTitle(tpl.title);
    setDescription(tpl.description ?? "");
    setCategory(tpl.category ?? "Другое");
    if (tpl.team_id) setTeamId(tpl.team_id);
    setDate(defaultDeadline(tpl.default_deadline_days).date);
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function selectTeam(id: string | null) {
    const ids = activeMembers.filter((m) => (id ? m.team_id === id : true)).map((m) => m.id);
    setSelected(ids);
  }

  async function submit() {
    if (!title.trim()) {
      toast.error("Введите название джейдишки");
      return;
    }
    if (!date) {
      toast.error("Укажите дедлайн");
      return;
    }
    if (selected.length === 0) {
      toast.error("Выберите хотя бы одного исполнителя");
      return;
    }
    setBusy(true);
    try {
      const { data: task, error } = await supabase
        .from("tasks")
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          category,
          team_id: teamId === "all" ? null : teamId,
          deadline: almatyInputToIso(date, time),
          created_by: profile?.id ?? null,
          is_recurring: recurring,
          recurrence: recurring ? "weekly" : null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      const { data: created, error: aErr } = await supabase
        .from("task_assignments")
        .insert(selected.map((member_id) => ({ task_id: task.id, member_id })))
        .select("id");
      if (aErr) throw new Error(aErr.message);

      const ids = (created ?? []).map((a) => a.id);
      const result = await send({ data: { assignment_ids: ids } });

      await qc.invalidateQueries();
      onOpenChange(false);

      toast.success(`Джейдишка отправлена: ${result.sent} чел.`);
      if (result.failed.length > 0) {
        toast.warning("Не подключены к Telegram", {
          description: result.failed.join(", "),
        });
      }
    } catch (e) {
      toast.error("Не удалось создать задачу", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> Новая джейдишка
          </DialogTitle>
          <DialogDescription>
            Задача уйдёт выбранным мемберам в личные сообщения Telegram.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Шаблон</Label>
            <Select value={templateId} onValueChange={applyTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Без шаблона" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blank">Без шаблона</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="t-title">Название</Label>
            <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="t-desc">Описание</Label>
            <Textarea
              id="t-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Команда</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isVp ? <SelectItem value="all">Весь MXP</SelectItem> : null}
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="t-date">Дедлайн (дата)</Label>
              <Input
                id="t-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-time">Время (Астана)</Label>
              <Input
                id="t-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Исполнители</Label>
            <div className="flex flex-wrap gap-2">
              {teams.map((t) => (
                <Button
                  key={t.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => selectTeam(t.id)}
                >
                  Вся {t.name}
                </Button>
              ))}
              {isVp ? (
                <Button type="button" size="sm" variant="outline" onClick={() => selectTeam(null)}>
                  Все MXP
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelected([])}>
                Очистить
              </Button>
            </div>
            <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {activeMembers.length === 0 ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">
                  Пока некому назначать: добавь мемберов на странице «Мемберы».
                </p>
              ) : (
                activeMembers.map((m) => {
                  const on = selected.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(m.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        on ? "bg-primary/10 text-primary" : "hover:bg-muted",
                      )}
                    >
                      <span>{m.full_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {m.telegram_chat_id ? "Telegram ✓" : "нет Telegram"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <p className="text-xs text-muted-foreground">Выбрано: {selected.length}</p>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Повторять еженедельно</p>
              <p className="text-xs text-muted-foreground">
                После дедлайна задача создастся заново на следующую неделю.
              </p>
            </div>
            <Switch checked={recurring} onCheckedChange={setRecurring} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Отправляем…" : "Создать и отправить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
