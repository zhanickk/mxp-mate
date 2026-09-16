import { cn } from "@/lib/utils";

export const STATUS_LABEL: Record<string, string> = {
  sent: "Отправлено",
  accepted: "Принято",
  done: "Выполнено",
  help_needed: "Нужна помощь",
  overdue: "Просрочено",
  not_delivered: "Не доставлено",
};

const STATUS_CLASS: Record<string, string> = {
  sent: "bg-muted text-muted-foreground",
  accepted: "bg-primary/10 text-primary",
  done: "bg-success/15 text-success",
  help_needed: "bg-warning/25 text-warning-foreground",
  overdue: "bg-destructive/12 text-destructive",
  not_delivered: "bg-secondary text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        STATUS_CLASS[status] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
