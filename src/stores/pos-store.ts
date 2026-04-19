import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { PosCartItem } from "@/types/domain";

interface PosState {
  cart: PosCartItem[];
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
            return { cart: [...state.cart, item] };
          }

          return {
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
          cart: state.cart
            .map((item) => (item.id === itemId ? { ...item, quantity } : item))
            .filter((item) => item.quantity > 0),
        })),
      removeItem: (itemId) =>
        set((state) => ({
          cart: state.cart.filter((item) => item.id !== itemId),
        })),
      clearCart: () => set({ cart: [] }),
      setSearch: (search) => set({ search }),
      setSelectedCategoryId: (selectedCategoryId) => set({ selectedCategoryId }),
      toggleFavoritesOnly: () =>
        set((state) => ({ favoritesOnly: !state.favoritesOnly })),
    }),
    {
      name: "pr-ventas-pos",
      partialize: (state) => ({
        cart: state.cart,
        search: state.search,
        selectedCategoryId: state.selectedCategoryId,
        favoritesOnly: state.favoritesOnly,
      }),
    },
  ),
);
