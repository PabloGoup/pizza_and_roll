import { getCashMovementEffect } from "@/lib/business";
import { buildCashMovementReason, parseCashMovementReason } from "@/lib/cash-payments";
import { cashMovementLabel, cashPaymentCategoryLabel, formatCurrency, formatDateTime } from "@/lib/format";
import { createAuditLog } from "@/lib/supabase/audit";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatSupabaseError } from "@/lib/supabase/errors";
import { buildPaymentTotals, expectedPhysicalCash, isEffectiveSale } from "@/lib/financial";
import type {
  AppUser,
  CashCloseInput,
  CashCloseOrderDetail,
  CashCloseSummary,
  CashReport,
  CashReportCashierSummary,
  CashReportOrderDetail,
  CashReportType,
  CashMovement,
  CashMovementInput,
  CashSession,
  Order,
} from "@/types/domain";
import type { Json } from "@/types/database";

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

type CashSessionRow = {
  id: string;
  status: "abierta" | "cerrada";
  opening_amount: number;
  expected_amount: number;
  expected_cash_sales_amount: number;
  expected_card_amount: number;
  expected_transfer_amount: number;
  counted_amount: number | null;
  counted_card_amount: number | null;
  counted_transfer_amount: number | null;
  difference_amount: number | null;
  difference_card_amount: number | null;
  difference_transfer_amount: number | null;
  next_opening_amount: number | null;
  difference_reason: string | null;
  closing_report_id: string | null;
  notes: string | null;
  cashier_id: string;
  opened_at: string;
  closed_at: string | null;
  profiles?: {
    full_name: string;
  } | null;
};

type CashMovementRow = {
  id: string;
  session_id: string;
  type: CashMovement["type"];
  amount: number;
  reason: string;
  performed_by: string;
  linked_order_id: string | null;
  created_at: string;
  profiles?: {
    full_name: string;
  } | null;
  orders?: {
    number: string;
  } | null;
};

type SessionOrderRow = {
  id: string;
  number: string;
  type: Order["type"];
  status: Order["status"];
  payment_method: Order["paymentMethod"];
  card_type: Order["cardType"];
  total: number;
  created_at: string;
  updated_at: string;
  cashier_id: string;
  profiles?: {
    full_name: string;
  } | null;
  order_payments?: Array<{
    method: Exclude<Order["paymentMethod"], "mixto">;
    amount: number;
  }> | null;
  order_items?: Array<{
    quantity: number;
    products?: { name: string } | null;
  }> | null;
};

