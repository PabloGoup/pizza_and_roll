import { isSameDay } from "date-fns";

import { cashService } from "@/features/cash/services/cash-service";
import { salesService } from "@/features/sales/services/sales-service";
import type { DashboardMetrics } from "@/types/domain";

export const dashboardService = {
  async getMetrics(): Promise<DashboardMetrics> {
    const [orders, activeSession] = await Promise.all([
      salesService.listOrders(),
      cashService.getCurrentSession(),
    ]);

    const todayOrders = orders.filter((order) =>
      isSameDay(new Date(order.createdAt), new Date()),
    );

    const paymentMixMap = todayOrders.reduce<Record<string, number>>((acc, order) => {
      acc[order.paymentMethod] = (acc[order.paymentMethod] ?? 0) + order.total;
      return acc;
    }, {});

    const salesByHourMap = todayOrders.reduce<Record<string, number>>((acc, order) => {
      const label = new Date(order.createdAt).getHours().toString().padStart(2, "0");
      acc[label] = (acc[label] ?? 0) + order.total;
      return acc;
    }, {});

    const topProductsMap = todayOrders
      .flatMap((order) => order.items)
      .reduce<Record<string, { quantity: number; revenue: number }>>((acc, item) => {
        const current = acc[item.productName] ?? { quantity: 0, revenue: 0 };
        acc[item.productName] = {
          quantity: current.quantity + item.quantity,
          revenue: current.revenue + item.subtotal,
        };
        return acc;
      }, {});

    const totalSalesToday = todayOrders
      .filter((order) => order.status !== "cancelado")
      .reduce((total, order) => total + order.total, 0);

    return {
      totalSalesToday,
      ordersToday: todayOrders.length,
      averageTicket: todayOrders.length ? Math.round(totalSalesToday / todayOrders.length) : 0,
      expectedCash: activeSession?.expectedAmount ?? 0,
      cancelledOrders: todayOrders.filter((order) => order.status === "cancelado").length,
      salesByHour: Object.entries(salesByHourMap).map(([label, total]) => ({
        label: `${label}:00`,
        total,
      })),
      paymentMix: Object.entries(paymentMixMap).map(([name, value]) => ({ name, value })),
      topProducts: Object.entries(topProductsMap)
        .map(([name, value]) => ({ name, ...value }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5),
    };
  },
};
