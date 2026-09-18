import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { Member } from "@/lib/queries";
import { botLink, useSettings } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export async function copyInvite(botUsername: string | undefined, member: Member) {
  const link = botLink(botUsername, member.invite_code);
  if (!link) {
    toast.error("Сначала укажи username бота в Настройках");
    return false;
  }
  try {
    await navigator.clipboard.writeText(link);
    toast.success("Ссылка скопирована", { description: link });
  } catch {
    toast.message(link);
  }
  return true;
}

export function InviteDialog({
  member,
  onOpenChange,
}: {
  member: Member | null;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: settings } = useSettings();
  const link = member ? botLink(settings?.["bot_username"], member.invite_code) : "";
  const [qr, setQr] = useState("");

  useEffect(() => {
    if (!link) {
      setQr("");
      return;
    }
    void QRCode.toDataURL(link, {
      width: 320,
      margin: 1,
      color: { dark: "#0A2540", light: "#FFFFFF" },
    }).then(setQr);
  }, [link]);

  return (
    <Dialog open={!!member} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Приглашение в бота</DialogTitle>
          <DialogDescription>
            {member?.full_name}: открой ссылку или отсканируй QR и нажми Start.
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="space-y-4">
            {qr ? (
              <img src={qr} alt="QR" className="mx-auto size-56 rounded-xl border border-border" />
            ) : (
              <div className="mx-auto size-56 animate-pulse rounded-xl bg-muted" />
            )}
            <div className="flex gap-2">
              <Input readOnly value={link} className="text-xs" />
              <Button
                size="icon"
                variant="outline"
                onClick={() => member && void copyInvite(settings?.["bot_username"], member)}
              >
                <Copy className="size-4" />
              </Button>
              <Button size="icon" variant="outline" asChild>
                <a href={link} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Username бота ещё не указан. Зайди в{" "}
            <Link to="/settings" className="text-primary underline">
              Настройки
            </Link>{" "}
            и подключи бота.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
