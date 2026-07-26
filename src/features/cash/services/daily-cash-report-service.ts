import { cashService } from "@/features/cash/services/cash-service";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getFunctionErrorMessage } from "@/lib/supabase/function-errors";
import type {
  CashCloseSummary,
  CashMovement,
  CashPaymentCategory,
  CashSession,
} from "@/types/domain";

export type DailyCashReportOrderDelay = {
  number: string;
  minutes: number;
};

export type DailyCashReportData = {
  session: CashSession;
  generatedAt: string;
  totalSales: number;
  cashSales: number;
  cardSales: number;
  transferSales: number;
  ordersCount: number;
  averageTicket: number;
  cancelledOrders: number;
  shiftDurationMinutes: number;
  suggestedNextOpening: number;
  movements: CashMovement[];
  movementTotals: Record<CashPaymentCategory | "retiros", number>;
  averagePreparationMinutes: number | null;
  completedKitchenOrders: number;
  aboveAveragePreparation: DailyCashReportOrderDelay[];
  busiestHour: string | null;
};

type ReportOrderRow = {
  id: string;
  number: string;
  status: string;
  total: number;
  created_at: string;
  kitchen_tickets:
    | { status: string; updated_at: string }
    | Array<{ status: string; updated_at: string }>
    | null;
};

function ticketFromOrder(order: ReportOrderRow) {
  return Array.isArray(order.kitchen_tickets)
    ? order.kitchen_tickets[0] ?? null
    : order.kitchen_tickets;
}

function minutesBetween(from: string, to: string) {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));
}

export const dailyCashReportService = {
  async build(
    session: CashSession,
    closeSummary: CashCloseSummary,
  ): Promise<DailyCashReportData> {
    const closedAt = session.closedAt ?? new Date().toISOString();
    const [allMovements, orderResult] = await Promise.all([
      cashService.listMovements(session.id),
      getSupabaseClient()
        .from("orders")
        .select("id, number, status, total, created_at, kitchen_tickets(status, updated_at)")
        .gte("created_at", session.openedAt)
        .lte("created_at", closedAt)
        .order("created_at", { ascending: true }),
    ]);

    if (orderResult.error) {
      throw new Error(`No se pudieron calcular los indicadores del turno: ${orderResult.error.message}`);
    }

    const orders = orderResult.data as unknown as ReportOrderRow[];
    const effectiveOrders = orders.filter((order) => order.status !== "cancelado");
    const movements = allMovements.filter((movement) => !movement.linkedOrderId);
    const movementTotals: DailyCashReportData["movementTotals"] = {
      retiros: 0,
      gasto_diario: 0,
      compra: 0,
      adelanto: 0,
      pago_sueldo: 0,
      otro_pago: 0,
    };

    for (const movement of movements) {
      if (movement.type !== "retiro") continue;
      movementTotals.retiros += movement.amount;
      movementTotals[movement.paymentCategory ?? "otro_pago"] += movement.amount;
    }

    const preparationTimes = orders
      .map((order) => {
        const ticket = ticketFromOrder(order);
        if (!ticket || ticket.status !== "listo") return null;
        return {
          number: order.number,
          minutes: minutesBetween(order.created_at, ticket.updated_at),
        };
      })
      .filter((value): value is DailyCashReportOrderDelay => value !== null);
    const averagePreparationMinutes = preparationTimes.length
      ? Math.round(
          preparationTimes.reduce((sum, order) => sum + order.minutes, 0) /
            preparationTimes.length,
        )
      : null;
    const ordersByHour = new Map<number, number>();
    for (const order of effectiveOrders) {
      const hour = new Date(order.created_at).getHours();
      ordersByHour.set(hour, (ordersByHour.get(hour) ?? 0) + 1);
    }
    const busiest = [...ordersByHour.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      session,
      generatedAt: new Date().toISOString(),
      totalSales: closeSummary.totalSalesAmount,
      cashSales: closeSummary.cash.salesAmount,
      cardSales: closeSummary.card.salesAmount,
      transferSales: closeSummary.transfer.salesAmount,
      ordersCount: effectiveOrders.length,
      averageTicket: effectiveOrders.length
        ? closeSummary.totalSalesAmount / effectiveOrders.length
        : 0,
      cancelledOrders: orders.length - effectiveOrders.length,
      shiftDurationMinutes: minutesBetween(session.openedAt, closedAt),
      suggestedNextOpening:
        session.nextOpeningAmount ??
        Math.max(0, Math.min(closeSummary.cash.expectedAmount, closeSummary.openingAmount)),
      movements,
      movementTotals,
      averagePreparationMinutes,
      completedKitchenOrders: preparationTimes.length,
      aboveAveragePreparation:
        averagePreparationMinutes === null
          ? []
          : preparationTimes
              .filter((order) => order.minutes > averagePreparationMinutes)
              .sort((a, b) => b.minutes - a.minutes),
      busiestHour: busiest
        ? `${String(busiest[0]).padStart(2, "0")}:00–${String((busiest[0] + 1) % 24).padStart(2, "0")}:00`
        : null,
    };
  },

  async send(sessionId: string) {
    const { data, error } = await getSupabaseClient().functions.invoke(
      "send-daily-cash-report",
      { body: { sessionId } },
    );

    if (error) {
      throw new Error(
        await getFunctionErrorMessage(error, "No se pudo enviar el informe diario."),
      );
    }

    if (!data?.ok) {
      throw new Error(data?.error ?? "No se pudo enviar el informe diario.");
    }

    return data as { ok: true; status: "sent" | "skipped"; messageId?: string };
  },
};
