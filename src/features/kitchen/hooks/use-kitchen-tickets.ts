/**
 * use-kitchen-tickets.ts
 *
 * Hook Realtime para la pantalla de cocina de Pizza & Roll.
 *
 * - Carga tickets activos (pendiente + en_preparacion) al montar.
 * - Polling de respaldo cada 5 s por si Realtime falla.
 * - Suscripción Realtime a kitchen_tickets para actualizaciones en vivo.
 * - iniciarTicket()  → kitchen_tickets.status = 'en_preparacion'
 * - marcarListo()    → kitchen_tickets.status = 'listo'
 *                    + orders.status = 'listo'  ← CRÍTICO: dispara el
 *                      Database Webhook → Poke and roll → WhatsApp al cliente
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Tipos exportados
// ---------------------------------------------------------------------------

export type OrderSource = "pos" | "web" | "whatsapp";
export type OrderType = "consumo_local" | "retiro_local" | "despacho";
export type KitchenTicketStatus =
  | "pendiente"
  | "en_preparacion"
  | "listo"
  | "entregado"
  | "cancelado";
export type ConnectionStatus = "conectado" | "reconectando" | "error";

export interface KitchenOrderItemModifier {
  id: string;
  modifier_name_snapshot: string;
  price_delta: number;
}

export interface KitchenOrderItem {
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  notes: string | null;
  product_name: string | null;
  variant_name: string | null;
  modifiers: KitchenOrderItemModifier[];
}

export interface KitchenOrder {
  /** ID del kitchen_ticket */
  ticket_id: string;
  ticket_status: KitchenTicketStatus;
  ticket_created_at: string;
  /** ID del orders row */
  order_id: string;
  order_number: string;
  source: OrderSource;
  type: OrderType;
  notes: string | null;
  customer_name: string | null;
  order_created_at: string;
  estimated_ready_at: string | null;
  items: KitchenOrderItem[];
}

export interface UseKitchenTicketsResult {
  /** Tickets separados por estado para renderizar columnas */
  pendientes: KitchenOrder[];
  enPreparacion: KitchenOrder[];
  /** Todos los tickets activos (pendiente + en_preparacion) */
  tickets: KitchenOrder[];
  isLoading: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
  /** Forzar recarga manual */
  refreshTickets: () => void;
  /** Mueve el ticket a en_preparacion */
  iniciarTicket: (ticketId: string) => Promise<void>;
  /**
   * Mueve el ticket a listo Y actualiza orders.status = 'listo'.
   * Esto último dispara el Database Webhook de Supabase
   * que notifica a Poke and roll y envía el WhatsApp al cliente.
   */
  marcarListo: (ticketId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Carga de datos (múltiples queries para evitar relaciones deep en Supabase)
// ---------------------------------------------------------------------------

async function fetchKitchenOrders(): Promise<KitchenOrder[]> {
  const startedAt = performance.now();
  const { data, error } = await getSupabaseClient().rpc("list_active_kitchen_orders");
  performance.measure("kitchen:load-active-orders", { start: startedAt, end: performance.now() });
  if (error) throw new Error(error.message);
  return data as unknown as KitchenOrder[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useKitchenTickets(): UseKitchenTicketsResult {
  const [allOrders, setAllOrders] = useState<KitchenOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>(isSupabaseConfigured ? "reconectando" : "error");

  const loadingRef = useRef(false);
  const reloadRequested = useRef(false);

  const loadTickets = useCallback(async () => {
    if (loadingRef.current) { reloadRequested.current = true; return; }
    loadingRef.current = true;
    try {
      do {
        reloadRequested.current = false;
        const result = await fetchKitchenOrders();
        setAllOrders(result);
        setError(null);
      } while (reloadRequested.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando tickets");
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  // Carga inicial + polling de respaldo cada 5 s
  useEffect(() => {
    const initialLoad = setTimeout(() => void loadTickets(), 0);
    const interval = setInterval(() => void loadTickets(), 5_000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [loadTickets]);

  // Suscripción Realtime
  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    const supabase = getSupabaseClient();

    const channel = supabase
      .channel("kitchen-tickets-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kitchen_tickets" },
        () => {
          // Recargamos todo para mantener consistencia con joins
          void loadTickets();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnectionStatus("conectado");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnectionStatus("error");
        } else {
          setConnectionStatus("reconectando");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
      setConnectionStatus("reconectando");
    };
  }, [loadTickets]);

  // ---------------------------------------------------------------------------
  // Acciones
  // ---------------------------------------------------------------------------

  const iniciarTicket = useCallback(
    async (ticketId: string) => {
      const supabase = getSupabaseClient();

      const { error: err } = await supabase.rpc("start_kitchen_ticket", {
        p_ticket_id: ticketId,
      });

      if (err) throw new Error(`Error al iniciar ticket: ${err.message}`);

      // Actualización optimista local (Realtime también disparará recarga)
      setAllOrders((prev) =>
        prev.map((o) =>
          o.ticket_id === ticketId
            ? { ...o, ticket_status: "en_preparacion" }
            : o,
        ),
      );
    },
    [],
  );

  const marcarListo = useCallback(
    async (ticketId: string) => {
      const supabase = getSupabaseClient();

      // Obtener el order_id del ticket desde el estado local
      const ticket = allOrders.find((o) => o.ticket_id === ticketId);
      if (!ticket) {
        throw new Error(`Ticket ${ticketId} no encontrado.`);
      }

      const { error: orderErr } = await supabase.rpc("complete_kitchen_ticket", {
        p_ticket_id: ticketId,
      });

      if (orderErr) {
        throw new Error(`Error al completar ticket: ${orderErr.message}`);
      }

      // Actualización optimista: quitar el ticket de los activos
      setAllOrders((prev) => prev.filter((o) => o.ticket_id !== ticketId));
    },
    [allOrders],
  );

  // ---------------------------------------------------------------------------
  // Derivados
  // ---------------------------------------------------------------------------

  const pendientes = allOrders.filter((o) => o.ticket_status === "pendiente");
  const enPreparacion = allOrders.filter(
    (o) => o.ticket_status === "en_preparacion",
  );

  return {
    pendientes,
    enPreparacion,
    tickets: allOrders,
    isLoading,
    error,
    connectionStatus,
    refreshTickets: loadTickets,
    iniciarTicket,
    marcarListo,
  };
}