function hydrateCashSession(row: CashSessionRow): CashSession {
  return {
    id: row.id,
    status: row.status,
    openingAmount: row.opening_amount,
    expectedAmount: row.expected_amount,
    expectedCashSalesAmount: row.expected_cash_sales_amount ?? 0,
    expectedCardAmount: row.expected_card_amount ?? 0,
    expectedTransferAmount: row.expected_transfer_amount ?? 0,
    countedAmount: row.counted_amount,
    countedCardAmount: row.counted_card_amount,
    countedTransferAmount: row.counted_transfer_amount,
    differenceAmount: row.difference_amount,
    differenceCardAmount: row.difference_card_amount,
    differenceTransferAmount: row.difference_transfer_amount,
    nextOpeningAmount: row.next_opening_amount,
    differenceReason: row.difference_reason,
    closingReportId: row.closing_report_id,
    notes: row.notes ?? undefined,
    cashierId: row.cashier_id,
    cashierName: row.profiles?.full_name ?? "Usuario",
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

function isMissingColumnError(error: { message?: string | null } | null | undefined, column: string) {
  return typeof error?.message === "string" && error.message.includes(`'${column}' column`);
}

async function fetchSessionSalesSummary(session: CashSession) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("orders")
    .select("id, number, type, status, payment_method, card_type, total, created_at, updated_at, cashier_id, profiles!cashier_id(full_name), order_payments(method, amount), order_items(quantity, products(name))")
    .gte("created_at", session.openedAt)
    .order("created_at", { ascending: false });

  if (session.closedAt) {
    query = query.lte("created_at", session.closedAt);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(formatSupabaseError("No se pudieron cargar las ventas del turno para el cierre.", error));
  }

  const summary = {
    cashCount: 0,
    cashSalesAmount: 0,
    cashOrders: [] as CashCloseOrderDetail[],
    cardCount: 0,
    cardSalesAmount: 0,
    cardOrders: [] as CashCloseOrderDetail[],
    transferCount: 0,
    transferSalesAmount: 0,
    transferOrders: [] as CashCloseOrderDetail[],
    allOrders: [] as CashReportOrderDetail[],
    allOrderRows: [] as SessionOrderRow[],
  };

  for (const order of (data as unknown as SessionOrderRow[])) {
    summary.allOrderRows.push(order);
    if (!isEffectiveSale(order.status)) {
      continue;
    }

    const breakdown = buildPaymentTotals(order.order_payments, order.payment_method, order.total);
    const products = (order.order_items ?? []).map(
      (item) => `${item.quantity}x ${item.products?.name ?? "Producto"}`,
    );
    summary.allOrders.push({
      orderId: order.id,
      orderNumber: order.number,
      orderType: order.type,
      paymentMethod: order.payment_method,
      cardType: order.card_type,
      amount: Number(order.total),
      total: Number(order.total),
      createdAt: order.created_at,
      cashierId: order.cashier_id,
      cashierName: order.profiles?.full_name ?? "Usuario",
      products,
    });

    if (breakdown.efectivo > 0) {
      summary.cashCount += 1;
      summary.cashSalesAmount += breakdown.efectivo;
      summary.cashOrders.push({
        orderId: order.id,
        orderNumber: order.number,
        orderType: order.type,
        paymentMethod: order.payment_method,
        cardType: order.card_type,
        amount: breakdown.efectivo,
        total: Number(order.total),
        createdAt: order.created_at,
        cashierName: order.profiles?.full_name ?? "Usuario",
        cashierId: order.cashier_id,
        products,
      });
    }

    if (breakdown.tarjeta > 0) {
      summary.cardCount += 1;
      summary.cardSalesAmount += breakdown.tarjeta;
      summary.cardOrders.push({
        orderId: order.id,
        orderNumber: order.number,
        orderType: order.type,
        paymentMethod: order.payment_method,
        cardType: order.card_type,
        amount: breakdown.tarjeta,
        total: Number(order.total),
        createdAt: order.created_at,
        cashierName: order.profiles?.full_name ?? "Usuario",
        cashierId: order.cashier_id,
        products,
      });
    }

    if (breakdown.transferencia > 0) {
      summary.transferCount += 1;
      summary.transferSalesAmount += breakdown.transferencia;
      summary.transferOrders.push({
        orderId: order.id,
        orderNumber: order.number,
        orderType: order.type,
        paymentMethod: order.payment_method,
        cardType: order.card_type,
        amount: breakdown.transferencia,
        total: Number(order.total),
        createdAt: order.created_at,
        cashierName: order.profiles?.full_name ?? "Usuario",
        cashierId: order.cashier_id,
        products,
      });
    }
  }

  return summary;
}

async function buildCloseSummary(session: CashSession): Promise<CashCloseSummary> {
  const movements = await cashService.listMovements(session.id);
  const salesSummary = await fetchSessionSalesSummary(session);

  const manualIncomeAmount = movements.reduce((total, movement) => {
    if (movement.type !== "ingreso" || movement.linkedOrderId) {
      return total;
    }

    return total + movement.amount;
  }, 0);

  const manualExpenseAmount = movements.reduce((total, movement) => {
    if (movement.type !== "retiro") {
      return total;
    }

    return total + movement.amount;
  }, 0);

  const cashBaseAmount = movements.reduce((total, movement) => {
    if (movement.type === "cierre" || movement.type === "diferencia") {
      return total;
    }

    if (movement.linkedOrderId) {
      return total;
    }

    return total + getCashMovementEffect(movement.type, movement.amount);
  }, 0);

  // El efectivo esperado se concilia desde dos fuentes independientes:
  // 1) dinero físico base (apertura + ingresos manuales - retiros)
  // 2) ventas vigentes cobradas en efectivo.
  // No usamos session.expectedAmount porque puede contener movimientos de ventas
  // acumulados y ocultar el fondo de apertura dentro del total.
  const cashExpectedAmount = expectedPhysicalCash(cashBaseAmount, salesSummary.cashSalesAmount);
  const cardExpectedAmount = salesSummary.cardSalesAmount;
  const transferExpectedAmount = salesSummary.transferSalesAmount;
  const latestOrderAt = salesSummary.allOrders.reduce(
    (latest, order) => {
      const source = (salesSummary.allOrderRows.find((row) => row.id === order.orderId)?.updated_at ?? order.createdAt);
      return source > latest ? source : latest;
    },
    session.openedAt,
  );
  const latestCashActivityAt = movements.reduce(
    (latest, movement) => (movement.createdAt > latest ? movement.createdAt : latest),
    latestOrderAt,
  );
  const supabase = getSupabaseClient();
  const { data: latestZ } = await supabase
    .from("cash_reports")
    .select("created_at")
    .eq("session_id", session.id)
    .eq("report_type", "Z")
    .gte("created_at", latestCashActivityAt)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    sessionId: session.id,
    openingAmount: session.openingAmount,
    manualIncomeAmount,
    manualExpenseAmount,
    cashBaseAmount,
    cash: {
      method: "efectivo",
      salesCount: salesSummary.cashCount,
      salesAmount: salesSummary.cashSalesAmount,
      expectedAmount: cashExpectedAmount,
      reviewedAmount: session.countedAmount ?? cashExpectedAmount,
      differenceAmount: (session.countedAmount ?? cashExpectedAmount) - cashExpectedAmount,
      orders: salesSummary.cashOrders,
    },
    card: {
      method: "tarjeta",
      salesCount: salesSummary.cardCount,
      salesAmount: cardExpectedAmount,
      expectedAmount: cardExpectedAmount,
      reviewedAmount: session.countedCardAmount ?? cardExpectedAmount,
      differenceAmount: (session.countedCardAmount ?? cardExpectedAmount) - cardExpectedAmount,
      orders: salesSummary.cardOrders,
    },
    transfer: {
      method: "transferencia",
      salesCount: salesSummary.transferCount,
      salesAmount: transferExpectedAmount,
      expectedAmount: transferExpectedAmount,
      reviewedAmount: session.countedTransferAmount ?? transferExpectedAmount,
      differenceAmount: (session.countedTransferAmount ?? transferExpectedAmount) - transferExpectedAmount,
      orders: salesSummary.transferOrders,
    },
    totalSalesAmount: salesSummary.cashSalesAmount + cardExpectedAmount + transferExpectedAmount,
    totalReviewedAmount:
      (session.countedAmount ?? cashExpectedAmount) +
      (session.countedCardAmount ?? cardExpectedAmount) +
      (session.countedTransferAmount ?? transferExpectedAmount),
    totalDifferenceAmount:
      ((session.countedAmount ?? cashExpectedAmount) - cashExpectedAmount) +
      ((session.countedCardAmount ?? cardExpectedAmount) - cardExpectedAmount) +
      ((session.countedTransferAmount ?? transferExpectedAmount) - transferExpectedAmount),
    hasCurrentZReport: Boolean(latestZ),
    lastZReportAt: latestZ?.created_at ?? null,
  };
}

