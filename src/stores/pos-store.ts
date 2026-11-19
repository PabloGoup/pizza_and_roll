import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { PosCartItem } from "@/types/domain";

/** A persisted cart untouched for this long is discarded so an old order cannot resurface. */
const CART_MAX_AGE_MS = 3 * 60 * 60 * 1000;

interface PosState {
  cart: PosCartItem[];
  cartUpdatedAt: number | null;
  search: string;
  selectedCategoryId: string | null;
  favoritesOnly: boolean;
  addItem: (item: PosCartItem) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
  setSearch: (search: string) => void;
  setSelectedCategoryId: (categoryId: string | null) => void;
  toggleFavoritesOnly: () => void;
}

export const usePosStore = create<PosState>()(
  persist(
    (set) => ({
      cart: [],
      cartUpdatedAt: null,
      search: "",
      selectedCategoryId: null,
      favoritesOnly: false,
      addItem: (item) =>
        set((state) => {
          const existing = state.cart.find(
            (entry) =>
              entry.productId === item.productId &&
              entry.variantId === item.variantId &&
              entry.notes === item.notes &&
              JSON.stringify(entry.modifiers) === JSON.stringify(item.modifiers),
          );

          if (!existing) {
            return { cart: [...state.cart, item], cartUpdatedAt: Date.now() };
          }

          return {
            cartUpdatedAt: Date.now(),
            cart: state.cart.map((entry) =>
              entry.id === existing.id
                ? {
                    ...entry,
                    quantity: entry.quantity + item.quantity,
                  }
                : entry,
            ),
          };
        }),
      updateQuantity: (itemId, quantity) =>
        set((state) => ({
          cartUpdatedAt: Date.now(),
          cart: state.cart
            .map((item) => (item.id === itemId ? { ...item, quantity } : item))
            .filter((item) => item.quantity > 0),
        })),
      removeItem: (itemId) =>
        set((state) => ({
          cartUpdatedAt: Date.now(),
          cart: state.cart.filter((item) => item.id !== itemId),
        })),
      clearCart: () => set({ cart: [], cartUpdatedAt: null }),
      setSearch: (search) => set({ search }),
      setSelectedCategoryId: (selectedCategoryId) => set({ selectedCategoryId }),
      toggleFavoritesOnly: () =>
        set((state) => ({ favoritesOnly: !state.favoritesOnly })),
    }),
    {
      name: "pr-ventas-pos",
      partialize: (state) => ({
        cart: state.cart,
        cartUpdatedAt: state.cartUpdatedAt,
        search: state.search,
        selectedCategoryId: state.selectedCategoryId,
        favoritesOnly: state.favoritesOnly,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PosState>;
        const isFresh =
          typeof saved.cartUpdatedAt === "number" &&
          Date.now() - saved.cartUpdatedAt < CART_MAX_AGE_MS;
        return {
          ...current,
          ...saved,
          cart: isFresh && Array.isArray(saved.cart) ? saved.cart : [],
          cartUpdatedAt: isFresh ? saved.cartUpdatedAt ?? null : null,
        };
      },
    },
  ),
);
