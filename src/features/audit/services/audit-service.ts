import { format } from "date-fns";

import { parseCashMovementReason } from "@/lib/cash-payments";
import {
  cashMovementLabel,
  cashPaymentCategoryLabel,
  formatCurrency,
  formatDateTime,
  orderTypeLabel,
  paymentMethodLabel,
} from "@/lib/format";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatSupabaseError } from "@/lib/supabase/errors";
import { buildPaymentTotals, isEffectiveSale } from "@/lib/financial";
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
  card_type: Order["cardType"];
  total: number;
  delivery_fee: number;
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
  session_id: string;
  linked_order_id: string | null;
  type: "apertura" | "ingreso" | "retiro" | "anulacion" | "diferencia" | "cierre";
  amount: number;
  reason: string;
  created_at: string;
};

type CashSessionAuditRow = {
  id: string;
  opened_at: string;
  closed_at: string | null;
};

const MAX_AUDIT_SESSION_DURATION_MS = 48 * 60 * 60 * 1000;
const LEGACY_JOURNEY_CUTOFF_MS = 6 * 60 * 60 * 1000;

function toLocalDateKey(value: string) {
  return format(new Date(value), "yyyy-MM-dd");
}

function toLegacyJourneyDateKey(value: string) {
  return format(new Date(new Date(value).getTime() - LEGACY_JOURNEY_CUTOFF_MS), "yyyy-MM-dd");
}

function isInsideAuditSession(session: CashSessionAuditRow, createdAt: string) {
  const timestamp = new Date(createdAt).getTime();
  const openedTimestamp = new Date(session.opened_at).getTime();
  const recordedClosedTimestamp = session.closed_at
    ? new Date(session.closed_at).getTime()
    : Number.POSITIVE_INFINITY;
  const auditClosedTimestamp = Math.min(
    recordedClosedTimestamp,
    openedTimestamp + MAX_AUDIT_SESSION_DURATION_MS,
  );

  return timestamp >= openedTimestamp && timestamp <= auditClosedTimestamp;
}

