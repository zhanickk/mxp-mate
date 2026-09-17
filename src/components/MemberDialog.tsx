import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Member } from "@/lib/queries";
import { POSITION_LABEL, useTeams } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Position = Member["position"];

export function MemberDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member?: Member | null | undefined;
}) {
  const qc = useQueryClient();
  const { data: teams = [] } = useTeams();
  const [fullName, setFullName] = useState("");
  const [teamId, setTeamId] = useState("none");
  const [position, setPosition] = useState<Position>("member");
  const [username, setUsername] = useState("");
  const [birthday, setBirthday] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFullName(member?.full_name ?? "");
    setTeamId(member?.team_id ?? "none");
    setPosition(member?.position ?? "member");
    setUsername(member?.telegram_username ?? "");
    setBirthday(member?.birthday ?? "");
    setActive(member?.is_active ?? true);
  }, [open, member]);

  async function save() {
    if (!fullName.trim()) {
      toast.error("Введите имя");
      return;
    }
    setBusy(true);
    const payload = {
      full_name: fullName.trim(),
      team_id: teamId === "none" ? null : teamId,
      position,
      telegram_username: username.trim().replace(/^@/, "") || null,
      birthday: birthday || null,
      is_active: active,
    };
    const { error } = member
      ? await supabase.from("members").update(payload).eq("id", member.id)
      : await supabase.from("members").insert(payload);
    setBusy(false);
    if (error) {
      toast.error("Не удалось сохранить", { description: error.message });
      return;
    }
    toast.success(member ? "Мембер обновлён" : "Мембер добавлен");
    await qc.invalidateQueries({ queryKey: ["members"] });
    onOpenChange(false);
  }

  async function unlinkTelegram() {
    if (!member) return;
    const { error } = await supabase
      .from("members")
      .update({ telegram_chat_id: null })
      .eq("id", member.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Telegram отвязан");
      await qc.invalidateQueries({ queryKey: ["members"] });
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{member ? "Редактировать мембера" : "Новый мембер"}</DialogTitle>
          <DialogDescription>
            После сохранения скопируй личную ссылку и отправь её мемберу.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Имя и фамилия</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Айгерим Серикова"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Команда</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger>
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
            </div>
            <div className="space-y-2">
              <Label>Позиция</Label>
              <Select value={position} onValueChange={(v) => setPosition(v as Position)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(POSITION_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Telegram username</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="@username"
              />
            </div>
            <div className="space-y-2">
              <Label>День рождения</Label>
              <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Активный</p>
              <p className="text-xs text-muted-foreground">Неактивным задачи не назначаются</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {member?.telegram_chat_id ? (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={() => void unlinkTelegram()}
            >
              Отвязать Telegram
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Сохраняем…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