async function buildCashReportSnapshot(
  session: CashSession,
  type: CashReportType,
  actor: AppUser,
  closeInput?: CashCloseInput,
): Promise<Omit<CashReport, "id" | "reportNumber">> {
  const sales = await fetchSessionSalesSummary(session);
  const close = await buildCloseSummary(session);
  const byCashier = new Map<string, CashReportCashierSummary>();

  for (const order of sales.allOrders) {
    const cashierId = order.cashierId ?? "sin-cajero";
    const current = byCashier.get(cashierId) ?? {
      cashierId,
      cashierName: order.cashierName ?? "Usuario",
      ordersCount: 0,
      total: 0,
      cash: 0,
      card: 0,
      debit: 0,
      credit: 0,
      unclassifiedCard: 0,
      transfer: 0,
      local: 0,
      pickup: 0,
      delivery: 0,
    };
    current.ordersCount += 1;
    current.total += order.total;
    if (order.orderType === "consumo_local") current.local += order.total;
    if (order.orderType === "retiro_local") current.pickup += order.total;
    if (order.orderType === "despacho") current.delivery += order.total;
    byCashier.set(cashierId, current);
  }

  for (const [orders, key] of [
    [close.cash.orders, "cash"],
    [close.card.orders, "card"],
    [close.transfer.orders, "transfer"],
  ] as const) {
    for (const order of orders) {
      const cashier = byCashier.get(order.cashierId ?? "sin-cajero");
      if (cashier) cashier[key] += order.amount;
    }
  }

  for (const order of close.card.orders) {
    const cashier = byCashier.get(order.cashierId ?? "sin-cajero");
    if (!cashier) continue;
    if (order.cardType === "debito") cashier.debit += order.amount;
    else if (order.cardType === "credito") cashier.credit += order.amount;
    else cashier.unclassifiedCard += order.amount;
  }

  return {
    sessionId: session.id,
    type,
    generatedById: actor.id,
    generatedByName: actor.fullName,
    openedAt: session.openedAt,
    generatedAt: new Date().toISOString(),
    closedAt: type === "CUADRATURA" ? new Date().toISOString() : null,
    openingAmount: session.openingAmount,
    expectedCashAmount: close.cash.expectedAmount,
    countedCashAmount: closeInput?.countedAmount ?? null,
    differenceAmount: closeInput ? closeInput.countedAmount - close.cash.expectedAmount : null,
    nextOpeningAmount: closeInput?.nextOpeningAmount ?? null,
    differenceReason: closeInput?.differenceReason ?? null,
    notes: closeInput?.notes ?? null,
    totalSales: close.totalSalesAmount,
    cashTotal: close.cash.salesAmount,
    cardTotal: close.card.salesAmount,
    debitTotal: close.card.orders.filter((order) => order.cardType === "debito").reduce((sum, order) => sum + order.amount, 0),
    creditTotal: close.card.orders.filter((order) => order.cardType === "credito").reduce((sum, order) => sum + order.amount, 0),
    unclassifiedCardTotal: close.card.orders.filter((order) => !order.cardType).reduce((sum, order) => sum + order.amount, 0),
    transferTotal: close.transfer.salesAmount,
    localTotal: sales.allOrders.filter((order) => order.orderType === "consumo_local").reduce((sum, order) => sum + order.total, 0),
    pickupTotal: sales.allOrders.filter((order) => order.orderType === "retiro_local").reduce((sum, order) => sum + order.total, 0),
    deliveryTotal: sales.allOrders.filter((order) => order.orderType === "despacho").reduce((sum, order) => sum + order.total, 0),
    ordersCount: sales.allOrders.length,
    cashierSummaries: [...byCashier.values()],
    orders: type === "X" ? [] : sales.allOrders,
  };
}