function findAuditSession(sessions: CashSessionAuditRow[], createdAt: string) {
  return sessions.find((session) => isInsideAuditSession(session, createdAt));
}

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

    if (row.action === "deshacer_movimiento") {
      const originalType = readString(previousValue, "type");
      const originalAmount = readNumber(previousValue, "amount");
      const originalCategory = readString(previousValue, "paymentCategory");
      const originalReason = readString(previousValue, "reason");
      const originalUser = readString(previousValue, "performedByName");
      const originalDate = readString(previousValue, "createdAt");
      const originalId = readString(previousValue, "id");

      if (originalType) {
        highlights.push({
          label: "Movimiento deshecho",
          value: cashMovementLabel(originalType as never),
        });
      }
      pushCurrencyHighlight(highlights, "Monto original", originalAmount);
      if (originalCategory) {
        highlights.push({
          label: "Categoría original",
          value: cashPaymentCategoryLabel(originalCategory as never),
        });
      }
      if (originalReason) {
        highlights.push({ label: "Motivo original", value: originalReason });
      }
      if (originalUser) {
        highlights.push({ label: "Registrado por", value: originalUser });
      }
      if (originalDate) {
        highlights.push({ label: "Fecha original", value: formatDateTime(originalDate) });
      }
      if (originalId) {
        highlights.push({ label: "ID movimiento", value: originalId });
      }

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

    const { data: sessionsData, error: sessionsError } = await supabase
      .from("cash_sessions")
      .select("id, opened_at, closed_at")
      .order("opened_at", { ascending: false });

    if (sessionsError) {
      throw new Error(
        formatSupabaseError("No se pudieron identificar las jornadas de caja.", sessionsError),
      );
    }

    const sessions = (sessionsData as CashSessionAuditRow[] | null) ?? [];
    const sessionById = new Map(sessions.map((session) => [session.id, session]));

    return (data as AuditLogRow[]).map((row) => ({
      ...(() => {
        const nextValue = asRecord(row.new_value);
        const previousValue = asRecord(row.previous_value);
        const explicitOpenedAt =
          readString(nextValue, "openedAt") ?? readString(previousValue, "openedAt");
        const explicitSessionId =
          readString(nextValue, "sessionId") ??
          readString(previousValue, "sessionId") ??
          (row.module === "caja"
            ? readString(nextValue, "id") ?? readString(previousValue, "id")
            : null);
        const explicitSession = explicitSessionId
          ? sessionById.get(explicitSessionId)
          : undefined;
        const inferredSession = findAuditSession(sessions, row.created_at);

        return {
          operationalDateKey: toLocalDateKey(
            explicitOpenedAt ??
              explicitSession?.opened_at ??
              inferredSession?.opened_at ??
              row.created_at,
          ),
        };
      })(),
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
        "id, number, type, status, payment_method, card_type, total, delivery_fee, created_at, order_payments(method, amount), order_items(quantity, subtotal, products(name))",
      )
      .order("created_at", { ascending: false });

    const ordersData = data as OrderAuditRow[] | null;

    if (ordersError) {
      throw new Error(formatSupabaseError("No se pudo cargar la auditoría de ventas.", ordersError));
    }

    const { data: movementsData, error: movementsError } = await supabase
      .from("cash_movements")
      .select("id, session_id, linked_order_id, type, amount, reason, created_at")
      .order("created_at", { ascending: false });

    if (movementsError) {
      throw new Error(
        formatSupabaseError("No se pudo cargar la auditoría de movimientos de caja.", movementsError),
      );
    }

    const { data: sessionsData, error: sessionsError } = await supabase
      .from("cash_sessions")
      .select("id, opened_at, closed_at")
      .order("opened_at", { ascending: false });

    if (sessionsError) {
      throw new Error(
        formatSupabaseError("No se pudieron identificar las jornadas de caja.", sessionsError),
      );
    }

    const summaries = new Map<string, DailySalesAuditSummary>();
    const sessionMap = new Map(
      ((sessionsData as CashSessionAuditRow[] | null) ?? []).map((session) => [
        session.id,
        session,
      ]),
    );

    // Algunas políticas RLS permiten consultar los movimientos compartidos,
    // pero no todas las filas históricas de cash_sessions. En ese caso se
    // reconstruye el intervalo desde los movimientos de apertura y cierre.
    for (const movement of (movementsData as CashMovementAuditRow[] | null) ?? []) {
      const existing = sessionMap.get(movement.session_id);

      if (movement.type === "apertura" && !existing) {
        sessionMap.set(movement.session_id, {
          id: movement.session_id,
          opened_at: movement.created_at,
          closed_at: null,
        });
      }

      if (movement.type === "cierre") {
        if (existing) {
          existing.closed_at = existing.closed_at ?? movement.created_at;
        } else {
          const openingMovement = (
            (movementsData as CashMovementAuditRow[] | null) ?? []
          ).find(
            (candidate) =>
              candidate.session_id === movement.session_id &&
              candidate.type === "apertura",
          );

          if (openingMovement) {
            sessionMap.set(movement.session_id, {
              id: movement.session_id,
              opened_at: openingMovement.created_at,
              closed_at: movement.created_at,
            });
          }
        }
      }
    }

    const sessions = Array.from(sessionMap.values()).sort((left, right) =>
      right.opened_at.localeCompare(left.opened_at),
    );
    const sessionById = new Map(sessions.map((session) => [session.id, session]));
    const orderSessionById = new Map(
      ((movementsData as CashMovementAuditRow[] | null) ?? [])
        .filter((movement) => movement.linked_order_id)
        .map((movement) => [movement.linked_order_id as string, movement.session_id]),
    );

    const getOrderSession = (orderId: string, createdAt: string) => {
      const linkedSessionId = orderSessionById.get(orderId);
      if (linkedSessionId) {
        const linkedSession = sessionById.get(linkedSessionId);
        if (linkedSession && isInsideAuditSession(linkedSession, createdAt)) {
          return linkedSession;
        }
      }

      // Las sesiones vienen desde la apertura más reciente. Si existen datos
      // históricos solapados, la venta queda en la jornada más específica.
      return findAuditSession(sessions, createdAt);
    };

    const getMovementDateKey = (movement: CashMovementAuditRow) => {
      const session = sessionById.get(movement.session_id);
      return session && isInsideAuditSession(session, movement.created_at)
        ? toLocalDateKey(session.opened_at)
        : toLegacyJourneyDateKey(movement.created_at);
    };

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
        debitSales: 0,
        creditSales: 0,
        unclassifiedCardSales: 0,
        unallocatedPaymentSales: 0,
        transferSales: 0,
        productsSold: 0,
        topProducts: [],
        withdrawalsCount: 0,
        withdrawalsTotal: 0,
        expensesTotal: 0,
        purchasesTotal: 0,
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
        purchaseDetails: [],
        advanceDetails: [],
        salaryPaymentDetails: [],
        otherWithdrawalDetails: [],
      };

      summaries.set(dateKey, created);
      return created;
    };

    const productsByDate = new Map<string, Map<string, { quantity: number; revenue: number }>>();

    for (const order of ordersData ?? []) {
      if (!isEffectiveSale(order.status)) {
        continue;
      }

      const orderSession = getOrderSession(order.id, order.created_at);
      const dateKey = orderSession
        ? toLocalDateKey(orderSession.opened_at)
        : toLegacyJourneyDateKey(order.created_at);
      const summary = getSummary(dateKey);
      summary.ordersCount += 1;
      summary.totalSales += Number(order.total);

      const breakdown = buildPaymentTotals(
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
      if (breakdown.tarjeta > 0) {
        if (order.card_type === "debito") {
          summary.debitSales += breakdown.tarjeta;
        } else if (order.card_type === "credito") {
          summary.creditSales += breakdown.tarjeta;
        } else {
          summary.unclassifiedCardSales += breakdown.tarjeta;
        }
      }
      summary.transferSales += breakdown.transferencia;
      const allocatedAmount = breakdown.efectivo + breakdown.tarjeta + breakdown.transferencia;
      summary.unallocatedPaymentSales += Math.max(Number(order.total) - allocatedAmount, 0);

      if (order.type === "despacho") {
        summary.dispatchCount += 1;
        summary.dispatchSales += Number(order.total);
        summary.deliveryFeesTotal += Number(order.delivery_fee ?? 0);
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

      const dateKey = getMovementDateKey(movement);
      if (!dateKey) {
        continue;
      }

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
        case "compra":
          summary.purchasesTotal += amount;
          summary.purchaseDetails.push(movementDetail);
          break;
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
