import { format } from "date-fns";
import { es } from "date-fns/locale";

import type { CashMovementType, OrderStatus, OrderType, PaymentMethod, Role } from "@/types/domain";

const currencyFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function formatDateTime(value: string) {
  return format(new Date(value), "dd MMM yyyy, HH:mm", { locale: es });
}

export function formatDate(value: string) {
  return format(new Date(value), "dd MMM yyyy", { locale: es });
}

export function formatShortTime(value: string) {
  return format(new Date(value), "HH:mm", { locale: es });
}

export function roleLabel(role: Role) {
  return role === "administrador" ? "Administrador" : "Cajero";
}

export function orderTypeLabel(type: OrderType) {
  switch (type) {
    case "consumo_local":
      return "Consumo en local";
    case "retiro_local":
      return "Retiro en local";
    case "despacho":
      return "Despacho";
  }
}

export function paymentMethodLabel(method: PaymentMethod) {
  switch (method) {
    case "efectivo":
      return "Efectivo";
    case "tarjeta":
      return "Tarjeta";
    case "transferencia":
      return "Transferencia";
    case "mixto":
      return "Pago mixto";
  }
}

export function orderStatusLabel(status: OrderStatus) {
  switch (status) {
    case "pendiente":
      return "En preparación";
    case "en_preparacion":
      return "En preparación";
    case "listo":
      return "Terminado";
    case "entregado":
      return "Entregado";
    case "cancelado":
      return "Cancelado";
  }
}

export function cashMovementLabel(type: CashMovementType) {
  switch (type) {
    case "apertura":
      return "Apertura";
    case "ingreso":
      return "Ingreso";
    case "retiro":
      return "Retiro";
    case "anulacion":
      return "Anulación";
    case "diferencia":
      return "Diferencia";
    case "cierre":
      return "Cierre";
  }
}

export function percentage(value: number, total: number) {
  if (!total) {
    return "0%";
  }

  return `${Math.round((value / total) * 100)}%`;
}
