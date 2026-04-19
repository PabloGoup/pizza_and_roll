import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AppUser } from "@/types/domain";

interface AuthState {
  currentUser: AppUser | null;
  hydrated: boolean;
  setCurrentUser: (user: AppUser | null) => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentUser: null,
      hydrated: false,
      setCurrentUser: (currentUser) => set({ currentUser }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "pr-ventas-auth",
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