function hydrateCashReport(row: { id: string; report_number: string; snapshot: unknown }): CashReport {
  return {
    ...(row.snapshot as Omit<CashReport, "id" | "reportNumber">),
    id: row.id,
    reportNumber: row.report_number,
  };
}

function hydrateMovement(row: CashMovementRow): CashMovement {
  const parsedReason = parseCashMovementReason(row.reason);

  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    paymentCategory: row.type === "retiro" ? parsedReason.paymentCategory : null,
    amount: row.amount,
    reason: parsedReason.displayReason,
    performedById: row.performed_by,
    performedByName: row.profiles?.full_name ?? "Usuario",
    linkedOrderId: row.linked_order_id,
    linkedOrderNumber: row.orders?.number ?? undefined,
    createdAt: row.created_at,
  };
}

async function updateSessionExpectedAmount(sessionId: string) {
  const supabase = getSupabaseClient();
  const movements = await cashService.listMovements(sessionId);
  const session = await cashService.getSessionById(sessionId);

  if (!session) {
    throw new Error("No se pudo recalcular la caja.");
  }

  const salesSummary = await fetchSessionSalesSummary(session);
  const cashBaseAmount = movements.reduce((total, movement) => {
    if (
      movement.type === "cierre" ||
      movement.type === "diferencia" ||
      movement.linkedOrderId
    ) {
      return total;
    }

    return total + getCashMovementEffect(movement.type, movement.amount);
  }, 0);
  const expectedAmount = expectedPhysicalCash(cashBaseAmount, salesSummary.cashSalesAmount);
  const { error } = await supabase
    .from("cash_sessions")
    .update({ expected_amount: expectedAmount })
    .eq("id", sessionId);

  if (error) {
    throw new Error(formatSupabaseError("No se pudo actualizar el monto esperado de caja.", error));
  }

  return expectedAmount;
}

