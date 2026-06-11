/**
 * use-kitchen-tickets.ts
 *
 * Hook Realtime para la pantalla de cocina de Pizza & Roll.
 *
 * - Carga tickets activos (pendiente + en_preparacion) al montar.
 * - Polling de respaldo cada 30 s por si Realtime falla.
 * - Suscripción Realtime a kitchen_tickets para actualizaciones en vivo.
 * - iniciarTicket()  → kitchen_tickets.status = 'en_preparacion'
 * - marcarListo()    → kitchen_tickets.status = 'listo'
 *                    + orders.status = 'listo'  ← CRÍTICO: dispara el
 *                      Database Webhook → Poke and roll → WhatsApp al cliente
 */

import { useCallback, useEffect, useState } from "react";

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
  const supabase = getSupabaseClient();

  // 1. Tickets activos
  const { data: tickets, error: ticketsError } = await supabase
    .from("kitchen_tickets")
    .select("id, order_id, status, created_at")
    .in("status", ["pendiente", "en_preparacion"])
    .order("created_at", { ascending: true });

  if (ticketsError) throw new Error(ticketsError.message);
  if (!tickets || tickets.length === 0) return [];

  const orderIds = tickets.map((t) => t.order_id);

  // 2. Orders relacionadas
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id, number, source, type, notes, customer_name_snapshot, created_at")
    .in("id", orderIds);

  if (ordersError) throw new Error(ordersError.message);

  // 3. Items de esas órdenes
  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("id, order_id, product_id, variant_id, quantity, notes")
    .in("order_id", orderIds);

  if (itemsError) throw new Error(itemsError.message);

  const itemList = items ?? [];

  // 4. Nombres de productos y variantes
  const productIds = [...new Set(itemList.map((i) => i.product_id))];
  const variantIds = [
    ...new Set(itemList.map((i) => i.variant_id).filter(Boolean) as string[]),
  ];

  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length
      ? supabase.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    variantIds.length
      ? supabase.from("product_variants").select("id, name").in("id", variantIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  // 5. Modificadores de los items
  const itemIds = itemList.map((i) => i.id);
  const { data: modifiers } = itemIds.length
    ? await supabase
        .from("order_item_modifiers")
        .select("id, order_item_id, modifier_name_snapshot, price_delta")
        .in("order_item_id", itemIds)
    : { data: [] as {
        id: string;
        order_item_id: string;
        modifier_name_snapshot: string;
        price_delta: number;
      }[] };

  // ---------------------------------------------------------------------------
  // Construcción de mapas
  // ---------------------------------------------------------------------------

  const productMap = new Map((products ?? []).map((p) => [p.id, p.name]));
  const variantMap = new Map((variants ?? []).map((v) => [v.id, v.name]));

  const modsByItem = new Map<string, KitchenOrderItemModifier[]>();
  for (const mod of modifiers ?? []) {
    const list = modsByItem.get(mod.order_item_id) ?? [];
    list.push({
      id: mod.id,
      modifier_name_snapshot: mod.modifier_name_snapshot,
      price_delta: mod.price_delta,
    });
    modsByItem.set(mod.order_item_id, list);
  }

  const orderMap = new Map((orders ?? []).map((o) => [o.id, o]));

  const itemsByOrder = new Map<string, KitchenOrderItem[]>();
  for (const item of itemList) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push({
      id: item.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      notes: item.notes ?? null,
      product_name: productMap.get(item.product_id) ?? null,
      variant_name:
        item.variant_id ? (variantMap.get(item.variant_id) ?? null) : null,
      modifiers: modsByItem.get(item.id) ?? [],
    });
    itemsByOrder.set(item.order_id, list);
  }

  return tickets.map((ticket) => {
    const order = orderMap.get(ticket.order_id);
    return {
      ticket_id: ticket.id,
      ticket_status: ticket.status as KitchenTicketStatus,
      ticket_created_at: ticket.created_at,
      order_id: ticket.order_id,
      order_number: order?.number ?? "—",
      source: (order?.source ?? "pos") as OrderSource,
      type: (order?.type ?? "consumo_local") as OrderType,
      notes: order?.notes ?? null,
      customer_name: order?.customer_name_snapshot ?? null,
      order_created_at: order?.created_at ?? ticket.created_at,
      items: itemsByOrder.get(ticket.order_id) ?? [],
    };
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useKitchenTickets(): UseKitchenTicketsResult {
  const [allOrders, setAllOrders] = useState<KitchenOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("reconectando");

  const loadTickets = useCallback(async () => {
    try {
      setError(null);
      const result = await fetchKitchenOrders();
      setAllOrders(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando tickets");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Carga inicial + polling de respaldo cada 30 s
  useEffect(() => {
    void loadTickets();
    const interval = setInterval(() => void loadTickets(), 30_000);
    return () => clearInterval(interval);
  }, [loadTickets]);

  // Suscripción Realtime
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setConnectionStatus("error");
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

      const { error: err } = await supabase
        .from("kitchen_tickets")
        .update({ status: "en_preparacion" })
        .eq("id", ticketId);

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

      const orderId = ticket.order_id;

      // 1. Actualizar kitchen_ticket → listo
      const { error: ticketErr } = await supabase
        .from("kitchen_tickets")
        .update({ status: "listo" })
        .eq("id", ticketId);

      if (ticketErr) {
        throw new Error(`Error al actualizar kitchen_ticket: ${ticketErr.message}`);
      }

      // 2. CRÍTICO: UPDATE orders SET status = 'listo' WHERE id = orderId
      //    Este cambio dispara el Database Webhook de Supabase
      //    → webhook en Poke and roll → notificación WhatsApp al cliente
      const { error: orderErr } = await supabase
        .from("orders")
        .update({ status: "listo" })
        .eq("id", orderId);

      if (orderErr) {
        throw new Error(
          `Error al actualizar order ${orderId}: ${orderErr.message}`,
        );
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
