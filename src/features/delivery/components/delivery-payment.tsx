import { formatCurrency, paymentMethodLabel } from "@/lib/format";
import type { CardType, PaymentBreakdown, PaymentMethod } from "@/types/domain";

export type DeliveryPaymentDetails = {
  payment_method?: PaymentMethod;
  card_type?: CardType | null;
  payment_breakdown?: PaymentBreakdown;
};

export function DeliveryPayment({ order }: { order: DeliveryPaymentDetails }) {
  const parts = order.payment_breakdown;
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
      <p><span className="text-muted-foreground">Forma de pago: </span><strong>{order.payment_method ? paymentMethodLabel(order.payment_method) : "Sin información"}</strong>{order.card_type && (order.payment_method === "tarjeta" || order.payment_method === "mixto") ? ` · ${order.card_type === "debito" ? "Débito" : "Crédito"}` : ""}</p>
      {order.payment_method === "mixto" && (
        <p className="mt-1 text-muted-foreground">
          {parts ? `Efectivo: ${formatCurrency(parts.cash)} · Tarjeta: ${formatCurrency(parts.card)} · Transferencia: ${formatCurrency(parts.transfer)}` : "Desglose no disponible"}
        </p>
      )}
    </div>
  );
}
