import type { CashMovementType, CashPaymentCategory } from "@/types/domain";

const PAYMENT_PREFIX = {
  gasto_diario: "[gasto_diario]",
  adelanto: "[adelanto]",
  pago_sueldo: "[pago_sueldo]",
  otro_pago: "[otro_pago]",
} satisfies Record<CashPaymentCategory, string>;

export function inferCashPaymentCategory(reason: string): CashPaymentCategory {
  const normalizedReason = reason.trim().toLowerCase();

  if (normalizedReason.includes("adelanto")) {
    return "adelanto";
  }

  if (normalizedReason.includes("sueldo")) {
    return "pago_sueldo";
  }

  if (normalizedReason.includes("gasto")) {
    return "gasto_diario";
  }

  return "otro_pago";
}

export function buildCashMovementReason(
  type: CashMovementType,
  reason: string,
  paymentCategory?: CashPaymentCategory | null,
) {
  const cleanReason = reason.trim();

  if (type !== "retiro") {
    return cleanReason;
  }

  const category = paymentCategory ?? inferCashPaymentCategory(cleanReason);
  return `${PAYMENT_PREFIX[category]} ${cleanReason}`;
}

export function parseCashMovementReason(reason: string) {
  const cleanReason = reason.trim();
  const match = cleanReason.match(/^\[(gasto_diario|adelanto|pago_sueldo|otro_pago)\]\s*/i);

  if (match) {
    const paymentCategory = match[1].toLowerCase() as CashPaymentCategory;

    return {
      paymentCategory,
      displayReason: cleanReason.replace(match[0], "").trim(),
    };
  }

  return {
    paymentCategory: inferCashPaymentCategory(cleanReason),
    displayReason: cleanReason,
  };
}
