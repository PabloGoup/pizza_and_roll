import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Copy, LogOut, Truck, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeliveryHistory } from "@/features/delivery/components/delivery-history";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useDeliveryDrivers } from "@/features/delivery/hooks/use-delivery-drivers";
import { useSignOut } from "@/features/auth/hooks/use-auth";
import { useOrderSound } from "@/hooks/use-order-sound";
import { formatCurrency, formatShortTime } from "@/lib/format";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth-store";
import type { OrderStatus } from "@/types/domain";

type DeliveryOrder = {
  id: string; number: string; status: OrderStatus; total: number; created_at: string;
  customer_name: string | null; phone: string | null; address: string;
  assigned_driver_id: string | null; delivered_at: string | null;
};

async function copy(value: string) {
  try { await navigator.clipboard.writeText(value); toast.success("Copiado"); }
  catch { toast.error("No se pudo copiar. Mantén presionado el texto para copiarlo."); }
}

export function DeliveryPage() {
  const user = useAuthStore((state) => state.currentUser)!;
  const staff = user.role !== "repartidor";
  const queryClient = useQueryClient();
  const signOut = useSignOut();
  const { enabled, activate, play } = useOrderSound("delivery-ready");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const seen = useRef(new Map<string, OrderStatus>());
  const pendingAlert = useRef(false);
  const ordersKey = ["dispatch", "delivery", user.id];
  const orders = useQuery({
    queryKey: ordersKey,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("list_delivery_orders");
      if (error) throw new Error(error.message);
      return data as unknown as DeliveryOrder[];
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });
  const drivers = useDeliveryDrivers(staff);
  const action = useMutation({
    mutationFn: async ({ orderId, driverId }: { orderId: string; driverId?: string }) => {
      const client = getSupabaseClient();
      const { error } = driverId !== undefined
        ? await client.rpc("assign_delivery_driver", { p_order_id: orderId, p_driver_id: driverId || null })
        : await client.rpc("complete_delivery", { p_order_id: orderId });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setConfirmId(null);
      toast.success(staff ? "Asignación actualizada" : "Pedido entregado");
      await queryClient.invalidateQueries({ queryKey: ["dispatch"] });
    },
    onError: (error) => { toast.error(error.message); void orders.refetch(); },
  });

  // Keep alerts queued while the browser requires an audio-unlock gesture.
  useEffect(() => {
    if (!orders.data) return;
    for (const order of orders.data) {
      if (!seen.current.has(order.id) || (order.status === "listo" && seen.current.get(order.id) !== "listo")) {
        pendingAlert.current = true;
      }
    }
    seen.current = new Map(orders.data.map((order) => [order.id, order.status]));
    if (enabled && pendingAlert.current) { play(); pendingAlert.current = false; }
  }, [orders.data, enabled, play]);

  useEffect(() => {
    if (enabled) return;
    const unlock = () => { void activate().catch(() => { /* Visible activation button remains available. */ }); };
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [enabled, activate]);

  const activeOrders = orders.data ?? [];
  return (
    <main className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
          <div><h1 className="flex items-center gap-2 text-3xl font-semibold"><Truck /> Reparto</h1>
            <p className="mt-2 text-muted-foreground">{user.fullName} · {staff ? "Asignación de pedidos" : "Mis pedidos asignados"}</p></div>
          <div className="flex flex-wrap gap-2">
            {staff && <Link to="/app/ventas" className="rounded-lg border px-4 py-2">Volver a caja</Link>}
            <Button variant="outline" disabled={signOut.isPending} onClick={() => signOut.mutate()}><LogOut /> Salir</Button>
          </div>
        </header>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4" role="status">
          <span className="flex items-center gap-2"><Volume2 /> {enabled ? "Avisos sonoros activos" : "Activa el sonido para recibir los avisos de reparto"}</span>
          <Button variant="outline" onClick={() => void activate().catch(() => toast.error("El navegador bloqueó el sonido. Vuelve a intentarlo."))}>
            {enabled ? "Probar sonido" : "Activar sonido"}
          </Button>
          <p className="w-full text-sm text-muted-foreground">Aviso al recibir pedidos y cuando estén listos. Mantén esta pantalla abierta y el volumen del dispositivo alto.</p>
        </div>
        <Tabs defaultValue="active">
          <TabsList><TabsTrigger value="active">Pedidos activos</TabsTrigger>{(user.role === "administrador" || user.role === "repartidor") && <TabsTrigger value="history">Entregados y contabilizados</TabsTrigger>}</TabsList>
          <TabsContent value="active" className="space-y-5">
        {(orders.isError || drivers.isError) && <div role="alert" className="rounded-xl border border-destructive p-4 text-destructive">No se pudo actualizar Reparto: {orders.error?.message ?? drivers.error?.message}. <Button variant="outline" onClick={() => { void orders.refetch(); if (staff) void drivers.refetch(); }}>Reintentar</Button></div>}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span>{activeOrders.length} pedidos activos</span>
          <span>{activeOrders.filter((o) => o.status === "listo").length} listos para despacho</span>
          <span>Actualización cada 5 segundos{orders.dataUpdatedAt ? ` · ${formatShortTime(new Date(orders.dataUpdatedAt).toISOString())}` : ""}</span>
        </div>
        {orders.isPending && <p role="status">Cargando pedidos…</p>}
        {!orders.isPending && !orders.isError && !activeOrders.length && <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">{staff ? "No hay pedidos con reparto pendientes." : "No tienes pedidos asignados por ahora."}</div>}
        <div className="grid gap-4 md:grid-cols-2">
          {activeOrders.map((order) => (
            <Card key={order.id} className={order.status === "listo" ? "border-emerald-500" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3"><CardTitle>Pedido {order.number}</CardTitle><strong className="text-xl">{formatCurrency(order.total)}</strong></div>
                <p className={order.status === "listo" ? "font-semibold text-emerald-600" : "text-muted-foreground"}>{order.status === "listo" ? "Listo para despacho" : order.status === "en_preparacion" ? "En preparación" : "Pendiente de preparación"} · {formatShortTime(order.created_at)}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="font-medium">{order.customer_name || "Cliente sin nombre"}</p>
                <div className="flex items-center justify-between gap-3"><p className="min-w-0 select-text break-words">{order.address || "Dirección pendiente: consultar en caja"}</p><Button variant="outline" size="icon" aria-label={`Copiar dirección de ${order.number}`} disabled={!order.address} onClick={() => void copy(order.address)}><Copy /></Button></div>
                <div className="flex items-center justify-between gap-3"><p className="select-text">{order.phone || "Teléfono pendiente: consultar en caja"}</p><Button variant="outline" size="icon" aria-label={`Copiar teléfono de ${order.number}`} disabled={!order.phone} onClick={() => void copy(order.phone!)}><Copy /></Button></div>
                {staff ? <label className="block space-y-2 text-sm"><span>Repartidor asignado</span><select className="h-11 w-full rounded-lg border bg-background px-3" value={order.assigned_driver_id ?? ""} disabled={action.isPending || drivers.isPending || drivers.isError} onChange={(event) => action.mutate({ orderId: order.id, driverId: event.target.value })}><option value="">Sin asignar</option>{drivers.data?.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name}</option>)}</select></label>
                  : confirmId === order.id ? <div className="space-y-3 rounded-lg border p-3"><p>¿Confirmas que entregaste el pedido {order.number} al cliente?</p><div className="flex gap-2"><Button disabled={action.isPending || orders.isError} onClick={() => action.mutate({ orderId: order.id })}>Confirmar entrega</Button><Button variant="outline" disabled={action.isPending} onClick={() => setConfirmId(null)}>Volver</Button></div></div>
                  : <Button className="w-full" disabled={order.status !== "listo" || action.isPending || orders.isError} onClick={() => setConfirmId(order.id)}>Pedido entregado</Button>}
              </CardContent>
            </Card>
          ))}
        </div>
          </TabsContent>
          {(user.role === "administrador" || user.role === "repartidor") && <TabsContent value="history"><DeliveryHistory /></TabsContent>}
        </Tabs>
      </div>
    </main>
  );
}
