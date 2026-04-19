import { LogOut } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { AppLogo } from "@/components/common/app-logo";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { Button } from "@/components/ui/button";
import { getNavigationForRole } from "@/app/navigation";
import { useSignOut } from "@/features/auth/hooks/use-auth";
import { roleLabel } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

function NavigationTabs() {
  const currentUser = useAuthStore((state) => state.currentUser);

  if (!currentUser) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {getNavigationForRole(currentUser.role).map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex min-w-[148px] items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors",
                isActive
                  ? "border-foreground bg-foreground text-background shadow-sm"
                  : "border-border/70 bg-background text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )
            }
          >
            <Icon className="size-4" />
            <div className="min-w-0">
              <div className="font-medium">{item.label}</div>
              <div className="truncate text-xs opacity-80">{item.description}</div>
            </div>
          </NavLink>
        );
      })}
    </div>
  );
}

function UserBadge() {
  const currentUser = useAuthStore((state) => state.currentUser);

  if (!currentUser) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
      <p className="text-sm font-medium">{currentUser.fullName}</p>
      <p className="text-xs text-muted-foreground">{roleLabel(currentUser.role)}</p>
    </div>
  );
}

export function AppShell() {
  const currentUser = useAuthStore((state) => state.currentUser);
  const signOut = useSignOut();

  if (!currentUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.14),_transparent_32%),linear-gradient(180deg,_rgba(15,23,42,0.02),_transparent)]">
      <div className="mx-auto min-h-screen max-w-[1840px] px-4 py-4">
        <div className="flex min-h-[calc(100vh-2rem)] flex-col rounded-[28px] border border-border/70 bg-card/85 shadow-xl shadow-black/5 backdrop-blur">
          <header className="border-b border-border/70 px-4 py-4 md:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <AppLogo />
                  <div className="hidden md:block">
                    <p className="text-sm font-medium text-foreground">Operación en vivo</p>
                    <p className="text-xs text-muted-foreground">
                      Caja, ventas y administración centralizadas
                    </p>
                  </div>
                </div>
                <div className="xl:hidden">
                  <UserBadge />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="hidden xl:block">
                  <UserBadge />
                </div>
                <ThemeToggle />
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => signOut.mutate()}
                >
                  <LogOut className="size-4" />
                  Salir
                </Button>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto pb-1">
              <NavigationTabs />
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
