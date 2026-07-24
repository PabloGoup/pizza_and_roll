import { endOfDay, startOfDay } from "date-fns";

import { cashService } from "@/features/cash/services/cash-service";
import { salesService } from "@/features/sales/services/sales-service";
import { isEffectiveSale } from "@/lib/financial";
import { paymentMethodLabel } from "@/lib/format";
import type { DashboardMetrics, DashboardRange } from "@/types/domain";

export const dashboardService = {
  async getMetrics(range?: DashboardRange): Promise<DashboardMetrics> {
    const [orders, closeSummary] = await Promise.all([
      salesService.listOrders(),
      cashService.getCurrentCloseSummary(),
    ]);

    const from = range ? new Date(range.from) : startOfDay(new Date());
    const to = range ? new Date(range.to) : endOfDay(new Date());

    const todayOrders = orders.filter((order) => {
      const createdAt = new Date(order.createdAt);
      return createdAt >= from && createdAt <= to;
    });
    const effectiveOrders = todayOrders.filter((order) => isEffectiveSale(order.status));

    const paymentMixMap = effectiveOrders.reduce<Record<string, number>>((acc, order) => {
      acc.efectivo = (acc.efectivo ?? 0) + order.paymentBreakdown.cash;
      acc.tarjeta = (acc.tarjeta ?? 0) + order.paymentBreakdown.card;
      acc.transferencia = (acc.transferencia ?? 0) + order.paymentBreakdown.transfer;
      const allocated =
        order.paymentBreakdown.cash +
        order.paymentBreakdown.card +
        order.paymentBreakdown.transfer;
      acc.sin_desglose = (acc.sin_desglose ?? 0) + Math.max(order.total - allocated, 0);
      return acc;
    }, {});

    const salesByHourMap = effectiveOrders.reduce<Record<string, number>>((acc, order) => {
      const label = new Date(order.createdAt).getHours().toString().padStart(2, "0");
      acc[label] = (acc[label] ?? 0) + order.total;
      return acc;
    }, {});

    const topProductsMap = effectiveOrders
      .flatMap((order) => order.items)
      .reduce<Record<string, { quantity: number; revenue: number }>>((acc, item) => {
        const current = acc[item.productName] ?? { quantity: 0, revenue: 0 };
        acc[item.productName] = {
          quantity: current.quantity + item.quantity,
          revenue: current.revenue + item.subtotal,
        };
        return acc;
      }, {});

    const totalSalesToday = effectiveOrders.reduce((total, order) => total + order.total, 0);

    return {
      totalSalesToday,
      ordersToday: effectiveOrders.length,
      averageTicket: effectiveOrders.length ? Math.round(totalSalesToday / effectiveOrders.length) : 0,
      expectedCash: closeSummary?.cash.expectedAmount ?? 0,
      cancelledOrders: todayOrders.filter((order) => order.status === "cancelado").length,
      salesByHour: Object.entries(salesByHourMap).map(([label, total]) => ({
        label: `${label}:00`,
        total,
      })),
      paymentMix: Object.entries(paymentMixMap)
        .filter(([, value]) => value > 0)
        .map(([name, value]) => ({
          name:
            name === "sin_desglose"
              ? "Pago sin desglose"
              : paymentMethodLabel(name as "efectivo" | "tarjeta" | "transferencia"),
          value,
        })),
      topProducts: Object.entries(topProductsMap)
        .map(([name, value]) => ({ name, ...value }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5),
    };
  },
};
