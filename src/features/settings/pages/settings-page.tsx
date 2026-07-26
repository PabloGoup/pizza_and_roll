import { FileBarChart, Printer } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { PageHeader } from "@/components/common/page-header";
import { cn } from "@/lib/utils";

const settingsSections = [
  {
    label: "Impresora",
    description: "Comandas, computadores y formato térmico",
    to: "/app/configuracion/impresion",
    icon: Printer,
  },
  {
    label: "Informe diario",
    description: "Destinatarios y envío del cierre",
    to: "/app/configuracion/informe-diario",
    icon: FileBarChart,
  },
] as const;

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración"
        description="Administra las preferencias generales, dispositivos e integraciones del sistema."
      />

      <nav
        aria-label="Secciones de configuración"
        className="flex gap-2 overflow-x-auto rounded-2xl border border-border/70 bg-muted/20 p-2"
      >
        {settingsSections.map((section) => {
          const Icon = section.icon;

          return (
            <NavLink
              key={section.to}
              to={section.to}
              className={({ isActive }) =>
                cn(
                  "flex min-w-max items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                  isActive
                    ? "border-foreground bg-foreground text-background shadow-sm"
                    : "border-transparent bg-background text-muted-foreground hover:border-border hover:text-foreground",
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              <span>
                <span className="block text-sm font-medium">{section.label}</span>
                <span className="hidden text-xs opacity-75 sm:block">
                  {section.description}
                </span>
              </span>
            </NavLink>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
