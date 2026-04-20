import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cashService } from "@/features/cash/services/cash-service";
import type { AppUser, CashCloseInput, CashMovementInput } from "@/types/domain";

const cashKeys = {
  session: ["cash", "current-session"] as const,
  movements: ["cash", "movements"] as const,
  closeSummary: ["cash", "close-summary"] as const,
};

export function useCurrentCashSession() {
  return useQuery({
    queryKey: cashKeys.session,
    queryFn: cashService.getCurrentSession,
  });
}

export function useCashMovements() {
  return useQuery({
    queryKey: cashKeys.movements,
    queryFn: () => cashService.listMovements(),
  });
}

export function useCurrentCloseSummary(enabled = true) {
  return useQuery({
    queryKey: cashKeys.closeSummary,
    queryFn: cashService.getCurrentCloseSummary,
    enabled,
  });
}

export function useOpenCash(actor: AppUser) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ openingAmount, notes }: { openingAmount: number; notes: string }) =>
      cashService.openSession(openingAmount, notes, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cashKeys.session });
      await queryClient.invalidateQueries({ queryKey: cashKeys.movements });
      await queryClient.invalidateQueries({ queryKey: cashKeys.closeSummary });
      await queryClient.invalidateQueries({ queryKey: ["sales", "current-session"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
      await queryClient.invalidateQueries({ queryKey: ["audit", "sales"] });
    },
  });
}

export function useRegisterCashMovement(actor: AppUser) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CashMovementInput) => cashService.registerMovement(payload, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cashKeys.session });
      await queryClient.invalidateQueries({ queryKey: cashKeys.movements });
      await queryClient.invalidateQueries({ queryKey: cashKeys.closeSummary });
      await queryClient.invalidateQueries({ queryKey: ["sales", "current-session"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
      await queryClient.invalidateQueries({ queryKey: ["audit", "sales"] });
    },
  });
}

export function useCloseCash(actor: AppUser) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CashCloseInput) => cashService.closeSession(payload, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cashKeys.session });
      await queryClient.invalidateQueries({ queryKey: cashKeys.movements });
      await queryClient.invalidateQueries({ queryKey: cashKeys.closeSummary });
      await queryClient.invalidateQueries({ queryKey: ["sales", "current-session"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
      await queryClient.invalidateQueries({ queryKey: ["audit", "sales"] });
    },
  });
}