export const cashService = {
  async getSessionById(sessionId: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("cash_sessions")
      .select("*, profiles!cashier_id(full_name)")
      .eq("id", sessionId)
      .maybeSingle();

    if (error) {
      throw new Error(formatSupabaseError("No se pudo cargar la sesión de caja.", error));
    }

    return data ? hydrateCashSession(data as unknown as CashSessionRow) : null;
  },

  async getCurrentSession() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("cash_sessions")
      .select("*, profiles!cashier_id(full_name)")
      .eq("status", "abierta")
      .order("opened_at", { ascending: false })
      .maybeSingle();

    if (error) {
      throw new Error(formatSupabaseError("No se pudo cargar el estado de caja.", error));
    }

    return data ? hydrateCashSession(data as unknown as CashSessionRow) : null;
  },

  async listClosedSessions() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("cash_sessions")
      .select("*, profiles!cashier_id(full_name)")
      .eq("status", "cerrada")
      .order("closed_at", { ascending: false })
      .limit(180);

    if (error) {
      throw new Error(formatSupabaseError("No se pudo cargar el historial de cajas.", error));
    }

    return (data as unknown as CashSessionRow[]).map(hydrateCashSession);
  },

  async listReports(sessionId?: string) {
    const supabase = getSupabaseClient();
    let query = supabase
      .from("cash_reports")
      .select("id, report_number, snapshot")
      .order("created_at", { ascending: false })
      .limit(250);

    if (sessionId) query = query.eq("session_id", sessionId);
    const { data, error } = await query;

    if (error) {
      throw new Error(formatSupabaseError("No se pudieron cargar los reportes de caja.", error));
    }

    return (data as Array<{ id: string; report_number: string; snapshot: unknown }>).map(hydrateCashReport);
  },

  async getSuggestedOpeningAmount() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("cash_sessions")
      .select("next_opening_amount")
      .eq("status", "cerrada")
      .not("next_opening_amount", "is", null)
      .order("closed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(formatSupabaseError("No se pudo cargar el fondo sugerido.", error));
    }

    return data?.next_opening_amount == null ? null : Number(data.next_opening_amount);
  },

  async generateReport(type: Extract<CashReportType, "X" | "Z">, actor: AppUser) {
    const supabase = getSupabaseClient();
    const currentSession = await cashService.getCurrentSession();
    if (!currentSession) throw new Error("Debes abrir caja para generar un corte.");

    const snapshot = await buildCashReportSnapshot(currentSession, type, actor);
    const reportNumber = `${type}-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const { data, error } = await supabase
      .from("cash_reports")
      .insert({
        session_id: currentSession.id,
        report_type: type,
        report_number: reportNumber,
        generated_by: actor.id,
        snapshot: toJson(snapshot),
      })
      .select("id, report_number, snapshot")
      .single();

    if (error) throw new Error(formatSupabaseError(`No se pudo generar el Corte ${type}.`, error));
    const report = hydrateCashReport(data as { id: string; report_number: string; snapshot: unknown });
    await createAuditLog({
      module: "caja",
      action: `corte_${type.toLowerCase()}`,
      detail: `Corte ${type} ${report.reportNumber} generado por ${actor.fullName}`,
      actor,
      newValue: report,
    });
    return report;
  },

  async listMovements(sessionId?: string) {
    const supabase = getSupabaseClient();
    const activeSessionId = sessionId ?? (await cashService.getCurrentSession())?.id;

    if (!activeSessionId) {
      return [] as CashMovement[];
    }

    const { data, error } = await supabase
      .from("cash_movements")
      .select("*, profiles!performed_by(full_name), orders(number)")
      .eq("session_id", activeSessionId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(formatSupabaseError("No se pudieron cargar los movimientos de caja.", error));
    }

    return (data as unknown as CashMovementRow[]).map(hydrateMovement);
  },

  async listAllMovements() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("cash_movements")
      .select("*, profiles!performed_by(full_name), orders(number)")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(formatSupabaseError("No se pudo cargar el historial de movimientos de caja.", error));
    }

    return (data as unknown as CashMovementRow[]).map(hydrateMovement);
  },

  async openSession(openingAmount: number, notes: string, actor: AppUser) {
    const supabase = getSupabaseClient();
    const existing = await cashService.getCurrentSession();

    if (existing) {
      throw new Error("Ya existe una caja abierta.");
    }

    let data: unknown;
    let error: { message?: string | null; details?: string | null; hint?: string | null } | null =
      null;

    const openAttempt = await supabase
      .from("cash_sessions")
      .insert({
        cashier_id: actor.id,
        opening_amount: openingAmount,
        expected_amount: openingAmount,
        expected_cash_sales_amount: 0,
        expected_card_amount: 0,
        expected_transfer_amount: 0,
        notes,
      })
      .select("*, profiles!cashier_id(full_name)")
      .single();

    data = openAttempt.data;
    error = openAttempt.error;

    if (
      error &&
      (isMissingColumnError(error, "expected_cash_sales_amount") ||
        isMissingColumnError(error, "expected_card_amount") ||
        isMissingColumnError(error, "expected_transfer_amount"))
    ) {
      const legacyAttempt = await supabase
        .from("cash_sessions")
        .insert({
          cashier_id: actor.id,
          opening_amount: openingAmount,
          expected_amount: openingAmount,
          notes,
        })
        .select("*, profiles!cashier_id(full_name)")
        .single();

      data = legacyAttempt.data;
      error = legacyAttempt.error;
    }

    if (error) {
      throw new Error(formatSupabaseError("No se pudo abrir la caja.", error));
    }

    const session = hydrateCashSession(data as unknown as CashSessionRow);

    const { error: movementError } = await supabase.from("cash_movements").insert({
      session_id: session.id,
      type: "apertura",
      amount: openingAmount,
      reason: "Apertura de caja",
      performed_by: actor.id,
    });

    if (movementError) {
      throw new Error(
        formatSupabaseError(
          "La caja se abrió, pero falló el registro del movimiento inicial.",
          movementError,
        ),
      );
    }

    await createAuditLog({
      module: "caja",
      action: "apertura",
      detail: `Apertura de caja por ${actor.fullName}`,
      actor,
      newValue: session,
    });

    return session;
  },

  async registerMovement(input: CashMovementInput, actor: AppUser) {
    const supabase = getSupabaseClient();
    const currentSession = await cashService.getCurrentSession();

    if (!currentSession) {
      throw new Error("Debes abrir caja antes de registrar movimientos.");
    }

    const { data, error } = await supabase
      .from("cash_movements")
      .insert({
        session_id: currentSession.id,
        type: input.type,
        amount: input.amount,
        reason: buildCashMovementReason(input.type, input.reason, input.paymentCategory),
        performed_by: actor.id,
      })
      .select("*, profiles!performed_by(full_name), orders(number)")
      .single();

    if (error) {
      throw new Error(formatSupabaseError("No se pudo registrar el movimiento.", error));
    }

    await updateSessionExpectedAmount(currentSession.id);

    const movement = hydrateMovement(data as unknown as CashMovementRow);

    await createAuditLog({
      module: "caja",
      action: input.type,
      detail: `${input.type === "retiro" ? "Retiro" : "Ingreso"} manual de caja`,
      actor,
      newValue: movement,
    });

    return movement;
  },

  async undoLastManualMovement(actor: AppUser) {
    const supabase = getSupabaseClient();
    const currentSession = await cashService.getCurrentSession();

    if (!currentSession) {
      throw new Error("No hay una caja abierta.");
    }

    const movements = await cashService.listMovements(currentSession.id);
    const movement = movements.find(
      (candidate) =>
        (candidate.type === "ingreso" || candidate.type === "retiro") &&
        !candidate.linkedOrderId,
    );

    if (!movement) {
      throw new Error("No hay un movimiento manual que se pueda deshacer.");
    }

    const reversedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("cash_movements")
      .update({
        type: "anulacion",
        amount: 0,
        reason: `Movimiento anulado: ${movement.reason}`,
        performed_by: actor.id,
        created_at: reversedAt,
      })
      .eq("id", movement.id)
      .eq("session_id", currentSession.id)
      .in("type", ["ingreso", "retiro"])
      .select("*, profiles!performed_by(full_name), orders(number)")
      .single();

    if (error) {
      throw new Error(formatSupabaseError("No se pudo deshacer el último movimiento.", error));
    }

    await updateSessionExpectedAmount(currentSession.id);
    const reversedMovement = hydrateMovement(data as unknown as CashMovementRow);

    await createAuditLog({
      module: "caja",
      action: "deshacer_movimiento",
      detail: [
        `${cashMovementLabel(movement.type)} manual deshecho por ${actor.fullName}.`,
        `Monto original: ${formatCurrency(movement.amount)}.`,
        movement.paymentCategory
          ? `Categoría: ${cashPaymentCategoryLabel(movement.paymentCategory)}.`
          : null,
        `Motivo original: ${movement.reason}.`,
        `Registrado por ${movement.performedByName} el ${formatDateTime(movement.createdAt)}.`,
      ]
        .filter(Boolean)
        .join(" "),
      actor,
      previousValue: movement,
      newValue: reversedMovement,
      reason: movement.reason,
    });

    return { previous: movement, movement: reversedMovement };
  },

  async closeSession(input: CashCloseInput, actor: AppUser) {
    const supabase = getSupabaseClient();
    const currentSession = await cashService.getCurrentSession();

    if (!currentSession) {
      throw new Error("No hay una caja abierta para cerrar.");
    }

    const expectedAmount = await updateSessionExpectedAmount(currentSession.id);
    const recalculatedSession = {
      ...currentSession,
      expectedAmount,
    };
    const closeSummary = await buildCloseSummary(recalculatedSession);
    const differenceAmount = input.countedAmount - closeSummary.cash.expectedAmount;
    const differenceCardAmount = input.countedCardAmount - closeSummary.card.expectedAmount;
    const differenceTransferAmount =
      input.countedTransferAmount - closeSummary.transfer.expectedAmount;
    const hasDifferences =
      differenceAmount !== 0 || differenceCardAmount !== 0 || differenceTransferAmount !== 0;

    if (!closeSummary.hasCurrentZReport) {
      throw new Error("Debes generar y revisar un Corte Z actualizado antes de cerrar la caja.");
    }

    if (hasDifferences && !input.differenceReason?.trim()) {
      throw new Error("Explica el motivo del descuadre. El cierre puede continuar, pero debe quedar registrado.");
    }

    if (hasDifferences && !input.forceCloseWithDifferences) {
      throw new Error("Existen diferencias entre lo revisado y lo registrado. Confirma el cierre para continuar.");
    }

    // Diferencias mayores a 50.000 CLP solo las puede confirmar un administrador.
    const LARGE_DIFFERENCE_THRESHOLD = 50_000;
    const totalAbsDifference =
      Math.abs(differenceAmount) +
      Math.abs(differenceCardAmount) +
      Math.abs(differenceTransferAmount);

    if (hasDifferences && totalAbsDifference > LARGE_DIFFERENCE_THRESHOLD && actor.role !== "administrador") {
      throw new Error(
        `La diferencia total de $${totalAbsDifference.toLocaleString("es-CL")} supera el límite permitido para cajero ($${LARGE_DIFFERENCE_THRESHOLD.toLocaleString("es-CL")}). Solicita a un administrador que confirme el cierre.`,
      );
    }

    const movementRows: Array<{
      session_id: string;
      type: CashMovement["type"];
      amount: number;
      reason: string;
      performed_by: string;
    }> = [
      {
        session_id: currentSession.id,
        type: "cierre",
        amount: input.countedAmount,
        reason: "Cierre de caja",
        performed_by: actor.id,
      },
    ];

    if (differenceAmount !== 0) {
      movementRows.push({
        session_id: currentSession.id,
        type: "diferencia",
        amount: Math.abs(differenceAmount),
        reason: differenceAmount > 0 ? "Sobrante en caja" : "Faltante en caja",
        performed_by: actor.id,
      });
    }

    const { error: movementError } = await supabase
      .from("cash_movements")
      .insert(movementRows);

    if (movementError) {
      throw new Error(
        formatSupabaseError("No se pudieron registrar los movimientos de cierre.", movementError),
      );
    }

    const reconciliationSnapshot = await buildCashReportSnapshot(
      currentSession,
      "CUADRATURA",
      actor,
      input,
    );
    const reconciliationNumber = `C-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const { data: reconciliationRow, error: reconciliationError } = await supabase
      .from("cash_reports")
      .insert({
        session_id: currentSession.id,
        report_type: "CUADRATURA",
        report_number: reconciliationNumber,
        generated_by: actor.id,
        snapshot: toJson(reconciliationSnapshot),
      })
      .select("id, report_number, snapshot")
      .single();

    if (reconciliationError) {
      throw new Error(formatSupabaseError("No se pudo guardar el reporte de cuadratura; la caja no fue cerrada.", reconciliationError));
    }

    const closePayload = {
      status: "cerrada" as const,
      expected_amount: closeSummary.cash.expectedAmount,
      expected_cash_sales_amount: closeSummary.cash.salesAmount,
      expected_card_amount: closeSummary.card.expectedAmount,
      expected_transfer_amount: closeSummary.transfer.expectedAmount,
      counted_amount: input.countedAmount,
      counted_card_amount: input.countedCardAmount,
      counted_transfer_amount: input.countedTransferAmount,
      difference_amount: differenceAmount,
      difference_card_amount: differenceCardAmount,
      difference_transfer_amount: differenceTransferAmount,
      next_opening_amount: input.nextOpeningAmount,
      difference_reason: input.differenceReason?.trim() || null,
      closing_report_id: reconciliationRow.id,
      notes: input.notes ?? currentSession.notes ?? null,
      closed_at: new Date().toISOString(),
    };

    let data: unknown;
    let error: { message?: string | null; details?: string | null; hint?: string | null } | null = null;

    const closeAttempt = await supabase
      .from("cash_sessions")
      .update(closePayload)
      .eq("id", currentSession.id)
      .select("*, profiles!cashier_id(full_name)")
      .single();

    data = closeAttempt.data;
    error = closeAttempt.error;

    if (
      error &&
      (isMissingColumnError(error, "counted_card_amount") ||
        isMissingColumnError(error, "counted_transfer_amount") ||
        isMissingColumnError(error, "difference_card_amount") ||
        isMissingColumnError(error, "difference_transfer_amount") ||
        isMissingColumnError(error, "expected_cash_sales_amount") ||
        isMissingColumnError(error, "expected_card_amount") ||
        isMissingColumnError(error, "expected_transfer_amount"))
    ) {
      const legacyNotes = [
        input.notes?.trim(),
        differenceCardAmount !== 0 ? `Diferencia tarjeta: ${differenceCardAmount}` : null,
        differenceTransferAmount !== 0 ? `Diferencia transferencia: ${differenceTransferAmount}` : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" | ");

      const legacyAttempt = await supabase
        .from("cash_sessions")
        .update({
          status: "cerrada",
          expected_amount: closeSummary.cash.expectedAmount,
          counted_amount: input.countedAmount,
          difference_amount: differenceAmount,
          notes: legacyNotes || currentSession.notes || null,
          closed_at: closePayload.closed_at,
        })
        .eq("id", currentSession.id)
        .select("*, profiles!cashier_id(full_name)")
        .single();

      data = legacyAttempt.data;
      error = legacyAttempt.error;
    }

    if (error) {
      throw new Error(formatSupabaseError("No se pudo cerrar la caja.", error));
    }

    const closedSession = hydrateCashSession(data as unknown as CashSessionRow);

    await createAuditLog({
      module: "caja",
      action: "cierre",
      detail: `Cierre de caja por ${actor.fullName}`,
      actor,
      previousValue: currentSession,
      newValue: closedSession,
    });

    return {
      session: closedSession,
      report: hydrateCashReport(reconciliationRow as { id: string; report_number: string; snapshot: unknown }),
    };
  },

  async getCurrentCloseSummary() {
    const currentSession = await cashService.getCurrentSession();

    if (!currentSession) {
      return null;
    }

    return buildCloseSummary(currentSession);
  },
};
