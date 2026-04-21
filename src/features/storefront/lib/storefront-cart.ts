import type { PosCartItem, Product, ProductSelectionPayload } from "@/types/domain";

export function buildStorefrontCartItem(
  product: Product,
  categoryName: string,
  selection: ProductSelectionPayload,
): PosCartItem {
  const variant = product.variants.find((entry) => entry.id === selection.variantId);
  const selectedProductModifiers = product.modifiers.filter((modifier) =>
    selection.modifierIds.includes(modifier.id),
  );

  return {
    id: crypto.randomUUID(),
    productId: product.id,
    productName: product.name,
    categoryName,
    quantity: selection.quantity,
    unitPrice: variant?.price ?? product.basePrice,
    notes: selection.notes ?? "",
    variantId: variant?.id,
    variantName: variant?.name,
    modifiers: [
      ...selectedProductModifiers.map((modifier) => ({
        id: modifier.id,
        name: modifier.name,
        priceDelta: modifier.priceDelta,
      })),
      ...selection.manualModifiers,
    ],
  };
}

export function getStorefrontCartItemTotal(item: PosCartItem) {
  const modifiersTotal = item.modifiers.reduce((total, modifier) => total + modifier.priceDelta, 0);
  return (item.unitPrice + modifiersTotal) * item.quantity;
}

export function getStorefrontCartSubtotal(cart: PosCartItem[]) {
  return cart.reduce((total, item) => total + getStorefrontCartItemTotal(item), 0);
}
