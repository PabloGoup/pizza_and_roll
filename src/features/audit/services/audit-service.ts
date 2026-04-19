import { parseCashMovementReason } from "@/lib/cash-payments";
import {
  cashPaymentCategoryLabel,
  formatCurrency,
  orderTypeLabel,
  paymentMethodLabel,
} from "@/lib/format";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatSupabaseError } from "@/lib/supabase/errors";
import type { AuditEvent, DailySalesAuditSummary, Order } from "@/types/domain";

type AuditLogRow = {
  id: string;
  module: string;
  action: string;
  detail: string;
  performed_by: string | null;
  previous_value: unknown;
  new_value: unknown;
  reason: string | null;
  created_at: string;
  profiles?: { full_name?: string } | null;
};

type OrderAuditRow = {
  id: string;
  number: string;
  type: Order["type"];
  status: Order["status"];
  payment_method: Order["paymentMethod"];
  total: number;
  created_at: string;
  order_payments?: Array<{
    method: Exclude<Order["paymentMethod"], "mixto">;
    amount: number;
  }> | null;
  order_items?: Array<{
    quantity: number;
    subtotal: number;
    products?: { name?: string } | null;
  }> | null;
};

type CashMovementAuditRow = {
  id: string;
  type: "apertura" | "ingreso" | "retiro" | "anulacion" | "diferencia" | "cierre";
  amount: number;
  reason: string;
  created_at: string;
};

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: Record<string, unknown> | null, key: string) {
  const candidate = value?.[key];
  return typeof candidate === "string" ? candidate : null;
}

function readNumber(value: Record<string, unknown> | null, key: string) {
  const candidate = value?.[key];
  return typeof candidate === "number" ? candidate : null;
}

function pushCurrencyHighlight(
  target: AuditEvent["highlights"],
  label: string,
  amount: number | null | undefined,
) {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return;
  }

  target.push({
    label,
    value: formatCurrency(amount),
  });
}

function buildAuditHighlights(row: AuditLogRow): AuditEvent["highlights"] {
  const nextValue = asRecord(row.new_value);
  const previousValue = asRecord(row.previous_value);
  const highlights: AuditEvent["highlights"] = [];

  if (row.module === "caja") {
    if (row.action === "apertura") {
      pushCurrencyHighlight(highlights, "Fondo inicial", readNumber(nextValue, "openingAmount"));
      pushCurrencyHighlight(highlights, "Esperado", readNumber(nextValue, "expectedAmount"));
      return highlights;
    }

    if (row.action === "cierre") {
      pushCurrencyHighlight(highlights, "Esperado", readNumber(nextValue, "expectedAmount"));
      pushCurrencyHighlight(highlights, "Contado", readNumber(nextValue, "countedAmount"));
      pushCurrencyHighlight(highlights, "Diferencia", readNumber(nextValue, "differenceAmount"));
      pushCurrencyHighlight(
        highlights,
        "Tarjeta contada",
        readNumber(nextValue, "countedCardAmount"),
      );
      pushCurrencyHighlight(
        highlights,
        "Transfer contada",
        readNumber(nextValue, "countedTransferAmount"),
      );
      return highlights;
    }

    const movementAmount = readNumber(nextValue, "amount");
    if (movementAmount !== null) {
      pushCurrencyHighlight(highlights, "Monto", movementAmount);
    }

    const paymentCategory = readString(nextValue, "paymentCategory");
    if (paymentCategory) {
      highlights.push({
        label: "Categoría",
        value: cashPaymentCategoryLabel(paymentCategory as never),
      });
    }

    const movementReason = readString(nextValue, "reason");
    if (movementReason) {
      highlights.push({
        label: "Motivo",
        value: movementReason,
      });
    }

    return highlights;
  }

  if (row.module === "ventas") {
    const total = readNumber(nextValue, "total") ?? readNumber(previousValue, "total");
    const paymentMethod =
      readString(nextValue, "paymentMethod") ?? readString(previousValue, "paymentMethod");
    const orderType = readString(nextValue, "type") ?? readString(previousValue, "type");
    const orderNumber = readString(nextValue, "number") ?? readString(previousValue, "number");

    if (orderNumber) {
      highlights.push({
        label: "Venta",
        value: orderNumber,
      });
    }

    pushCurrencyHighlight(highlights, "Total", total);

    if (paymentMethod) {
      highlights.push({
        label: "Pago",
        value: paymentMethodLabel(paymentMethod as never),
      });
    }

    if (orderType) {
      highlights.push({
        label: "Tipo",
        value: orderTypeLabel(orderType as never),
      });
    }

    const previousPaymentMethod = readString(previousValue, "paymentMethod");
    const nextPaymentMethod = readString(nextValue, "paymentMethod");

    if (
      row.action === "actualizar_pago" &&
      previousPaymentMethod &&
      nextPaymentMethod &&
      previousPaymentMethod !== nextPaymentMethod
    ) {
      highlights.push({
        label: "Cambio",
        value: `${paymentMethodLabel(previousPaymentMethod as never)} -> ${paymentMethodLabel(nextPaymentMethod as never)}`,
      });
    }
  }

  return highlights;
}

