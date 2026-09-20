import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { POSITION_LABEL } from "@/lib/queries";

export const Route = createFileRoute("/claim/$memberId")({
  head: () => ({
    meta: [
      { title: "Подтверждение позиции · MXP Tasks" },
      { name: "description", content: "Привязка аккаунта к своей позиции в MXP." },
    ],
  }),
  component: ClaimPage,
});

/** Ключ, по которому запоминаем ссылку, пока человек регистрируется. */
export const PENDING_CLAIM_KEY = "mxp_pending_claim";

type Preview = {
  full_name: string;
  position: string;
  team_name: string | null;
  already_claimed: boolean;
};

function ClaimPage() {
  const { memberId } = Route.useParams();
  const navigate = useNavigate();
  const { session, loading, refreshProfile } = useAuth();

  const [code] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("code") ?? ""),
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("member_claim_preview", {
      _member_id: memberId,
      _code: code,
    });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as Preview | undefined;
    if (!row) {
      setError("Не удалось прочитать ссылку");
      return;
    }
    setPreview(row);
  }, [memberId, code]);

  useEffect(() => {
    if (loading) return;

    if (!session) {
      try {
        window.localStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify({ memberId, code }));
      } catch {
        // приватный режим браузера, вернёмся сюда вручную
      }
      void navigate({ to: "/auth" });
      return;
    }

    try {
      window.localStorage.removeItem(PENDING_CLAIM_KEY);
    } catch {
      // не критично
    }
    void load();
  }, [loading, session, memberId, code, navigate, load]);

  async function confirm() {
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("claim_position", {
      _member_id: memberId,
      _code: code,
    });
    setBusy(false);
    if (rpcError) {
      toast.error("Не получилось", { description: rpcError.message });
      setError(rpcError.message);
      return;
    }
    setDone(true);
    await refreshProfile();
    toast.success("Доступ выдан");
    setTimeout(() => void navigate({ to: "/" }), 900);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground">
            MX
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">MXP Tasks</h1>
            <p className="text-sm text-muted-foreground">
              AIESEC LC Astana · Membership Experience
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {loading || (!preview && !error) ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-destructive/12 text-destructive">
                <XCircle className="size-7" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Ссылка не сработала</h2>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Попроси у VP свежую ссылку со страницы «Настройки».
              </p>
              <Button
                className="mt-5 w-full"
                variant="outline"
                onClick={() => navigate({ to: "/" })}
              >
                На главную
              </Button>
            </div>
          ) : done ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-success/15 text-success">
                <CheckCircle2 className="size-7" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Готово</h2>
              <p className="mt-2 text-sm text-muted-foreground">Открываю твой раздел.</p>
            </div>
          ) : preview?.already_claimed ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-warning/25 text-warning-foreground">
                <ShieldCheck className="size-7" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Позиция уже занята</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                К позиции «{preview.full_name}» уже привязан другой аккаунт. Если это ошибка, скажи
                VP, он отвяжет её в настройках.
              </p>
            </div>
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ShieldCheck className="size-7" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Это ты?</h2>
              <p className="mt-3 text-xl font-semibold text-foreground">{preview?.full_name}</p>
              <p className="text-sm text-muted-foreground">
                {POSITION_LABEL[preview?.position ?? ""] ?? preview?.position}
                {preview?.team_name ? ` · ${preview.team_name}` : ""}
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                Подтверди, и аккаунт получит доступ к сайту с правами этой позиции.
              </p>
              <Button className="mt-5 w-full" disabled={busy} onClick={() => void confirm()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null} Это я, подтвердить
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
