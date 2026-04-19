import { Activity, BanknoteArrowDown, Receipt, ShoppingCart, XCircle } from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";

import { LoadingState } from "@/components/common/loading-state";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader } from "@/components/common/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardMetrics } from "@/features/dashboard/hooks/use-dashboard";
import { formatCurrency } from "@/lib/format";

const pieColors = ["#f97316", "#fb923c", "#facc15", "#38bdf8"];

export function DashboardPage() {
  const metrics = useDashboardMetrics();

  if (metrics.isLoading) {
    return <LoadingState label="Cargando dashboard operativo..." />;
  }

  if (!metrics.data) {
    return <LoadingState label="No fue posible cargar las métricas." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard operativo"
        description="Resumen diario de ventas, caja y comportamiento del local."
        action={
          <div className="flex gap-2">
            <Link to="/caja" className={buttonVariants({ variant: "outline", className: "rounded-full" })}>
              Ir a caja
            </Link>
            <Link to="/ventas" className={buttonVariants({ className: "rounded-full" })}>
              Nueva venta
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Ventas del día"
          value={formatCurrency(metrics.data.totalSalesToday)}
          hint="Total neto sin anulaciones"
          icon={<ShoppingCart className="size-4" />}
        />
        <MetricCard
          label="Pedidos de hoy"
          value={metrics.data.ordersToday.toString()}
          hint="Locales, retiros y despachos"
          icon={<Receipt className="size-4" />}
        />
        <MetricCard
          label="Ticket promedio"
          value={formatCurrency(metrics.data.averageTicket)}
          hint="Promedio por pedido"
          icon={<Activity className="size-4" />}
        />
        <MetricCard
          label="Caja esperada"
          value={formatCurrency(metrics.data.expectedCash)}
          hint="Efectivo esperado por sesión"
          icon={<BanknoteArrowDown className="size-4" />}
        />
        <MetricCard
          label="Anulaciones"
          value={metrics.data.cancelledOrders.toString()}
          hint="Ventas canceladas hoy"
          icon={<XCircle className="size-4" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Ventas por hora</CardTitle>
            <CardDescription>Lectura rápida del ritmo operativo del turno.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.data.salesByHour}>
                <XAxis dataKey="label" stroke="currentColor" opacity={0.35} />
                <YAxis stroke="currentColor" opacity={0.35} tickFormatter={(value) => `$${value / 1000}k`} />
                <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
                <Bar dataKey="total" fill="#f97316" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Mix de pagos</CardTitle>
            <CardDescription>Distribución diaria por medio de pago.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={metrics.data.paymentMix}
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                >
                  {metrics.data.paymentMix.map((entry, index) => (
                    <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Productos más vendidos</CardTitle>
          <CardDescription>Concentración de demanda para el turno actual.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {metrics.data.topProducts.map((product) => (
            <div key={product.name} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="font-medium">{product.name}</p>
              <p className="mt-2 text-sm text-muted-foreground">{product.quantity} unidades</p>
              <p className="mt-4 text-lg font-semibold">{formatCurrency(product.revenue)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
