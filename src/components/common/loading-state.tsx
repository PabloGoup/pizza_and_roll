import { LoaderCircle } from "lucide-react";

export function LoadingState({ label = "Cargando información..." }: { label?: string }) {
  return (
    <div className="flex min-h-56 items-center justify-center gap-3 rounded-2xl border border-border/70 bg-card/90">
      <LoaderCircle className="size-5 animate-spin text-orange-500" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
