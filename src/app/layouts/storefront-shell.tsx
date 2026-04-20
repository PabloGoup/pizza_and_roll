import { ArrowRight, LogIn, MapPin, ShoppingBag, TimerReset } from "lucide-react";
import { Link, Outlet } from "react-router-dom";

import { AppLogo } from "@/components/common/app-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function StorefrontShell() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.18),_transparent_28%),linear-gradient(180deg,_rgba(15,23,42,0.02),_transparent)]">
      <header className="border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1540px] items-center justify-between gap-4 px-4 py-4 md:px-6">
          <AppLogo />

          <div className="flex items-center gap-2">
            <Link
              to="/app"
              className={cn(buttonVariants({ variant: "ghost" }), "rounded-full")}
            >
              <LogIn className="size-4" />
              Backoffice
            </Link>
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="border-t border-border/70 bg-background/80">
        <div className="mx-auto grid max-w-[1540px] gap-6 px-4 py-8 text-sm text-muted-foreground md:grid-cols-3 md:px-6">
          <div className="space-y-2">
            <p className="font-medium text-foreground">Poke & Roll online</p>
            <p>
              La tienda pública vivirá en este mismo proyecto para que catálogo, pedidos,
              tiempos y estado del pedido queden sincronizados con el POS.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="size-4" />
              <span>Mismo catálogo que usa caja</span>
            </div>
            <div className="flex items-center gap-2">
              <TimerReset className="size-4" />
              <span>Tiempos estimados conectados a la operación</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="size-4" />
              <span>Despachos y retiros desde el mismo flujo</span>
            </div>
          </div>

          <div className="flex items-start md:justify-end">
            <Link
              to="/app/ventas"
              className={cn(buttonVariants({ variant: "default" }), "rounded-full")}
            >
              Ir al POS
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
