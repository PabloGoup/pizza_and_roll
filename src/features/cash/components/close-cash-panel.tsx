import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  formatCurrency,
  formatShortTime,
  orderTypeLabel,
  paymentMethodLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CashCloseInput, CashCloseSummary } from "@/types/domain";

const schema = z.object({
  countedAmount: z.coerce.number().min(0, "Ingresa un monto válido."),
  countedCardAmount: z.coerce.number().min(0, "Ingresa un monto válido."),
  countedTransferAmount: z.coerce.number().min(0, "Ingresa un monto válido."),
  notes: z.string().max(300, "Máximo 300 caracteres.").optional(),
});

type Values = z.input<typeof schema>;
type SubmitValues = z.output<typeof schema>;

function differenceTone(value: number) {
  if (value === 0) {
    return "text-emerald-600";
  }

  return value > 0 ? "text-sky-600" : "text-rose-500";
}

export function CloseCashPanel({
  summary,
  isLoadingSummary,
  onSubmit,
  isPending,
  paymentUpdatePending,
  onCancel,
  onUpdateOrderPaymentMethod,
}: {
  summary: CashCloseSummary | null | undefined;
  isLoadingSummary: boolean;
  onSubmit: (values: CashCloseInput) => Promise<unknown>;
  isPending: boolean;
  paymentUpdatePending: boolean;
  onCancel: () => void;
  onUpdateOrderPaymentMethod: (
    orderId: string,
    paymentMethod: "efectivo" | "tarjeta" | "transferencia",
  ) => Promise<unknown>;
}) {
  const [requiresForceConfirmation, setRequiresForceConfirmation] = useState(false);
  const [expandedMethod, setExpandedMethod] = useState<"efectivo" | "tarjeta" | "transferencia" | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<Values, unknown, SubmitValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      countedAmount: 0,
      countedCardAmount: 0,
      countedTransferAmount: 0,
      notes: "",
    },
  });

  useEffect(() => {
    if (!summary) {
      return;
    }

    reset({
      countedAmount: summary.cash.expectedAmount,
      countedCardAmount: summary.card.expectedAmount,
      countedTransferAmount: summary.transfer.expectedAmount,
      notes: "",
    });
    setRequiresForceConfirmation(false);
    setExpandedMethod(null);
  }, [reset, summary]);

  const countedAmount = Number(watch("countedAmount") ?? 0);
  const countedCardAmount = Number(watch("countedCardAmount") ?? 0);
  const countedTransferAmount = Number(watch("countedTransferAmount") ?? 0);

  const liveSummary = useMemo(() => {
    if (!summary) {
      return null;
    }

    const cashDifference = countedAmount - summary.cash.expectedAmount;
    const cardDifference = countedCardAmount - summary.card.expectedAmount;
    const transferDifference = countedTransferAmount - summary.transfer.expectedAmount;

    return {
      cashDifference,
      cardDifference,
      transferDifference,
      totalReviewedAmount: countedAmount + countedCardAmount + countedTransferAmount,
      totalDifferenceAmount: cashDifference + cardDifference + transferDifference,
      hasDifferences:
        cashDifference !== 0 || cardDifference !== 0 || transferDifference !== 0,
    };
  }, [countedAmount, countedCardAmount, countedTransferAmount, summary]);

  const submit = handleSubmit(async (values) => {
    if (liveSummary?.hasDifferences && !requiresForceConfirmation) {
      setRequiresForceConfirmation(true);
      return;
    }

    await onSubmit({
      countedAmount: values.countedAmount,
      countedCardAmount: values.countedCardAmount,
      countedTransferAmount: values.countedTransferAmount,
      notes: values.notes,
      forceCloseWithDifferences: liveSummary?.hasDifferences ?? false,
    });
    setRequiresForceConfirmation(false);
  });

  const paymentRows = summary
    ? [
        {
          method: "efectivo" as const,
          label: "Efectivo",
          count: summary.cash.salesCount,
          salesAmount: summary.cash.salesAmount,
          adjustments: summary.cashBaseAmount,
          expectedAmount: summary.cash.expectedAmount,
          differenceAmount: liveSummary?.cashDifference ?? 0,
          fieldId: "countedAmount",
          helper: "Caja física contada al cierre",
          orders: summary.cash.orders,
        },
        {
          method: "tarjeta" as const,
          label: "Tarjeta",
          count: summary.card.salesCount,
          salesAmount: summary.card.salesAmount,
          adjustments: null,
          expectedAmount: summary.card.expectedAmount,
          differenceAmount: liveSummary?.cardDifference ?? 0,
          fieldId: "countedCardAmount",
          helper: "Total revisado en el POS",
          orders: summary.card.orders,
        },
        {
          method: "transferencia" as const,
          label: "Transferencia",
          count: summary.transfer.salesCount,
          salesAmount: summary.transfer.salesAmount,
          adjustments: null,
          expectedAmount: summary.transfer.expectedAmount,
          differenceAmount: liveSummary?.transferDifference ?? 0,
          fieldId: "countedTransferAmount",
          helper: "Total revisado en la cuenta bancaria",
          orders: summary.transfer.orders,
        },
      ]
    : [];

  return (
    <section className="space-y-5 rounded-3xl border border-border/70 bg-card/80 p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Cierre de caja</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Revisa los montos registrados por la app y compara con el efectivo contado, el POS y la
            cuenta bancaria antes de cerrar.
          </p>
        </div>
        <Button variant="outline" className="rounded-full" onClick={onCancel} type="button">
          Cancelar
        </Button>
      </div>

      {isLoadingSummary || !summary || !liveSummary ? (
        <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
          Cargando conciliación del turno...
        </div>
      ) : (
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Ventas turno</p>
              <p className="mt-2 text-2xl font-semibold">{formatCurrency(summary.totalSalesAmount)}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Base caja</p>
              <p className="mt-2 text-2xl font-semibold">{formatCurrency(summary.cashBaseAmount)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Apertura {formatCurrency(summary.openingAmount)} + ingresos manuales{" "}
                {formatCurrency(summary.manualIncomeAmount)} - retiros{" "}
                {formatCurrency(summary.manualExpenseAmount)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Monto revisado</p>
              <p className="mt-2 text-2xl font-semibold">{formatCurrency(liveSummary.totalReviewedAmount)}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Diferencia total</p>
              <p className={cn("mt-2 text-2xl font-semibold", differenceTone(liveSummary.totalDifferenceAmount))}>
                {formatCurrency(liveSummary.totalDifferenceAmount)}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/70">
            <div className="overflow-x-auto">
              <div className="min-w-[980px]">
                <div className="grid grid-cols-[1.5fr_0.7fr_1fr_1fr_1fr_1.2fr] gap-4 border-b border-border/70 bg-muted/30 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  <span>Medio</span>
                  <span>Operaciones</span>
                  <span>Ventas app</span>
                  <span>Base / ajustes</span>
                  <span>Esperado app</span>
                  <span>Revisado / diferencia</span>
                </div>

                {paymentRows.map((row) => (
                  <div key={row.fieldId} className="border-b border-border/70 last:border-b-0">
                    <div className="grid grid-cols-[1.5fr_0.7fr_1fr_1fr_1fr_1.2fr] gap-4 px-4 py-4">
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{row.label}</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.helper}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className="rounded-full"
                            onClick={() =>
                              setExpandedMethod((current) =>
                                current === row.method ? null : row.method,
                              )
                            }
                          >
                            {expandedMethod === row.method ? (
                              <ChevronUp className="size-3.5" />
                            ) : (
                              <ChevronDown className="size-3.5" />
                            )}
                            {expandedMethod === row.method ? "Ocultar" : "Ver detalle"}
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center text-sm">{row.count}</div>
                      <div className="flex items-center text-sm font-medium">
                        {formatCurrency(row.salesAmount)}
                      </div>
                      <div className="flex items-center text-sm text-muted-foreground">
                        {row.adjustments === null ? "—" : formatCurrency(row.adjustments)}
                      </div>
                      <div className="flex items-center text-sm font-medium">
                        {formatCurrency(row.expectedAmount)}
                      </div>
                      <div className="space-y-2">
                        <Input
                          id={row.fieldId}
                          type="number"
                          min={0}
                          step={500}
                          className="h-11 rounded-xl"
                          {...register(row.fieldId as keyof SubmitValues, { valueAsNumber: true })}
                        />
                        <p className={cn("text-xs font-medium", differenceTone(row.differenceAmount))}>
                          Diferencia: {formatCurrency(row.differenceAmount)}
                        </p>
                      </div>
                    </div>

                    {expandedMethod === row.method ? (
                      <div className="border-t border-border/70 bg-muted/20 px-4 py-4">
                        {row.orders.length ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-[0.9fr_0.9fr_1fr_0.8fr_1.1fr_0.9fr] gap-3 px-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                              <span>Pedido</span>
                              <span>Hora</span>
                              <span>Tipo</span>
                              <span>Monto</span>
                              <span>Método</span>
                              <span className="text-right">Acción</span>
                            </div>

                            {row.orders.map((order) => (
                              <div
                                key={`${row.method}-${order.orderId}`}
                                className="grid grid-cols-[0.9fr_0.9fr_1fr_0.8fr_1.1fr_0.9fr] items-center gap-3 rounded-2xl border border-border/70 bg-background px-3 py-3"
                              >
                                <div>
                                  <p className="font-medium">{order.orderNumber}</p>
                                  <p className="text-xs text-muted-foreground">{order.cashierName}</p>
                                </div>
                                <div className="text-sm">{formatShortTime(order.createdAt)}</div>
                                <div className="text-sm">{orderTypeLabel(order.orderType)}</div>
                                <div className="text-sm font-medium">{formatCurrency(order.amount)}</div>
                                <Select
                                  value={
                                    order.paymentMethod === "mixto"
                                      ? row.method
                                      : order.paymentMethod
                                  }
                                  onValueChange={(value) => {
                                    void onUpdateOrderPaymentMethod(
                                      order.orderId,
                                      value as "efectivo" | "tarjeta" | "transferencia",
                                    );
                                  }}
                                  disabled={paymentUpdatePending}
                                >
                                  <SelectTrigger className="h-10 rounded-xl">
                                    <SelectValue placeholder="Método" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="efectivo">
                                      {paymentMethodLabel("efectivo")}
                                    </SelectItem>
                                    <SelectItem value="tarjeta">
                                      {paymentMethodLabel("tarjeta")}
                                    </SelectItem>
                                    <SelectItem value="transferencia">
                                      {paymentMethodLabel("transferencia")}
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <div className="text-right text-xs text-muted-foreground">
                                  Corrige si el cobro quedó mal registrado.
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No hay ventas registradas en este medio para el turno actual.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {errors.countedAmount || errors.countedCardAmount || errors.countedTransferAmount ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              Revisa los montos ingresados antes de continuar.
            </div>
          ) : null}

          {liveSummary.hasDifferences ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Hay diferencias entre lo revisado y lo registrado por la app. Si continúas, el cierre
              guardará esas diferencias para auditoría.
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Los tres medios cuadran con los montos registrados por la app.
            </div>
          )}

          {requiresForceConfirmation && liveSummary.hasDifferences ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
                <div className="space-y-3">
                  <div>
                    <p className="font-medium text-amber-900">Confirma cierre con diferencias</p>
                    <p className="text-sm text-amber-800">
                      El efectivo, las tarjetas o las transferencias no cuadran con lo registrado
                      por la app. Si continúas, el cierre quedará guardado con diferencias.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      className="rounded-xl"
                      disabled={isPending}
                    >
                      {isPending ? "Cerrando..." : "Sí, continuar con diferencias"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      disabled={isPending}
                      onClick={() => setRequiresForceConfirmation(false)}
                    >
                      Volver a revisar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="closeNotes">Notas del cierre</Label>
            <Textarea
              id="closeNotes"
              placeholder="Observaciones del cierre de caja"
              className="min-h-24 rounded-2xl"
              {...register("notes")}
            />
            {errors.notes ? <p className="text-xs text-rose-400">{errors.notes.message}</p> : null}
          </div>

          <div className="flex justify-end">
            <Button type="submit" className="h-11 rounded-2xl px-8" disabled={isPending}>
              {isPending ? "Cerrando..." : "Cerrar caja"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
