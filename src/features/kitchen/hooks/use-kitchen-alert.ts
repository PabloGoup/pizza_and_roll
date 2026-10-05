import { useEffect, useRef } from "react";
import { useOrderSound } from "@/hooks/use-order-sound";
import type { KitchenOrder } from "./use-kitchen-tickets";

export function useKitchenAlert(tickets: KitchenOrder[], ready: boolean) {
  const sound = useOrderSound("kitchen-new");
  const { play } = sound;
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (!seen.current) {
      seen.current = new Set(tickets.map((ticket) => ticket.order_id));
      return;
    }
    for (const ticket of tickets) {
      if (!seen.current.has(ticket.order_id)) {
        seen.current.add(ticket.order_id);
        play();
      }
    }
  }, [tickets, ready, play]);

  return sound;
}
