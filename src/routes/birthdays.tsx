import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CakeSlice, Gift, Music, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NewTaskDialog, type TaskDraft } from "@/components/NewTaskDialog";
import { initials, useLcPeople, useTemplates, type LcPerson } from "@/lib/queries";
import { daysUntilBirthday } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/birthdays")({
  head: () => ({
    meta: [
      { title: "Дни рождения · MXP Tasks" },
      { name: "description", content: "Ближайшие дни рождения LC Astana." },
    ],
  }),
  component: BirthdaysPage,
});

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

function birthdayLabel(birthday: string | null): string {
  if (!birthday) return "-";
  const [, m, d] = birthday.split("-").map(Number);
  if (!m || !d) return "-";
  return `${d} ${MONTHS[m - 1] ?? ""}`;
}

function whenLabel(days: number): string {
  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  if (days < 7) return `через ${days} дн.`;
  if (days < 31) return `через ${days} дн.`;
  return `через ${Math.round(days / 30)} мес.`;
}

function BirthdaysPage() {
  const { data: people = [], isLoading } = useLcPeople();
  const { data: templates = [] } = useTemplates();
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("all");
  const [taskOpen, setTaskOpen] = useState(false);
  const [draft, setDraft] = useState<TaskDraft | undefined>(undefined);

  const departments = useMemo(
    () => [...new Set(people.map((p) => p.department).filter(Boolean))].sort() as string[],
    [people],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people
      .filter((p) => p.is_active)
      .filter((p) => (dept === "all" ? true : p.department === dept))
      .filter((p) =>
        q
          ? p.full_name.toLowerCase().includes(q) ||
            (p.instagram ?? "").toLowerCase().includes(q) ||
            (p.music_app ?? "").toLowerCase().includes(q)
          : true,
      )
      .map((p) => ({ person: p, days: p.birthday ? daysUntilBirthday(p.birthday) : 9999 }))
      .sort((a, b) => a.days - b.days);
  }, [people, search, dept]);

  const videoTemplate = templates.find((t) => t.title === "Сделать видео-поздравление");

  function startCongrats(person: LcPerson) {
    const facts = [
      person.music_app ? `Музыку слушает в ${person.music_app}, плейлист собираем там же.` : null,
      person.instagram ? `Instagram: @${person.instagram}.` : null,
      person.department ? `Департамент: ${person.department}.` : null,
    ].filter(Boolean);

    setDraft({
      title: `Видео-поздравление: ${person.full_name}`,
      description: [videoTemplate?.description ?? "", ...facts].filter(Boolean).join("\n\n"),
      category: "Дни рождения",
      checklist: videoTemplate?.checklist ?? [],
      birthdayPersonId: person.id,
      deadlineIso: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    setTaskOpen(true);
  }

  return (
    <AppShell title="Дни рождения">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Имя, инстаграм или музыкальный сервис"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все департаменты</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CakeSlice}
          title="Никого не нашлось"
          description="Попробуй другой запрос или департамент."
        />
      ) : (
        <div className="space-y-2">
          {rows.map(({ person, days }) => (
            <div
              key={person.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  days <= 7 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {initials(person.full_name)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{person.full_name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {[person.department, person.position].filter(Boolean).join(" · ")}
                </p>
                {person.note ? (
                  <p className="mt-0.5 text-xs text-warning-foreground">{person.note}</p>
                ) : null}
              </div>

              <div className="text-right">
                <p className="text-sm font-medium text-foreground">
                  {birthdayLabel(person.birthday)}
                </p>
                <p
                  className={cn(
                    "text-xs",
                    days <= 7 ? "font-medium text-primary" : "text-muted-foreground",
                  )}
                >
                  {whenLabel(days)}
                </p>
              </div>

              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                {person.music_app ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    <Music className="size-3.5" /> {person.music_app}
                  </span>
                ) : null}
                {person.instagram ? (
                  <a
                    href={`https://instagram.com/${person.instagram}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    @{person.instagram}
                  </a>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => startCongrats(person)}>
                  <Gift className="size-4" /> Поздравление
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewTaskDialog open={taskOpen} onOpenChange={setTaskOpen} draft={draft} />
    </AppShell>
  );
}
