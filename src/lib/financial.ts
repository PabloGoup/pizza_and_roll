import type { OrderStatus, PaymentMethod } from "@/types/domain";

export type PaymentTotals = {
  efectivo: number;
  tarjeta: number;
  transferencia: number;
};

export function isEffectiveSale(status: OrderStatus) {
  return status !== "cancelado";
}

export function buildPaymentTotals(
  payments: Array<{ method: Exclude<PaymentMethod, "mixto">; amount: number }> | null | undefined,
  paymentMethod: PaymentMethod,
  total: number,
): PaymentTotals {
  const totals: PaymentTotals = { efectivo: 0, tarjeta: 0, transferencia: 0 };
  const orderTotal = Number(total);

  if (payments?.length) {
    for (const payment of payments) {
      const amount = Number(payment.amount);
      if (Number.isFinite(amount) && amount > 0) {
        totals[payment.method] += amount;
      }
    }

    const allocatedTotal = totals.efectivo + totals.tarjeta + totals.transferencia;
    if (Math.abs(allocatedTotal - orderTotal) <= 1) {
      return totals;
    }

    // En ventas históricas puede haber detalles de pago incompletos o
    // duplicados. El total de la orden es el documento financiero principal.
    if (paymentMethod !== "mixto") {
      return {
        efectivo: paymentMethod === "efectivo" ? orderTotal : 0,
        tarjeta: paymentMethod === "tarjeta" ? orderTotal : 0,
        transferencia: paymentMethod === "transferencia" ? orderTotal : 0,
      };
    }

    if (allocatedTotal > 0) {
      const scale = orderTotal / allocatedTotal;
      return {
        efectivo: totals.efectivo * scale,
        tarjeta: totals.tarjeta * scale,
        transferencia: totals.transferencia * scale,
      };
    }
  }

  if (paymentMethod !== "mixto") {
    totals[paymentMethod] = orderTotal;
  }

  return totals;
}

export function expectedPhysicalCash(cashBaseAmount: number, cashSalesAmount: number) {
  return cashBaseAmount + cashSalesAmount;
}
