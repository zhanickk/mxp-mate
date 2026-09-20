import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { NewTaskDialog, type TaskDraft } from "@/components/NewTaskDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
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
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, useTeams, useTemplates, type Template } from "@/lib/queries";

export const Route = createFileRoute("/templates")({
  head: () => ({ meta: [{ title: "Шаблоны · MXP Tasks" }] }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const qc = useQueryClient();
  const { data: templates = [], isLoading } = useTemplates();
  const { data: teams = [] } = useTeams();
  const [editing, setEditing] = useState<Template | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TaskDraft | undefined>(undefined);
  const [taskOpen, setTaskOpen] = useState(false);

  async function remove(t: Template) {
    const { error } = await supabase.from("task_templates").delete().eq("id", t.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Шаблон удалён");
      await qc.invalidateQueries({ queryKey: ["templates"] });
    }
  }

  const groups = [
    ...teams.map((t) => ({ id: t.id as string | null, name: t.name, color: t.color })),
    { id: null, name: "Общие", color: "#0A2540" },
  ];

  return (
    <AppShell title="Шаблоны">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Повторяющиеся джейдишки: создаются в пару кликов.
        </p>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Новый шаблон
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Шаблонов нет"
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Создать
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => {
            const items = templates.filter((t) => t.team_id === g.id);
            if (items.length === 0) return null;
            return (
              <section key={g.name}>
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="size-2.5 rounded-full" style={{ background: g.color }} />{" "}
                  {g.name}
                </p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((t) => (
                    <div key={t.id} className="card-interactive flex flex-col p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-foreground">{t.title}</p>
                        {t.category ? (
                          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {t.category}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted-foreground">
                        {t.description}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Дедлайн: +{t.default_deadline_days} дн.
                        </span>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Создать задачу"
                            onClick={() => {
                              setDraft({
                                title: t.title,
                                description: t.description ?? "",
                                category: t.category ?? "Другое",
                                deadlineIso: new Date(
                                  Date.now() + t.default_deadline_days * 86_400_000,
                                ).toISOString(),
                                checklist: t.checklist ?? [],
                              });
                              setTaskOpen(true);
                            }}
                          >
                            <Send className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditing(t);
                              setOpen(true);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => void remove(t)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <TemplateDialog open={open} onOpenChange={setOpen} template={editing} teams={teams} />
      <NewTaskDialog open={taskOpen} onOpenChange={setTaskOpen} draft={draft} />
    </AppShell>
  );
}

function TemplateDialog({
  open,
  onOpenChange,
  template,
  teams,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: Template | null;
  teams: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Другое");
  const [teamId, setTeamId] = useState("none");
  const [days, setDays] = useState(7);
  const [checklist, setChecklist] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setTitle(template?.title ?? "");
    setDescription(template?.description ?? "");
    setCategory(template?.category ?? "Другое");
    setTeamId(template?.team_id ?? "none");
    setDays(template?.default_deadline_days ?? 7);
    setChecklist(template?.checklist ?? []);
  }, [open, template]);

  async function save() {
    if (!title.trim()) {
      toast.error("Введите название");
      return;
    }
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      category,
      team_id: teamId === "none" ? null : teamId,
      default_deadline_days: Math.max(0, days),
      checklist: checklist.map((c) => c.trim()).filter(Boolean),
    };
    const { error } = template
      ? await supabase.from("task_templates").update(payload).eq("id", template.id)
      : await supabase.from("task_templates").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Шаблон сохранён");
    await qc.invalidateQueries({ queryKey: ["templates"] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{template ? "Редактировать шаблон" : "Новый шаблон"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Описание</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Этапы</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setChecklist((prev) => [...prev, ""])}
              >
                <Plus className="size-4" /> Добавить
              </Button>
            </div>
            {checklist.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Этапы попадут в каждую задачу из этого шаблона, и мембер будет отмечать их в боте.
              </p>
            ) : (
              <div className="space-y-2">
                {checklist.map((step, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={step}
                      placeholder={`Этап ${i + 1}`}
                      onChange={(e) =>
                        setChecklist((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                      }
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setChecklist((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
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
                  <SelectItem value="none">Общий</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Дней на задачу</Label>
              <Input
                type="number"
                min={0}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={() => void save()}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
