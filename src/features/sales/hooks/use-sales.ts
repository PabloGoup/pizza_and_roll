import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { salesService } from "@/features/sales/services/sales-service";
import type { AppUser, CheckoutPayload, OrderStatus, PosCartItem } from "@/types/domain";

const salesKeys = {
  all: ["sales"] as const,
};

export function useOrders() {
  return useQuery({
    queryKey: salesKeys.all,
    queryFn: salesService.listOrders,
  });
}

export function useCreateOrder(actor: AppUser) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cart, payload }: { cart: PosCartItem[]; payload: CheckoutPayload }) =>
      salesService.createOrder(cart, payload, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: salesKeys.all });
      await queryClient.invalidateQueries({ queryKey: ["cash"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useCancelOrder(actor: AppUser) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      salesService.cancelOrder(orderId, reason, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: salesKeys.all });
      await queryClient.invalidateQueries({ queryKey: ["cash"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useUpdateOrderStatus(actor: AppUser) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderId,
      status,
    }: {
      orderId: string;
      status: Extract<OrderStatus, "pendiente" | "listo">;
    }) => salesService.updateOrderStatus(orderId, status, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: salesKeys.all });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useUpdateOrderPaymentMethod(actor: AppUser) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderId,
      paymentMethod,
    }: {
      orderId: string;
      paymentMethod: "efectivo" | "tarjeta" | "transferencia";
    }) => salesService.updateOrderPaymentMethod(orderId, paymentMethod, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: salesKeys.all });
      await queryClient.invalidateQueries({ queryKey: ["cash"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}
