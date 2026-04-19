import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral" | "info";
}) {
  const toneClassName = {
    success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    danger: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    neutral: "bg-muted text-muted-foreground",
    info: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  }[tone];

  return (
    <Badge className={cn("rounded-full border-0 px-3 py-1 font-medium", toneClassName)}>
      {label}
    </Badge>
  );
}
