import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";

type Totals = { delivered_count: number; sales_total: number; delivery_fees: number };
type HistoryOrder = { id: string; number: string; total: number; delivery_fee: number; driver_name: string; customer_name: string | null; delivered_at: string | null; recorded_at: string; confirmed_attribution: boolean };
type HistoryData = { summary: Totals; drivers: (Totals & { driver_id: string | null; driver_name: string })[]; orders: HistoryOrder[] };
const dateTime = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });

export function DeliveryHistory() {
  const user = useAuthStore((state) => state.currentUser)!;
  const admin = user.role === "administrador";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [driver, setDriver] = useState("");
  const invalidDates = !!from && !!to && from > to;
  const query = useQuery({
    queryKey: ["dispatch", "history", user.id, from, to, driver, page],
    enabled: !invalidDates,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("delivery_history", { p_from: from || null, p_to: to || null, p_driver_id: driver || null, p_page: page });
      if (error) throw new Error(error.message);
      return data as unknown as HistoryData;
    },
    refetchInterval: 15000,
  });
  const totals = query.data?.summary;
  return <section className="space-y-5" aria-label="Historial de entregas">
    <div><h2 className="text-xl font-semibold">{admin ? "Entregas por repartidor" : "Mis entregas"}</h2><p className="mt-1 text-sm text-muted-foreground">Conteo y suma de los pedidos entregados, con fechas de Chile. Cada pedido se cuenta una sola vez.</p></div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-sm">Desde<Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} /></label>
      <label className="space-y-1 text-sm">Hasta<Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} /></label>
      <Button variant="outline" onClick={() => { setFrom(""); setTo(""); setDriver(""); setPage(0); }}>Todo el historial</Button>
      {driver && <Button variant="outline" onClick={() => { setDriver(""); setPage(0); }}>Todos los repartidores</Button>}
    </div>
    {invalidDates && <p role="alert" className="text-destructive">La fecha inicial debe ser anterior o igual a la final.</p>}
    {query.isError && <div role="alert">No se pudo cargar el historial: {query.error.message} <Button variant="outline" onClick={() => void query.refetch()}>Reintentar</Button></div>}
    {query.isPending && !invalidDates && <p role="status">Cargando entregas…</p>}
    {!invalidDates && totals && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[['Pedidos entregados', totals.delivered_count], ['Monto de pedidos', formatCurrency(totals.sales_total)], ['Tarifas de despacho', formatCurrency(totals.delivery_fees)]].map(([label,value]) => <Card key={label}><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>)}
      </div>
      <p className="text-sm text-muted-foreground">El monto de pedidos incluye el despacho. Las tarifas se muestran como desglose y no se suman nuevamente al total.</p>
      {admin && <div className="grid gap-3 sm:grid-cols-2">{query.data?.drivers.map((item) => <Card key={`${item.driver_id}-${item.driver_name}`}><CardHeader><CardTitle>{item.driver_name}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>{item.delivered_count} pedidos entregados</p><p>Monto de pedidos: <strong>{formatCurrency(item.sales_total)}</strong></p><p>Tarifas despacho: {formatCurrency(item.delivery_fees)}</p>{item.driver_id && <Button variant="outline" onClick={() => { setDriver(item.driver_id!); setPage(0); }}>Ver pedidos</Button>}</CardContent></Card>)}</div>}
      {!totals.delivered_count && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No hay entregas registradas en este período.</p>}
      <div className="space-y-3">{query.data?.orders.map((order) => <Card key={order.id}><CardContent className="space-y-2 pt-5"><div className="flex flex-wrap justify-between gap-2"><strong>Pedido {order.number}</strong><strong>{formatCurrency(order.total)}</strong></div><p className="text-sm">{order.customer_name || "Cliente sin nombre"}{admin ? ` · ${order.driver_name}` : ""}</p><p className="text-sm text-muted-foreground">{order.delivered_at ? "Entregado" : "Último registro"}: {dateTime.format(new Date(order.recorded_at))} · Despacho: {formatCurrency(order.delivery_fee)}</p><p className="text-sm font-medium text-emerald-600">Entregado · incluido en el conteo</p>{!order.confirmed_attribution && <p className="text-xs text-muted-foreground">Asignación histórica; sin confirmación individual del repartidor.</p>}</CardContent></Card>)}</div>
      {totals.delivered_count > 0 && <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={page === 0 || query.isFetching} onClick={() => setPage(page - 1)}>Anterior</Button><span className="text-sm">Página {page + 1} de {Math.ceil(totals.delivered_count / 50)}</span><Button variant="outline" disabled={(page + 1) * 50 >= totals.delivered_count || query.isFetching} onClick={() => setPage(page + 1)}>Siguiente</Button></div>}
    </>}
  </section>;
}
