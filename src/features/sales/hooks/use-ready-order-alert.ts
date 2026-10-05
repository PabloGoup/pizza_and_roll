import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useOrderSound } from "@/hooks/use-order-sound";
import type { Order } from "@/types/domain";

export function useReadyOrderAlert(orders: Order[], ready: boolean) {
  const sound = useOrderSound("cash-ready");
  const { play } = sound;
  const previous = useRef<Map<string, Order["status"]> | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (previous.current) {
      for (const order of orders) {
        if (order.status === "listo" && previous.current.get(order.id) !== "listo") {
          play();
          toast.success(`${order.number} listo para empacar`, { duration: 10000 });
        }
      }
    }
    previous.current ??= new Map();
    for (const order of orders) previous.current.set(order.id, order.status);
  }, [orders, ready, play]);
  return sound;
}
