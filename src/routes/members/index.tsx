import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Copy, Pencil, Plus, QrCode, Search, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { MemberDialog } from "@/components/MemberDialog";
import { InviteDialog, copyInvite } from "@/components/InviteDialog";
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
import {
  POSITION_LABEL,
  initials,
  useAssignments,
  useMembers,
  useSettings,
  useTeams,
  type Member,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/members/")({
  head: () => ({ meta: [{ title: "Мемберы — MXP Tasks" }] }),
  component: MembersPage,
});

function MembersPage() {
  const { data: members = [], isLoading } = useMembers();
  const { data: teams = [] } = useTeams();
  const { data: assignments = [] } = useAssignments();
  const { data: settings } = useSettings();
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("all");
  const [tg, setTg] = useState("all");
  const [editing, setEditing] = useState<Member | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [invite, setInvite] = useState<Member | null>(null);

  const rate = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const a of assignments) {
      const e = map.get(a.member_id) ?? { done: 0, total: 0 };
      e.total += 1;
      if (a.status === "done") e.done += 1;
      map.set(a.member_id, e);
    }
    return map;
  }, [assignments]);

  const filtered = members.filter((m) => {
    if (q && !`${m.full_name} ${m.telegram_username ?? ""}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    if (team !== "all" && (team === "none" ? m.team_id !== null : m.team_id !== team)) return false;
    if (tg === "yes" && !m.telegram_chat_id) return false;
    if (tg === "no" && m.telegram_chat_id) return false;
    return true;
  });

  const connected = members.filter((m) => m.telegram_chat_id).length;
  const teamOf = (id: string | null) => teams.find((t) => t.id === id);

  return (
    <AppShell title="Мемберы">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Поиск"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={team} onValueChange={setTeam}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все команды</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
            <SelectItem value="none">Без команды</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tg} onValueChange={setTg}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Любой Telegram</SelectItem>
            <SelectItem value="yes">Подключён</SelectItem>
            <SelectItem value="no">Не подключён</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="size-4" /> Добавить
        </Button>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Всего {members.length} · Telegram подключён у {connected}
      </p>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={members.length === 0 ? "Добавь первых мемберов" : "Никого не нашли"}
          description={
            members.length === 0
              ? "Потом отправь каждому личную ссылку на бота."
              : "Измени фильтры."
          }
          action={
            members.length === 0 ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="size-4" /> Добавить мембера
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((m) => {
            const r = rate.get(m.id);
            const pct = r?.total ? Math.round((r.done / r.total) * 100) : null;
            const t = teamOf(m.team_id);
            return (
              <div key={m.id} className={cn("card-interactive p-4", !m.is_active && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <Link
                    to="/members/$memberId"
                    params={{ memberId: m.id }}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ background: t?.color ?? "#037EF3" }}
                    >
                      {initials(m.full_name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{m.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {POSITION_LABEL[m.position]} · {t?.name ?? "Без команды"}
                      </p>
                    </div>
                  </Link>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditing(m);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                      m.telegram_chat_id
                        ? "bg-success/15 text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    {m.telegram_chat_id ? "Подключён" : "Не подключён"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {pct === null ? "Нет задач" : `Выполнение ${pct}% (${r!.done}/${r!.total})`}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => void copyInvite(settings?.["bot_username"], m)}
                  >
                    <Copy className="size-3.5" /> Скопировать ссылку
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setInvite(m)}>
                    <QrCode className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <MemberDialog open={dialogOpen} onOpenChange={setDialogOpen} member={editing} />
      <InviteDialog member={invite} onOpenChange={(v) => !v && setInvite(null)} />
    </AppShell>
  );
}
