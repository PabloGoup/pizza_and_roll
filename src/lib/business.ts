import type {
  CashMovement,
  CashMovementType,
  CashSession,
  Order,
  OrderItem,
  PaymentBreakdown,
} from "@/types/domain";

export function buildOrderNumber(orders: Order[]) {
  const lastValue = orders.reduce((max, order) => {
    const value = Number(order.number.replace("PR-", ""));
    return Number.isNaN(value) ? max : Math.max(max, value);
  }, 100);

  return `PR-${String(lastValue + 1).padStart(4, "0")}`;
}

export function getCashMovementEffect(type: CashMovementType, amount: number) {
  switch (type) {
    case "apertura":
    case "ingreso":
      return amount;
    case "retiro":
    case "anulacion":
      return -amount;
    case "diferencia":
    case "cierre":
      return 0;
  }
}

export function calculateExpectedCash(
  session: CashSession,
  movements: CashMovement[],
) {
  return movements
    .filter((movement) => movement.sessionId === session.id)
    .reduce(
      (total, movement) => total + getCashMovementEffect(movement.type, movement.amount),
      0,
    );
}

export function getCashAmountFromBreakdown(breakdown: PaymentBreakdown) {
  return breakdown.cash ?? 0;
}

export function calculateItemsSubtotal(items: OrderItem[]) {
  return items.reduce((total, item) => total + item.subtotal, 0);
}
