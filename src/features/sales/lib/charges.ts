import type { OrderExtraCharge, OrderItemSelection } from "@/types/domain";

export const DISPATCH_FEE_OPTIONS = [2000, 2500, 3000, 4000] as const;

export const ORDER_EXTRA_OPTIONS = [
  { key: "extraSauce", label: "Salsa extra", unitPrice: 500 },
  { key: "ginger", label: "Jengibre", unitPrice: 500 },
  { key: "wasabi", label: "Wasabi", unitPrice: 500 },
  { key: "chopsticksHelp", label: "Ayuda palitos", unitPrice: 500 },
] as const;

export const PRODUCT_CHANGE_OPTIONS = [
  { key: "change500", label: "Cambio cobrado", unitPrice: 500 },
  { key: "change1000", label: "Cambio cobrado", unitPrice: 1000 },
  { key: "change1500", label: "Cambio cobrado", unitPrice: 1500 },
  { key: "change2000", label: "Cambio cobrado", unitPrice: 2000 },
] as const;

export type OrderExtraCounts = Partial<Record<(typeof ORDER_EXTRA_OPTIONS)[number]["key"], number>>;
export type ProductChangeCounts = Partial<
  Record<(typeof PRODUCT_CHANGE_OPTIONS)[number]["key"], number>
>;

export function buildOrderExtraCharges(counts: OrderExtraCounts): OrderExtraCharge[] {
  return ORDER_EXTRA_OPTIONS.flatMap((option) => {
    const quantity = Number(counts[option.key] ?? 0);

    if (!quantity) {
      return [];
    }

    return [
      {
        name: option.label,
        unitPrice: option.unitPrice,
        quantity,
        total: option.unitPrice * quantity,
      },
    ];
  });
}

export function buildManualProductModifiers(counts: ProductChangeCounts): OrderItemSelection[] {
  return PRODUCT_CHANGE_OPTIONS.flatMap((option) => {
    const quantity = Number(counts[option.key] ?? 0);

    if (!quantity) {
      return [];
    }

    return [
      {
        id: `${option.key}-${quantity}`,
        name: `${option.label} x${quantity} · ${option.unitPrice.toLocaleString("es-CL")}`,
        quantity,
        priceDelta: option.unitPrice * quantity,
      },
    ];
  });
}

export function sumExtraCharges(extraCharges: OrderExtraCharge[]) {
  return extraCharges.reduce((total, charge) => total + charge.total, 0);
}