function buildPaymentBreakdown(
  payments: OrderAuditRow["order_payments"],
  paymentMethod: Order["paymentMethod"],
  total: number,
) {
  const bucket = {
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
  };

  if (payments?.length) {
    for (const payment of payments) {
      bucket[payment.method] += Number(payment.amount);
    }

    return bucket;
  }

  if (paymentMethod !== "mixto") {
    bucket[paymentMethod] = Number(total);
  }

  return bucket;
}

export const auditService = {
  async listAuditEvents() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*, profiles!performed_by(full_name)")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(formatSupabaseError("No se pudo cargar la auditoría.", error));
    }

    return (data as AuditLogRow[]).map((row) => ({
      id: row.id,
      module: row.module as
        | "dashboard"
        | "ventas"
        | "caja"
        | "productos"
        | "usuarios"
        | "auditoria",
      action: row.action,
      detail: row.detail,
      performedById: row.performed_by ?? "",
      performedByName: row.profiles?.full_name ?? "Sistema",
      previousValue: row.previous_value ? JSON.stringify(row.previous_value) : null,
      newValue: row.new_value ? JSON.stringify(row.new_value) : null,
      reason: row.reason,
      highlights: buildAuditHighlights(row),
      createdAt: row.created_at,
    }));
  },

  async listDailySalesSummaries() {
    const supabase = getSupabaseClient();

    const { data, error: ordersError } = await supabase
      .from("orders")
      .select(
        "id, number, type, status, payment_method, total, created_at, order_payments(method, amount), order_items(quantity, subtotal, products(name))",
      )
      .order("created_at", { ascending: false });

    const ordersData = data as OrderAuditRow[] | null;

    if (ordersError) {
      throw new Error(formatSupabaseError("No se pudo cargar la auditoría de ventas.", ordersError));
    }

    const { data: movementsData, error: movementsError } = await supabase
      .from("cash_movements")
      .select("id, type, amount, reason, created_at")
      .order("created_at", { ascending: false });

    if (movementsError) {
      throw new Error(
        formatSupabaseError("No se pudo cargar la auditoría de movimientos de caja.", movementsError),
      );
    }

    const summaries = new Map<string, DailySalesAuditSummary>();

    const getSummary = (dateKey: string) => {
      const existing = summaries.get(dateKey);
      if (existing) {
        return existing;
      }

      const created: DailySalesAuditSummary = {
        dateKey,
        activityCount: 0,
        ordersCount: 0,
        totalSales: 0,
        cashSales: 0,
        cardSales: 0,
        transferSales: 0,
        productsSold: 0,
        topProducts: [],
        withdrawalsCount: 0,
        withdrawalsTotal: 0,
        expensesTotal: 0,
        advancesTotal: 0,
        salaryPaymentsTotal: 0,
        otherWithdrawalsTotal: 0,
        dispatchCount: 0,
        dispatchSales: 0,
        deliveryFeesTotal: 0,
        allOrderDetails: [],
        cashOrderDetails: [],
        cardOrderDetails: [],
        transferOrderDetails: [],
        dispatchOrderDetails: [],
        withdrawalDetails: [],
        expenseDetails: [],
        advanceDetails: [],
        salaryPaymentDetails: [],
        otherWithdrawalDetails: [],
      };

      summaries.set(dateKey, created);
      return created;
    };

    const productsByDate = new Map<string, Map<string, { quantity: number; revenue: number }>>();

    for (const order of ordersData ?? []) {
      if (order.status === "cancelado") {
        continue;
      }

      const dateKey = order.created_at.slice(0, 10);
      const summary = getSummary(dateKey);
      summary.ordersCount += 1;
      summary.totalSales += Number(order.total);

      const breakdown = buildPaymentBreakdown(
        order.order_payments,
        order.payment_method,
        Number(order.total),
      );
      const productNames = Array.from(
        new Set(
          (order.order_items ?? [])
            .map((item) => item.products?.name?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      );
      const itemsCount = (order.order_items ?? []).reduce(
        (acc, item) => acc + Number(item.quantity),
        0,
      );

      summary.allOrderDetails.push({
        id: order.id,
        number: order.number,
        type: order.type,
        paymentMethod: order.payment_method,
        status: order.status,
        amount: Number(order.total),
        totalOrderAmount: Number(order.total),
        createdAt: order.created_at,
        itemsCount,
        products: productNames,
      });

      if (breakdown.efectivo > 0) {
        summary.cashOrderDetails.push({
          id: order.id,
          number: order.number,
          type: order.type,
          paymentMethod: order.payment_method,
          status: order.status,
          amount: breakdown.efectivo,
          totalOrderAmount: Number(order.total),
          createdAt: order.created_at,
          itemsCount,
          products: productNames,
        });
      }

      if (breakdown.tarjeta > 0) {
        summary.cardOrderDetails.push({
          id: order.id,
          number: order.number,
          type: order.type,
          paymentMethod: order.payment_method,
          status: order.status,
          amount: breakdown.tarjeta,
          totalOrderAmount: Number(order.total),
          createdAt: order.created_at,
          itemsCount,
          products: productNames,
        });
      }

      if (breakdown.transferencia > 0) {
        summary.transferOrderDetails.push({
          id: order.id,
          number: order.number,
          type: order.type,
          paymentMethod: order.payment_method,
          status: order.status,
          amount: breakdown.transferencia,
          totalOrderAmount: Number(order.total),
          createdAt: order.created_at,
          itemsCount,
          products: productNames,
        });
      }

      summary.cashSales += breakdown.efectivo;
      summary.cardSales += breakdown.tarjeta;
      summary.transferSales += breakdown.transferencia;

      if (order.type === "despacho") {
        summary.dispatchCount += 1;
        summary.dispatchSales += Number(order.total);
        summary.dispatchOrderDetails.push({
          id: order.id,
          number: order.number,
          type: order.type,
          paymentMethod: order.payment_method,
          status: order.status,
          amount: Number(order.total),
          totalOrderAmount: Number(order.total),
          createdAt: order.created_at,
          itemsCount,
          products: productNames,
        });
      }

      const productBucket = productsByDate.get(dateKey) ?? new Map<string, { quantity: number; revenue: number }>();
      productsByDate.set(dateKey, productBucket);

      for (const item of order.order_items ?? []) {
        const productName = item.products?.name?.trim() || "Producto";
        const current = productBucket.get(productName) ?? { quantity: 0, revenue: 0 };
        current.quantity += Number(item.quantity);
        current.revenue += Number(item.subtotal);
        productBucket.set(productName, current);
        summary.productsSold += Number(item.quantity);
      }
    }

    for (const movement of (movementsData as CashMovementAuditRow[] | null) ?? []) {
      if (movement.type !== "retiro") {
        continue;
      }

      const dateKey = movement.created_at.slice(0, 10);
      const summary = getSummary(dateKey);
      const amount = Number(movement.amount);
      const parsedReason = parseCashMovementReason(movement.reason);
      const movementDetail = {
        id: movement.id,
        amount,
        reason: parsedReason.displayReason,
        paymentCategory: parsedReason.paymentCategory,
        createdAt: movement.created_at,
      };

      summary.withdrawalsCount += 1;
      summary.withdrawalsTotal += amount;
      summary.withdrawalDetails.push(movementDetail);

      switch (parsedReason.paymentCategory) {
        case "adelanto":
          summary.advancesTotal += amount;
          summary.advanceDetails.push(movementDetail);
          break;
        case "pago_sueldo":
          summary.salaryPaymentsTotal += amount;
          summary.salaryPaymentDetails.push(movementDetail);
          break;
        case "gasto_diario":
          summary.expensesTotal += amount;
          summary.expenseDetails.push(movementDetail);
          break;
        default:
          summary.otherWithdrawalsTotal += amount;
          summary.otherWithdrawalDetails.push(movementDetail);
          break;
      }
    }

    for (const [dateKey, summary] of summaries.entries()) {
      const products = Array.from(productsByDate.get(dateKey)?.entries() ?? [])
        .map(([name, value]) => ({
          name,
          quantity: value.quantity,
          revenue: value.revenue,
        }))
        .sort((left, right) => {
          if (right.quantity !== left.quantity) {
            return right.quantity - left.quantity;
          }

          return right.revenue - left.revenue;
        })
        .slice(0, 6);

      summary.topProducts = products;
      summary.activityCount = summary.ordersCount + summary.withdrawalsCount;
    }

    return Array.from(summaries.values()).sort((left, right) => right.dateKey.localeCompare(left.dateKey));
  },
};
