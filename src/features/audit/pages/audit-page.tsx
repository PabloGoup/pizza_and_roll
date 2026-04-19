import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuditEvents, useAuditSalesSummaries } from "@/features/audit/hooks/use-audit";
import {
  cashPaymentCategoryLabel,
  formatCurrency,
  formatDateTime,
  orderTypeLabel,
  paymentMethodLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AuditEvent, DailySalesAuditSummary } from "@/types/domain";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

function toDateKey(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function buildMonthDays(currentMonth: Date) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let currentDay = calendarStart;

  while (currentDay <= calendarEnd) {
    days.push(currentDay);
    currentDay = addDays(currentDay, 1);
  }

  return days;
}

function buildEventsByDate(events: AuditEvent[]) {
  return events.reduce<Record<string, AuditEvent[]>>((acc, event) => {
    const dateKey = event.createdAt.slice(0, 10);
    acc[dateKey] ??= [];
    acc[dateKey].push(event);
    return acc;
  }, {});
}

function buildSalesByDate(summaries: DailySalesAuditSummary[]) {
  return summaries.reduce<Record<string, DailySalesAuditSummary>>((acc, summary) => {
    acc[summary.dateKey] = summary;
    return acc;
  }, {});
}

function buildCountMapFromEvents(eventsByDate: Record<string, AuditEvent[]>) {
  return Object.fromEntries(
    Object.entries(eventsByDate).map(([dateKey, events]) => [dateKey, events.length]),
  ) as Record<string, number>;
}

function buildCountMapFromSales(salesByDate: Record<string, DailySalesAuditSummary>) {
  return Object.fromEntries(
    Object.entries(salesByDate).map(([dateKey, summary]) => [dateKey, summary.activityCount]),
  ) as Record<string, number>;
}

function SalesMetric({
  label,
  value,
  hint,
  active = false,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  active?: boolean;
  onClick?: (() => void) | undefined;
}) {
  const content = (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-muted/10 p-4 text-left transition",
        onClick && "hover:border-border hover:bg-muted/20",
        active && "border-black bg-black text-white",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {hint ? (
        <p className={cn("mt-1 text-sm text-muted-foreground", active && "text-white/75")}>{hint}</p>
      ) : null}
    </div>
  );

  if (!onClick) {
    return content;
  }

  return (
    <button type="button" onClick={onClick} className="w-full">
      {content}
    </button>
  );
}

type SalesDetailKey =
  | "allOrders"
  | "cashSales"
  | "cardSales"
  | "transferSales"
  | "dispatches"
  | "withdrawals"
  | "expenses"
  | "advances"
  | "salary"
  | "otherWithdrawals";

function toggleDetail(
  current: SalesDetailKey | null,
  next: SalesDetailKey,
  setCurrent: (value: SalesDetailKey | null) => void,
) {
  setCurrent(current === next ? null : next);
}

