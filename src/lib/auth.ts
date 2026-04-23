import type { ModuleKey, Role } from "@/types/domain";

const adminOnlyModules: ModuleKey[] = ["productos", "usuarios", "auditoria"];

export function canAccessModule(role: Role, module: ModuleKey) {
  if (role === "cliente") {
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

export function isStaffRole(role: Role) {
  return role === "administrador" || role === "cajero";
}
