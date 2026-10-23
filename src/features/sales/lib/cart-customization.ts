import type { PosCartItem } from "@/types/domain";

/** Split customized units before pricing/persistence so kitchen and tickets use real item quantities. */
export function splitCustomizedCartItem(item: PosCartItem, customizedQuantity = item.quantity): PosCartItem[] {
  if (!Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isInteger(customizedQuantity) || customizedQuantity < 1 || customizedQuantity > item.quantity) {
    throw new Error("Revisa la cantidad de productos y unidades con agregados.");
  }
  const common = item.modifiers.filter((modifier) => modifier.id.startsWith("wrapping:") || modifier.id.startsWith("sold-out-replacement-"));
  if (customizedQuantity === item.quantity || common.length === item.modifiers.length) return [item];
  return [
    { ...item, quantity: customizedQuantity },
    { ...item, id: crypto.randomUUID(), quantity: item.quantity - customizedQuantity, modifiers: common },
  ];
}
