import { useState, useEffect } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { KitchenOrder } from "@/features/kitchen/hooks/use-kitchen-tickets";

// ---------- helpers ----------

function sourceLabel(source: KitchenOrder["source"]): { label: string; icon: string; variant: "default" | "secondary" | "outline" } {
  switch (source) {
    case "whatsapp":
      return { label: "WhatsApp", icon: "🟢", variant: "default" };
    case "web":
      return { label: "Web", icon: "🌐", variant: "secondary" };
    case "pos":
    default:
      return { label: "Local", icon: "🏪", variant: "outline" };
  }
}

function typeLabel(type: KitchenOrder["type"]): { label: string; icon: string } {
  switch (type) {
    case "despacho":
      return { label: "Delivery", icon: "🛵" };
    case "retiro_local":
      return { label: "Retiro", icon: "🏪" };
    case "consumo_local":
    default:
      return { label: "Local", icon: "🍽️" };
  }
}

// ---------- cronómetro ----------

function MinutosTranscurridos({ createdAt }: { createdAt: string }) {
  const [minutos, setMinutos] = useState(0);

  useEffect(() => {
    const calcular = () => {
      const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
      setMinutos(mins);
    };
    calcular();
    const interval = setInterval(calcular, 30_000);
    return () => clearInterval(interval);
  }, [createdAt]);

  const color =
    minutos < 10
      ? "text-green-600 dark:text-green-400"
      : minutos < 20
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-red-600 dark:text-red-400";

  return <span className={`font-mono font-bold text-lg ${color}`}>{minutos} min</span>;
}

function EtaStatus({ estimatedReadyAt }: { estimatedReadyAt: string | null }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!estimatedReadyAt) return;
    const calculate = () => {
      setRemaining(
        Math.ceil((new Date(estimatedReadyAt).getTime() - Date.now()) / 60_000),
      );
    };
    calculate();
    const interval = setInterval(calculate, 30_000);
    return () => clearInterval(interval);
  }, [estimatedReadyAt]);

  if (remaining === null) return null;

  const label =
    remaining > 0 ? `Faltan ${remaining} min` : `Atrasado ${Math.abs(remaining)} min`;
  const className =
    remaining > 10
      ? "text-green-600 dark:text-green-400"
      : remaining > 0
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return <span className={`text-xs font-bold ${className}`}>{label}</span>;
}

// ---------- main component ----------

interface TicketCardProps {
  order: KitchenOrder;
  onIniciarTicket: (ticketId: string) => Promise<void>;
  onMarcarListo: (ticketId: string) => Promise<void>;
}

export function TicketCard({ order, onIniciarTicket, onMarcarListo }: TicketCardProps) {
  const [isActing, setIsActing] = useState(false);

  const src = sourceLabel(order.source);
  const del = typeLabel(order.type);

  async function handleIniciar() {
    setIsActing(true);
    try {
      await onIniciarTicket(order.ticket_id);
      toast.success(`${order.order_number} en preparación`);
    } catch {
      toast.error("No se pudo actualizar el ticket");
    } finally {
      setIsActing(false);
    }
  }

  async function handleListo() {
    setIsActing(true);
    try {
      await onMarcarListo(order.ticket_id);
      toast.success(`${order.order_number} listo ✓`);
    } catch {
      toast.error("No se pudo actualizar el ticket");
    } finally {
      setIsActing(false);
    }
  }

  return (
    <Card className="border-2 hover:shadow-md transition-shadow">
      {/* Header */}
      <CardHeader className="pb-3 space-y-2">
        {/* Order number + timer */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-2xl font-black tracking-tight">{order.order_number}</span>
            <div><EtaStatus estimatedReadyAt={order.estimated_ready_at} /></div>
          </div>
          <MinutosTranscurridos createdAt={order.order_created_at} />
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={src.variant} className="text-xs gap-1">
            <span>{src.icon}</span>
            {src.label}
          </Badge>
          <Badge variant="outline" className="text-xs gap-1">
            <span>{del.icon}</span>
            {del.label}
          </Badge>
        </div>

        {/* Customer name */}
        {order.customer_name && (
          <p className="text-sm text-muted-foreground truncate">
            👤 {order.customer_name}
          </p>
        )}
      </CardHeader>

      {/* Items */}
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {order.items.map((item) => (
            <li key={item.id} className="text-sm">
              <div className="flex gap-2">
                <span className="font-bold min-w-[1.5rem] text-right">{item.quantity}×</span>
                <div className="flex-1">
                  <span className="font-medium">
                    {item.product_name ?? item.product_id}
                    {item.variant_name ? ` — ${item.variant_name}` : ""}
                  </span>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <p className="text-muted-foreground text-xs mt-0.5">
                      + {item.modifiers.join(", ")}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-amber-700 dark:text-amber-400 text-xs mt-0.5 font-medium">
                      📝 {item.notes}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Order notes */}
        {order.notes && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 text-xs text-amber-800 dark:text-amber-300">
            <span className="font-semibold">Nota del pedido:</span> {order.notes}
          </div>
        )}

        {/* Actions */}
        <div className="pt-1">
          {order.ticket_status === "pendiente" && (
            <Button
              className="w-full"
              onClick={handleIniciar}
              disabled={isActing}
            >
              {isActing ? "Actualizando..." : "Iniciar preparación"}
            </Button>
          )}
          {order.ticket_status === "en_preparacion" && (
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              onClick={handleListo}
              disabled={isActing}
            >
              {isActing ? "Actualizando..." : "LISTO ✓"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
