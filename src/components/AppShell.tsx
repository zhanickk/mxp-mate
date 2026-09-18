import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ListChecks,
  Users,
  UsersRound,
  FileText,
  Settings,
  LogOut,
  Loader2,
  Hourglass,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/queries";
import { Button } from "@/components/ui/button";

const NAV_ALL = [
  { to: "/", label: "Дашборд", icon: LayoutDashboard },
  { to: "/tasks", label: "Задачи", icon: ListChecks },
  { to: "/members", label: "Мемберы", icon: Users },
  { to: "/teams", label: "Команды", icon: UsersRound },
  { to: "/templates", label: "Шаблоны", icon: FileText },
  { to: "/settings", label: "Настройки", icon: Settings },
] as const;

const VP_ONLY = new Set(["/settings"]);

const ROLE_LABEL: Record<string, string> = {
  vp: "VP MXP",
  team_leader: "Team Leader",
  manager: "Manager",
};

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const { loading, session, profile, approved, isVp, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!approved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="card-soft w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-warning/25 text-warning-foreground">
            <Hourglass className="size-7" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Ждём подтверждения</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Аккаунт {profile?.email ?? ""} создан. VP MXP должен выдать тебе роль в разделе
            «Настройки», после этого обнови страницу.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Обновить
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                void signOut().then(() => navigate({ to: "/auth" }));
              }}
            >
              <LogOut className="size-4" /> Выйти
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const NAV = NAV_ALL.filter((item) => isVp || !VP_ONLY.has(item.to));

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card px-4 py-6 md:flex">
        <div className="flex items-center gap-2 px-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
            MX
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-foreground">MXP Tasks</p>
            <p className="text-xs text-muted-foreground">AIESEC LC Astana</p>
          </div>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive(item.to)
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="size-4.5" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-4 rounded-2xl bg-muted/60 p-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {initials(profile?.full_name ?? "MXP")}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {profile?.full_name ?? "-"}
              </p>
              <p className="text-xs text-muted-foreground">
                {ROLE_LABEL[profile?.role ?? ""] ?? "-"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start text-muted-foreground"
            onClick={() => {
              void signOut().then(() => navigate({ to: "/auth" }));
            }}
          >
            <LogOut className="size-4" /> Выйти
          </Button>
        </div>
      </aside>

      <main className="pb-24 md:pb-10 md:pl-64">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 px-4 py-4 backdrop-blur md:px-8">
          <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            {title}
          </h1>
        </header>
        <div className="px-4 py-6 md:px-8">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/95 backdrop-blur md:hidden">
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
              isActive(item.to) ? "text-primary" : "text-muted-foreground",
            )}
          >
            <item.icon className="size-5" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
