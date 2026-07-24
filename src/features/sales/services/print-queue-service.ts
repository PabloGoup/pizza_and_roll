import { getSupabaseClient } from "@/lib/supabase/client";
import { getSelectedPrintStationId } from "@/features/printing/lib/print-station";
import type { Order } from "@/types/domain";

export type KitchenPrintKind = "new" | "revision" | "reprint";

function dedupeKey(order: Order, kind: KitchenPrintKind) {
  if (kind === "new") return `new:${order.id}`;
  if (kind === "revision") return `revision:${order.id}:${order.updatedAt}`;
  return `reprint:${order.id}:${crypto.randomUUID()}`;
}

export async function enqueueKitchenPrint(
  order: Order,
  kind: KitchenPrintKind,
) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("enqueue_kitchen_print", {
    p_order_id: order.id,
    p_job_type: kind,
    p_dedupe_key: dedupeKey(order, kind),
    p_agent_id: getSelectedPrintStationId(),
  });

  if (error) {
    throw new Error(`No se pudo encolar la comanda: ${error.message}`);
  }

  return data;
}
