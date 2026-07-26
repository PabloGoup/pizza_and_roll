import type { ModuleKey, Role } from "@/types/domain";

const adminOnlyModules: ModuleKey[] = [
  "productos",
  "usuarios",
  "auditoria",
  "configuracion",
  "impresion",
];

export function canAccessModule(role: Role, module: ModuleKey) {
  if (role === "cliente" || role === "cocina") {
    return false;
  }

  if (role === "administrador") {
    return true;
  }

  return !adminOnlyModules.includes(module);
}

export function isAdmin(role: Role) {
  return role === "administrador";
}

/** Staff de ventas: puede acceder al POS, caja y administración. */
export function isStaffRole(role: Role) {
  return role === "administrador" || role === "cajero";
}

/** Personal de cocina: solo accede a /cocina. */
export function isKitchenRole(role: Role) {
  return role === "cocina";
}
