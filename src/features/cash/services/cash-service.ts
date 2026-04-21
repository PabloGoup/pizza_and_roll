import { calculateExpectedCash, getCashMovementEffect } from "@/lib/business";
import { buildCashMovementReason, parseCashMovementReason } from "@/lib/cash-payments";
import { createAuditLog } from "@/lib/supabase/audit";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatSupabaseError } from "@/lib/supabase/errors";
import type {
  AppUser,
  CashCloseInput,
  CashCloseOrderDetail,
  CashCloseSummary,
  CashMovement,
  CashMovementInput,
  CashSession,
  Order,
} from "@/types/domain";

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
  total: number;
  created_at: string;
  profiles?: {
    full_name: string;
  } | null;
  order_payments?: Array<{
    method: Exclude<Order["paymentMethod"], "mixto">;
    amount: number;
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
    notes: row.notes ?? undefined,
    cashierId: row.cashier_id,
    cashierName: row.profiles?.full_name ?? "Usuario",
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

function buildOrderPaymentBreakdown(payments: SessionOrderRow["order_payments"], paymentMethod: Order["paymentMethod"], total: number) {
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

function isMissingColumnError(error: { message?: string | null } | null | undefined, column: string) {
  return typeof error?.message === "string" && error.message.includes(`'${column}' column`);
}

async function fetchSessionSalesSummary(session: CashSession) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, number, type, status, payment_method, total, created_at, profiles!cashier_id(full_name), order_payments(method, amount)")
    .gte("created_at", session.openedAt)
    .order("created_at", { ascending: false });

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
  };

  for (const order of (data as unknown as SessionOrderRow[])) {
    if (order.status === "cancelado") {
      continue;
    }

    const breakdown = buildOrderPaymentBreakdown(order.order_payments, order.payment_method, order.total);

    if (breakdown.efectivo > 0) {
      summary.cashCount += 1;
      summary.cashSalesAmount += breakdown.efectivo;
      summary.cashOrders.push({
        orderId: order.id,
        orderNumber: order.number,
        orderType: order.type,
        paymentMethod: order.payment_method,
        amount: breakdown.efectivo,
        total: Number(order.total),
        createdAt: order.created_at,
        cashierName: order.profiles?.full_name ?? "Usuario",
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
        amount: breakdown.tarjeta,
        total: Number(order.total),
        createdAt: order.created_at,
        cashierName: order.profiles?.full_name ?? "Usuario",
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
        amount: breakdown.transferencia,
        total: Number(order.total),
        createdAt: order.created_at,
        cashierName: order.profiles?.full_name ?? "Usuario",
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

  const cashExpectedAmount = session.expectedAmount;
  const cardExpectedAmount = salesSummary.cardSalesAmount;
  const transferExpectedAmount = salesSummary.transferSalesAmount;

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

  const expectedAmount = calculateExpectedCash(session, movements);
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

    if (hasDifferences && !input.forceCloseWithDifferences) {
      throw new Error("Existen diferencias entre lo revisado y lo registrado. Confirma el cierre para continuar.");
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

    return closedSession;
  },

  async getCurrentCloseSummary() {
    const currentSession = await cashService.getCurrentSession();

    if (!currentSession) {
      return null;
    }

    const expectedAmount = await updateSessionExpectedAmount(currentSession.id);
    return buildCloseSummary({
      ...currentSession,
      expectedAmount,
    });
  },
};
