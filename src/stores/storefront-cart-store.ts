import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { PosCartItem } from "@/types/domain";

export interface StorefrontCustomerDraft {
  fullName: string;
  phone: string;
  addressLabel: string;
  addressStreet: string;
  addressDistrict: string;
  addressReference: string;
  notes: string;
}

interface StorefrontCartState {
  cart: PosCartItem[];
  customerDraft: StorefrontCustomerDraft;
  addItem: (item: PosCartItem) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
  setCustomerDraft: (draft: Partial<StorefrontCustomerDraft>) => void;
  clearCustomerDraft: () => void;
}

const DEFAULT_CUSTOMER_DRAFT: StorefrontCustomerDraft = {
  fullName: "",
  phone: "",
  addressLabel: "Casa",
  addressStreet: "",
  addressDistrict: "",
  addressReference: "",
  notes: "",
};

export const useStorefrontCartStore = create<StorefrontCartState>()(
  persist(
    (set) => ({
      cart: [],
      customerDraft: DEFAULT_CUSTOMER_DRAFT,
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
      setCustomerDraft: (draft) =>
        set((state) => ({
          customerDraft: {
            ...state.customerDraft,
            ...draft,
          },
        })),
      clearCustomerDraft: () => set({ customerDraft: DEFAULT_CUSTOMER_DRAFT }),
    }),
    {
      name: "pr-storefront-cart",
      partialize: (state) => ({
        cart: state.cart,
        customerDraft: state.customerDraft,
      }),
    },
  ),
);
