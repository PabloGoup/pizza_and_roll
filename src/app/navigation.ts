import {
  ClipboardList,
  LayoutDashboard,
  Receipt,
  ShieldCheck,
  ShoppingBasket,
  Users,
} from "lucide-react";

import type { ModuleKey, Role } from "@/types/domain";
import { canAccessModule } from "@/lib/auth";

export interface NavigationItem {
  label: string;
  description: string;
  to: string;
  module: ModuleKey;
  icon: typeof LayoutDashboard;
}

const navigationItems: NavigationItem[] = [
  {
    label: "Dashboard",
    description: "Resumen operativo",
    to: "/app",
    module: "dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Ventas",
    description: "POS y pedidos",
    to: "/app/ventas",
    module: "ventas",
    icon: ShoppingBasket,
  },
  {
    label: "Caja",
    description: "Apertura, retiros y cierre",
    to: "/app/caja",
    module: "caja",
    icon: Receipt,
  },
  {
    label: "Productos",
    description: "Catálogo y precios",
    to: "/app/productos",
    module: "productos",
    icon: ClipboardList,
  },
  {
    label: "Usuarios",
    description: "Perfiles y roles",
    to: "/app/usuarios",
    module: "usuarios",
    icon: Users,
  },
  {
    label: "Auditoría",
    description: "Historial y cambios",
    to: "/app/auditoria",
    module: "auditoria",
    icon: ShieldCheck,
  },
];

export function getNavigationForRole(role: Role) {
  return navigationItems.filter((item) => canAccessModule(role, item.module));
}
