import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cashService } from "@/features/cash/services/cash-service";
import type { AppUser, CashCloseInput, CashMovementInput, CashReportType } from "@/types/domain";

const cashKeys = {
  session: ["cash", "current-session"] as const,
  movements: ["cash", "movements"] as const,
  closeSummary: ["cash", "close-summary"] as const,
  closedSessions: ["cash", "closed-sessions"] as const,
  reports: ["cash", "reports"] as const,
  suggestedOpening: ["cash", "suggested-opening"] as const,
};

export function useClosedCashSessions() {
  return useQuery({
    queryKey: cashKeys.closedSessions,
    queryFn: cashService.listClosedSessions,
  });
}

export function useCashReports() {
  return useQuery({ queryKey: cashKeys.reports, queryFn: () => cashService.listReports() });
}

export function useSuggestedOpeningAmount() {
  return useQuery({
    queryKey: cashKeys.suggestedOpening,
    queryFn: cashService.getSuggestedOpeningAmount,
  });
}

export function useGenerateCashReport(actor: AppUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (type: Extract<CashReportType, "X" | "Z">) => cashService.generateReport(type, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cashKeys.reports });
      await queryClient.invalidateQueries({ queryKey: cashKeys.closeSummary });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useSessionMovements(sessionId: string | null) {
  return useQuery({
    queryKey: ["cash", "session-movements", sessionId],
    queryFn: () => cashService.listMovements(sessionId ?? undefined),
    enabled: Boolean(sessionId),
  });
}

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

export function useUndoLastCashMovement(actor: AppUser) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => cashService.undoLastManualMovement(actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cashKeys.session });
      await queryClient.invalidateQueries({ queryKey: cashKeys.movements });
      await queryClient.invalidateQueries({ queryKey: cashKeys.closeSummary });
      await queryClient.invalidateQueries({ queryKey: cashKeys.reports });
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
      await queryClient.invalidateQueries({ queryKey: cashKeys.closedSessions });
      await queryClient.invalidateQueries({ queryKey: cashKeys.reports });
      await queryClient.invalidateQueries({ queryKey: cashKeys.suggestedOpening });
      await queryClient.invalidateQueries({ queryKey: ["sales", "current-session"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
      await queryClient.invalidateQueries({ queryKey: ["audit", "sales"] });
    },
  });
}
