import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, CheckCircle2, Link2, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getBotStatus, setupWebhook } from "@/lib/telegram.functions";
import {
  POSITION_LABEL,
  initials,
  useMembers,
  useProfiles,
  useSettings,
  useStaffRoles,
  useTeams,
  type Profile,
} from "@/lib/queries";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Настройки · MXP Tasks" }] }),
  component: SettingsPage,
});

const PUBLIC_ORIGIN = "https://mxp-mate.lovable.app";

function SettingsPage() {
  const { isVp, profile } = useAuth();
  return (
    <AppShell title="Настройки">
      <div className="mx-auto max-w-4xl space-y-6">
        <BotCard isVp={isVp} />
        <StaffCard isVp={isVp} myId={profile?.id} />
      </div>
    </AppShell>
  );
}

function BotCard({ isVp }: { isVp: boolean }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getBotStatus);
  const hookFn = useServerFn(setupWebhook);
  const { data: settings } = useSettings();
  const [username, setUsername] = useState("");
  const [origin, setOrigin] = useState(PUBLIC_ORIGIN);
  const [busy, setBusy] = useState(false);

  useEffect(() => setUsername(settings?.["bot_username"] ?? ""), [settings]);
  useEffect(() => {
    const o = window.location.origin;
    if (!o.includes("id-preview") && !o.includes("localhost")) setOrigin(o);
  }, []);

  const status = useQuery({ queryKey: ["bot-status"], queryFn: () => statusFn(), retry: false });

  async function saveUsername() {
    const { error } = await supabase.from("app_settings").upsert({
      key: "bot_username",
      value: username.trim().replace(/^@/, ""),
      updated_at: new Date().toISOString(),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Сохранено");
    await qc.invalidateQueries({ queryKey: ["settings"] });
  }

  async function connect() {
    setBusy(true);
    try {
      const res = await hookFn({ data: { origin } });
      if (res.ok) toast.success("Webhook подключён", { description: res.url });
      else toast.error("Telegram отказал", { description: res.description ?? "" });
      await qc.invalidateQueries({ queryKey: ["settings"] });
      await status.refetch();
    } catch (e) {
      toast.error("Ошибка", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const s = status.data;
  const hookUrl = s && s.configured ? s.webhook?.url : "";

  return (
    <div className="card-soft p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Bot className="size-5" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Telegram-бот</p>
            <p className="text-sm text-muted-foreground">Рассылка джейдишек и кнопки статусов</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void status.refetch()}>
          <RefreshCw className={status.isFetching ? "size-4 animate-spin" : "size-4"} />
        </Button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatusTile
          ok={!!s?.configured}
          label="Токен"
          text={
            s?.configured ? "Добавлен" : status.isLoading ? "Проверяем…" : "Нет TELEGRAM_BOT_TOKEN"
          }
        />
        <StatusTile
          ok={!!(s?.configured && s.me)}
          label="Бот"
          text={
            s?.configured && s.me
              ? `@${s.me.username}`
              : s?.configured
                ? (s.error ?? "Ошибка")
                : "-"
          }
        />
        <StatusTile
          ok={!!hookUrl}
          label="Webhook"
          text={hookUrl ? "Подключён" : "Не подключён"}
          hint={s?.configured ? s.webhook?.last_error_message : undefined}
        />
      </div>

      {!s?.configured && !status.isLoading ? (
        <div className="mt-4 rounded-xl bg-warning/20 p-4 text-sm text-foreground">
          Создай бота в{" "}
          <a
            className="font-medium underline"
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
          >
            @BotFather
          </a>{" "}
          и добавь токен как секрет <code className="rounded bg-card px-1">TELEGRAM_BOT_TOKEN</code>{" "}
          в Lovable → Project Settings → Secrets.
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Username бота</Label>
          <div className="flex gap-2">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="mxp_astana_bot"
              disabled={!isVp}
            />
            <Button variant="outline" onClick={() => void saveUsername()} disabled={!isVp}>
              Сохранить
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Заполняется автоматически при подключении webhook.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Адрес приложения</Label>
          <div className="flex gap-2">
            <Input value={origin} onChange={(e) => setOrigin(e.target.value)} disabled={!isVp} />
            <Button onClick={() => void connect()} disabled={!isVp || busy || !s?.configured}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}{" "}
              Подключить
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Опубликованный адрес, не превью.</p>
        </div>
      </div>
      {hookUrl ? (
        <p className="mt-3 break-all text-xs text-muted-foreground">Текущий webhook: {hookUrl}</p>
      ) : null}
      {!isVp ? (
        <p className="mt-3 text-xs text-muted-foreground">Изменять настройки может только VP.</p>
      ) : null}
    </div>
  );
}

function StatusTile({
  ok,
  label,
  text,
  hint,
}: {
  ok: boolean;
  label: string;
  text: string;
  hint?: string | undefined;
}) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
        {ok ? (
          <CheckCircle2 className="size-4 text-success" />
        ) : (
          <XCircle className="size-4 text-muted-foreground" />
        )}
        <span className="truncate">{text}</span>
      </p>
      {hint ? <p className="mt-1 text-xs text-destructive">{hint}</p> : null}
    </div>
  );
}

function StaffCard({ isVp, myId }: { isVp: boolean; myId: string | undefined }) {
  const qc = useQueryClient();
  const { data: profiles = [] } = useProfiles();
  const { data: teams = [] } = useTeams();
  const { data: members = [] } = useMembers();
  const { data: roles = [] } = useStaffRoles();
  const approvedIds = new Set(roles.map((r) => r.user_id));

  async function revoke(p: Profile) {
    const { error } = await supabase.rpc("revoke_staff", { _user_id: p.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Доступ закрыт");
    await qc.invalidateQueries({ queryKey: ["user_roles"] });
  }

  async function setRole(p: Profile, role: Profile["role"], teamId: string | null) {
    const args: { _user_id: string; _role: Profile["role"]; _team_id?: string } = {
      _user_id: p.id,
      _role: role,
    };
    if (teamId) args._team_id = teamId;
    const { error } = await supabase.rpc("set_staff_role", args);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(approvedIds.has(p.id) ? "Роль обновлена" : "Доступ выдан");
    await qc.invalidateQueries({ queryKey: ["profiles"] });
    await qc.invalidateQueries({ queryKey: ["user_roles"] });
  }

  async function linkMember(p: Profile, memberId: string | null) {
    const { error } = await supabase
      .from("profiles")
      .update({ member_id: memberId })
      .eq("id", p.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Связь сохранена");
    await qc.invalidateQueries({ queryKey: ["profiles"] });
  }

  return (
    <div className="card-soft p-6">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-success/15 text-success">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Команда управления</p>
          <p className="text-sm text-muted-foreground">
            Коллеги регистрируются сами, а VP выдаёт им доступ и роль. Привяжи аккаунт к мемберу,
            тогда бот будет присылать уведомления «Нужна помощь» и о просрочках.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {profiles.map((p) => (
          <div
            key={p.id}
            className="flex flex-col gap-3 rounded-xl border border-border p-3 md:flex-row md:items-center"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {initials(p.full_name || "?")}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {p.full_name || "-"}
                  {p.id === myId ? " (ты)" : ""}
                </p>
                <p className="truncate text-xs text-muted-foreground">{p.email}</p>
              </div>
              {approvedIds.has(p.id) ? null : (
                <span className="shrink-0 rounded-full bg-warning/25 px-2.5 py-1 text-xs font-medium text-warning-foreground">
                  Ждёт доступа
                </span>
              )}
            </div>
            {isVp && p.id !== myId ? (
              approvedIds.has(p.id) ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => void revoke(p)}
                >
                  Закрыть доступ
                </Button>
              ) : (
                <Button size="sm" onClick={() => void setRole(p, p.role, p.team_id)}>
                  Выдать доступ
                </Button>
              )
            ) : null}
            <div className="grid grid-cols-3 gap-2 md:w-[520px]">
              <Select
                value={p.role}
                disabled={!isVp || p.id === myId}
                onValueChange={(v) => void setRole(p, v as Profile["role"], p.team_id)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["vp", "team_leader", "manager"] as const).map((r) => (
                    <SelectItem key={r} value={r}>
                      {POSITION_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={p.team_id ?? "none"}
                disabled={!isVp}
                onValueChange={(v) => void setRole(p, p.role, v === "none" ? null : v)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без команды</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={p.member_id ?? "none"}
                disabled={!isVp && p.id !== myId}
                onValueChange={(v) => void linkMember(p, v === "none" ? null : v)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Мембер" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не привязан</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
