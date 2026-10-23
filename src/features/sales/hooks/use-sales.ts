import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { salesService } from "@/features/sales/services/sales-service";
import type {
  AppUser,
  CheckoutPayload,
  Order,
  OrderStatus,
  PosCartItem,
  UpdateOrderPayload,
} from "@/types/domain";

const salesKeys = {
  all: ["sales"] as const,
  currentSession: ["sales", "current-session"] as const,
};

export function useOrders() {
  return useQuery({
    queryKey: salesKeys.all,
    queryFn: salesService.listOrders,
  });
}

export function useCurrentSessionOrders() {
  return useQuery({
    queryKey: salesKeys.currentSession,
    queryFn: salesService.listCurrentSessionOrders,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
}

export function useCreateOrder(actor: AppUser) {
  const queryClient = useQueryClient();
  const attempt = useRef<{ fingerprint: string; id: string } | null>(null);
  return useMutation({
    mutationFn: ({ cart, payload }: { cart: PosCartItem[]; payload: CheckoutPayload }) => {
      const fingerprint = JSON.stringify({ cart, payload, actorId: actor.id });
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() };
      return salesService.createOrder(cart, payload, actor, attempt.current.id);
    },
    onSuccess: (order) => {
      attempt.current = null;
      // Refresh views in the background; printing must never wait for reports/history.
      queryClient.setQueryData<Order[]>(salesKeys.currentSession, (current) =>
        current ? [order, ...current.filter((entry) => entry.id !== order.id)] : [order],
      );
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: salesKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["cash"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["audit"] }),
        queryClient.invalidateQueries({ queryKey: ["dispatch"] }),
      ]);
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
      await queryClient.invalidateQueries({ queryKey: salesKeys.currentSession });
      await queryClient.invalidateQueries({ queryKey: ["cash"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
      await queryClient.invalidateQueries({ queryKey: ["audit", "sales"] });
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
      status: Extract<OrderStatus, "pendiente" | "listo" | "entregado">;
    }) => salesService.updateOrderStatus(orderId, status, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: salesKeys.all });
      await queryClient.invalidateQueries({ queryKey: salesKeys.currentSession });
      await queryClient.invalidateQueries({ queryKey: ["cash"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
      await queryClient.invalidateQueries({ queryKey: ["audit", "sales"] });
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
      await queryClient.invalidateQueries({ queryKey: salesKeys.currentSession });
      await queryClient.invalidateQueries({ queryKey: ["cash"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
      await queryClient.invalidateQueries({ queryKey: ["audit", "sales"] });
    },
  });
}

export function useUpdateOrder(actor: AppUser) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, payload }: { orderId: string; payload: UpdateOrderPayload }) =>
      salesService.updateOrder(orderId, payload, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: salesKeys.all });
      await queryClient.invalidateQueries({ queryKey: salesKeys.currentSession });
      await queryClient.invalidateQueries({ queryKey: ["cash"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
      await queryClient.invalidateQueries({ queryKey: ["audit", "sales"] });
    },
  });
}

export function useUpdateOrderDetails(actor: AppUser) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, payload }: {
      orderId: string;
      payload: Parameters<typeof salesService.updateOrderDetails>[1];
    }) => salesService.updateOrderDetails(orderId, payload, actor),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: salesKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["dispatch"] }),
        queryClient.invalidateQueries({ queryKey: ["audit"] }),
      ]);
    },
  });
}

export function useUpdateOrderFulfillment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ order, type, deliveryFee }: {
      order: Parameters<typeof salesService.updateOrderFulfillment>[0];
      type: Parameters<typeof salesService.updateOrderFulfillment>[1];
      deliveryFee: number;
    }) => salesService.updateOrderFulfillment(order, type, deliveryFee),
    onSettled: async () => {
      await Promise.all(["sales", "cash", "dashboard", "audit"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] })));
    },
  });
}