export function AuditPage() {
  const audit = useAuditEvents();
  const salesAudit = useAuditSalesSummaries();
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [section, setSection] = useState<"movimientos" | "ventas">("movimientos");
  const [activeSalesDetail, setActiveSalesDetail] = useState<SalesDetailKey | null>(null);

  const monthDays = useMemo(() => buildMonthDays(currentMonth), [currentMonth]);
  const eventsByDate = useMemo(() => buildEventsByDate(audit.data ?? []), [audit.data]);
  const salesByDate = useMemo(() => buildSalesByDate(salesAudit.data ?? []), [salesAudit.data]);
  const eventCounts = useMemo(() => buildCountMapFromEvents(eventsByDate), [eventsByDate]);
  const salesCounts = useMemo(() => buildCountMapFromSales(salesByDate), [salesByDate]);

  const activeCountMap = section === "movimientos" ? eventCounts : salesCounts;
  const monthHasSelection =
    selectedDateKey && isSameMonth(parseISO(selectedDateKey), currentMonth);

  const fallbackDateKey = useMemo(() => {
    const datesInMonth = Object.keys(activeCountMap)
      .filter((dateKey) => isSameMonth(parseISO(dateKey), currentMonth))
      .sort((left, right) => right.localeCompare(left));

    return datesInMonth[0] ?? null;
  }, [activeCountMap, currentMonth]);

  const activeDateKey = monthHasSelection ? selectedDateKey : fallbackDateKey;
  const activeEvents = activeDateKey ? eventsByDate[activeDateKey] ?? [] : [];
  const activeSalesSummary = activeDateKey ? salesByDate[activeDateKey] ?? null : null;

  useEffect(() => {
    setActiveSalesDetail(null);
  }, [activeDateKey, section]);

  if (audit.isLoading || salesAudit.isLoading) {
    return <LoadingState label="Cargando auditoría..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoría"
        description="Trazabilidad de acciones sensibles y resumen operativo diario de ventas."
      />

      <Tabs
        value={section}
        onValueChange={(value) => setSection(value as "movimientos" | "ventas")}
        className="space-y-6"
      >
        <TabsList variant="line">
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
        </TabsList>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
          <TabsContent value="movimientos" className="m-0">
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">
                  {activeDateKey
                    ? format(parseISO(activeDateKey), "dd MMMM yyyy", { locale: es })
                    : "Sin fecha seleccionada"}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeEvents.length
                    ? `${activeEvents.length} evento${activeEvents.length === 1 ? "" : "s"} registrado${activeEvents.length === 1 ? "" : "s"}`
                    : "No hay movimientos registrados para esta fecha."}
                </p>
              </CardHeader>
              <CardContent className="space-y-0">
                {activeEvents.length ? (
                  activeEvents.map((event, index) => (
                    <div key={event.id}>
                      <div className="space-y-3 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                              {event.module}
                            </span>
                            <span className="rounded-full border border-border/70 px-3 py-1 text-xs font-medium">
                              {event.action}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {event.performedByName}
                            </span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {formatDateTime(event.createdAt)}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-medium">{event.detail}</p>
                          {event.highlights.length ? (
                            <div className="flex flex-wrap gap-2">
                              {event.highlights.map((highlight) => (
                                <span
                                  key={`${event.id}-${highlight.label}`}
                                  className="rounded-full bg-muted/20 px-3 py-1 text-xs text-muted-foreground"
                                >
                                  <span className="font-medium text-foreground">{highlight.label}:</span>{" "}
                                  {highlight.value}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {event.reason ? (
                            <p className="text-sm text-muted-foreground">Motivo: {event.reason}</p>
                          ) : null}
                        </div>
                      </div>
                      {index < activeEvents.length - 1 ? <Separator /> : null}
                    </div>
                  ))
                ) : (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Selecciona un día con registros para abrir sus logs.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ventas" className="m-0">
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">
                  {activeDateKey
                    ? format(parseISO(activeDateKey), "dd MMMM yyyy", { locale: es })
                    : "Sin fecha seleccionada"}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeSalesSummary
                    ? `${activeSalesSummary.ordersCount} venta${activeSalesSummary.ordersCount === 1 ? "" : "s"} y ${activeSalesSummary.withdrawalsCount} retiro${activeSalesSummary.withdrawalsCount === 1 ? "" : "s"} en la fecha`
                    : "No hay ventas ni movimientos de caja para esta fecha."}
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {activeSalesSummary ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <SalesMetric
                        label="Ventas totales"
                        value={formatCurrency(activeSalesSummary.totalSales)}
                        hint={`${activeSalesSummary.ordersCount} ventas`}
                        active={activeSalesDetail === "allOrders"}
                        onClick={() =>
                          toggleDetail(activeSalesDetail, "allOrders", setActiveSalesDetail)
                        }
                      />
                      <SalesMetric
                        label="Efectivo"
                        value={formatCurrency(activeSalesSummary.cashSales)}
                        hint={`${activeSalesSummary.cashOrderDetails.length} registros`}
                        active={activeSalesDetail === "cashSales"}
                        onClick={() =>
                          toggleDetail(activeSalesDetail, "cashSales", setActiveSalesDetail)
                        }
                      />
                      <SalesMetric
                        label="Tarjeta"
                        value={formatCurrency(activeSalesSummary.cardSales)}
                        hint={`${activeSalesSummary.cardOrderDetails.length} registros`}
                        active={activeSalesDetail === "cardSales"}
                        onClick={() =>
                          toggleDetail(activeSalesDetail, "cardSales", setActiveSalesDetail)
                        }
                      />
                      <SalesMetric
                        label="Transferencia"
                        value={formatCurrency(activeSalesSummary.transferSales)}
                        hint={`${activeSalesSummary.transferOrderDetails.length} registros`}
                        active={activeSalesDetail === "transferSales"}
                        onClick={() =>
                          toggleDetail(activeSalesDetail, "transferSales", setActiveSalesDetail)
                        }
                      />
                      <SalesMetric
                        label="Productos vendidos"
                        value={activeSalesSummary.productsSold.toString()}
                      />
                      <SalesMetric
                        label="Despachos"
                        value={activeSalesSummary.dispatchCount.toString()}
                        hint={`${formatCurrency(activeSalesSummary.dispatchSales)} en ventas`}
                        active={activeSalesDetail === "dispatches"}
                        onClick={() =>
                          toggleDetail(activeSalesDetail, "dispatches", setActiveSalesDetail)
                        }
                      />
                      <SalesMetric
                        label="Retiros de dinero"
                        value={formatCurrency(activeSalesSummary.withdrawalsTotal)}
                        hint={`${activeSalesSummary.withdrawalsCount} retiro${activeSalesSummary.withdrawalsCount === 1 ? "" : "s"}`}
                        active={activeSalesDetail === "withdrawals"}
                        onClick={() =>
                          toggleDetail(activeSalesDetail, "withdrawals", setActiveSalesDetail)
                        }
                      />
                      <SalesMetric
                        label="Gastos"
                        value={formatCurrency(activeSalesSummary.expensesTotal)}
                        hint={`${activeSalesSummary.expenseDetails.length} registro${activeSalesSummary.expenseDetails.length === 1 ? "" : "s"}`}
                        active={activeSalesDetail === "expenses"}
                        onClick={() =>
                          toggleDetail(activeSalesDetail, "expenses", setActiveSalesDetail)
                        }
                      />
                      <SalesMetric
                        label="Adelantos"
                        value={formatCurrency(activeSalesSummary.advancesTotal)}
                        hint={`${activeSalesSummary.advanceDetails.length} registro${activeSalesSummary.advanceDetails.length === 1 ? "" : "s"}`}
                        active={activeSalesDetail === "advances"}
                        onClick={() =>
                          toggleDetail(activeSalesDetail, "advances", setActiveSalesDetail)
                        }
                      />
                      <SalesMetric
                        label="Pagos sueldo"
                        value={formatCurrency(activeSalesSummary.salaryPaymentsTotal)}
                        hint={`${activeSalesSummary.salaryPaymentDetails.length} registro${activeSalesSummary.salaryPaymentDetails.length === 1 ? "" : "s"}`}
                        active={activeSalesDetail === "salary"}
                        onClick={() =>
                          toggleDetail(activeSalesDetail, "salary", setActiveSalesDetail)
                        }
                      />
                      <SalesMetric
                        label="Otros retiros"
                        value={formatCurrency(activeSalesSummary.otherWithdrawalsTotal)}
                        hint={`${activeSalesSummary.otherWithdrawalDetails.length} registro${activeSalesSummary.otherWithdrawalDetails.length === 1 ? "" : "s"}`}
                        active={activeSalesDetail === "otherWithdrawals"}
                        onClick={() =>
                          toggleDetail(activeSalesDetail, "otherWithdrawals", setActiveSalesDetail)
                        }
                      />
                      <SalesMetric
                        label="Despacho cobrado"
                        value={formatCurrency(activeSalesSummary.deliveryFeesTotal)}
                        hint="Suma de delivery fee"
                      />
                    </div>

                    {activeSalesDetail ? (
                      <div className="space-y-3 rounded-2xl border border-border/70 p-4">
                        <div>
                          <p className="text-sm font-semibold">
                            {activeSalesDetail === "allOrders" && "Detalle de ventas del día"}
                            {activeSalesDetail === "cashSales" && "Detalle de ventas en efectivo"}
                            {activeSalesDetail === "cardSales" && "Detalle de ventas en tarjeta"}
                            {activeSalesDetail === "transferSales" &&
                              "Detalle de ventas en transferencia"}
                            {activeSalesDetail === "dispatches" && "Detalle de despachos"}
                            {activeSalesDetail === "withdrawals" && "Detalle de retiros"}
                            {activeSalesDetail === "expenses" && "Detalle de gastos"}
                            {activeSalesDetail === "advances" && "Detalle de adelantos"}
                            {activeSalesDetail === "salary" && "Detalle de pagos de sueldo"}
                            {activeSalesDetail === "otherWithdrawals" &&
                              "Detalle de otros retiros"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Pulsa otra tarjeta para cambiar el desglose o vuelve a pulsar para cerrar.
                          </p>
                        </div>

                        {[
                          "allOrders",
                          "cashSales",
                          "cardSales",
                          "transferSales",
                          "dispatches",
                        ].includes(activeSalesDetail) ? (
                          (() => {
                            const detailRows =
                              activeSalesDetail === "allOrders"
                                ? activeSalesSummary.allOrderDetails
                                : activeSalesDetail === "cashSales"
                                  ? activeSalesSummary.cashOrderDetails
                                  : activeSalesDetail === "cardSales"
                                    ? activeSalesSummary.cardOrderDetails
                                    : activeSalesDetail === "transferSales"
                                      ? activeSalesSummary.transferOrderDetails
                                      : activeSalesSummary.dispatchOrderDetails;

                            return detailRows.length ? (
                              <div className="space-y-3">
                                {detailRows.map((order) => (
                                  <div
                                    key={`${activeSalesDetail}-${order.id}-${order.createdAt}`}
                                    className="rounded-2xl bg-muted/10 px-4 py-3"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div className="space-y-1">
                                        <p className="text-sm font-semibold">
                                          {order.number} · {formatCurrency(order.amount)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {orderTypeLabel(order.type)} ·{" "}
                                          {paymentMethodLabel(order.paymentMethod)} ·{" "}
                                          {order.itemsCount} producto
                                          {order.itemsCount === 1 ? "" : "s"}
                                        </p>
                                      </div>
                                      <p className="text-sm text-muted-foreground">
                                        {formatDateTime(order.createdAt)}
                                      </p>
                                    </div>
                                    {order.products.length ? (
                                      <p className="mt-2 text-sm text-muted-foreground">
                                        {order.products.join(", ")}
                                      </p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                                No hay registros para este desglose en la fecha seleccionada.
                              </div>
                            );
                          })()
                        ) : (
                          (() => {
                            const detailRows =
                              activeSalesDetail === "withdrawals"
                                ? activeSalesSummary.withdrawalDetails
                                : activeSalesDetail === "expenses"
                                  ? activeSalesSummary.expenseDetails
                                  : activeSalesDetail === "advances"
                                    ? activeSalesSummary.advanceDetails
                                    : activeSalesDetail === "salary"
                                      ? activeSalesSummary.salaryPaymentDetails
                                      : activeSalesSummary.otherWithdrawalDetails;

                            return detailRows.length ? (
                              <div className="space-y-3">
                                {detailRows.map((movement) => (
                                  <div
                                    key={`${activeSalesDetail}-${movement.id}`}
                                    className="rounded-2xl bg-muted/10 px-4 py-3"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div className="space-y-1">
                                        <p className="text-sm font-semibold">
                                          {formatCurrency(movement.amount)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {cashPaymentCategoryLabel(movement.paymentCategory)}
                                        </p>
                                      </div>
                                      <p className="text-sm text-muted-foreground">
                                        {formatDateTime(movement.createdAt)}
                                      </p>
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                      {movement.reason}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                                No hay registros para este desglose en la fecha seleccionada.
                              </div>
                            );
                          })()
                        )}
                      </div>
                    ) : null}

                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
                      <div className="space-y-3 rounded-2xl border border-border/70 p-4">
                        <div>
                          <p className="text-sm font-semibold">Productos vendidos</p>
                          <p className="text-sm text-muted-foreground">
                            Ranking del día por cantidad y venta.
                          </p>
                        </div>

                        {activeSalesSummary.topProducts.length ? (
                          <div className="space-y-3">
                            {activeSalesSummary.topProducts.map((product) => (
                              <div
                                key={product.name}
                                className="flex items-center justify-between gap-3 rounded-2xl bg-muted/10 px-4 py-3"
                              >
                                <div>
                                  <p className="text-sm font-medium">{product.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {product.quantity} unidades
                                  </p>
                                </div>
                                <p className="text-sm font-semibold">
                                  {formatCurrency(product.revenue)}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                            No hay productos vendidos en la fecha seleccionada.
                          </div>
                        )}
                      </div>

                      <div className="space-y-3 rounded-2xl border border-border/70 p-4">
                        <div>
                          <p className="text-sm font-semibold">Desglose operacional</p>
                          <p className="text-sm text-muted-foreground">
                            Resumen rápido para revisar caja y ventas del día.
                          </p>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between rounded-xl bg-muted/10 px-3 py-2">
                            <span>Ventas efectivas</span>
                            <span className="font-medium">{activeSalesSummary.ordersCount}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-muted/10 px-3 py-2">
                            <span>Despachos registrados</span>
                            <span className="font-medium">{activeSalesSummary.dispatchCount}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-muted/10 px-3 py-2">
                            <span>Retiros registrados</span>
                            <span className="font-medium">{activeSalesSummary.withdrawalsCount}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-muted/10 px-3 py-2">
                            <span>Salida por gastos</span>
                            <span className="font-medium">
                              {formatCurrency(activeSalesSummary.expensesTotal)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-muted/10 px-3 py-2">
                            <span>Salida por adelantos</span>
                            <span className="font-medium">
                              {formatCurrency(activeSalesSummary.advancesTotal)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-muted/10 px-3 py-2">
                            <span>Salida por sueldos</span>
                            <span className="font-medium">
                              {formatCurrency(activeSalesSummary.salaryPaymentsTotal)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Selecciona un día con actividad para ver el resumen de ventas.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <Card className="border-border/70">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">
                    {format(currentMonth, "MMMM yyyy", { locale: es })}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {section === "movimientos"
                      ? "Selecciona un día para ver los logs guardados."
                      : "Selecciona un día para ver el resumen diario de ventas."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="rounded-full"
                    onClick={() => setCurrentMonth((value) => subMonths(value, 1))}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="rounded-full"
                    onClick={() => setCurrentMonth((value) => addMonths(value, 1))}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-7 gap-2">
                {WEEKDAY_LABELS.map((label) => (
                  <div
                    key={label}
                    className="px-2 py-1 text-center text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
                  >
                    {label}
                  </div>
                ))}

                {monthDays.map((day) => {
                  const dateKey = toDateKey(day);
                  const dayCount = activeCountMap[dateKey] ?? 0;
                  const isSelected = activeDateKey ? isSameDay(day, parseISO(activeDateKey)) : false;
                  const isCurrentMonth = isSameMonth(day, currentMonth);

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      className={cn(
                        "min-h-20 rounded-2xl border p-3 text-left transition",
                        isSelected
                          ? "border-black bg-black text-white"
                          : "border-border/70 bg-card hover:border-border hover:bg-muted/20",
                        !isCurrentMonth && "opacity-35",
                      )}
                      onClick={() => setSelectedDateKey(dateKey)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold">{format(day, "d")}</span>
                        {dayCount ? (
                          <span
                            className={cn(
                              "inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              isSelected ? "bg-white/15 text-white" : "bg-orange-100 text-orange-700",
                            )}
                          >
                            {dayCount}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </Tabs>
    </div>
  );
}
