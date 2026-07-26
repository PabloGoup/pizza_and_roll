import { Download, Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import logoUrl from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadDailyCashReportPdf } from "@/features/cash/lib/daily-cash-report-pdf";
import type { DailyCashReportData } from "@/features/cash/services/daily-cash-report-service";
import { formatCurrency, formatDateTime } from "@/lib/format";

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours ? `${hours} h ${remaining} min` : `${remaining} min`;
}

function ReportSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6">
      <h3 className="border-y border-orange-200 bg-orange-50 px-3 py-2 text-sm font-extrabold uppercase tracking-[0.08em] text-stone-900">
        {title}
      </h3>
      <div className="px-3 py-2">{children}</div>
    </section>
  );
}

function ReportRow({
  label,
  value,
  emphasized = false,
  negative = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  negative?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto] gap-6 py-1.5 ${
        emphasized ? "border-t border-stone-800 pt-2 font-extrabold" : ""
      }`}
    >
      <span>{label}</span>
      <span className={`text-right tabular-nums ${negative ? "text-red-700" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export function DailyCashReportDialog({
  report,
  onClose,
}: {
  report: DailyCashReportData | null;
  onClose: () => void;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  if (!report) return null;

  const closedAt = report.session.closedAt ?? report.generatedAt;
  const countedCash = report.session.countedAmount;
  const difference = report.session.differenceAmount ?? 0;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[94vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <div className="border-b bg-white px-6 py-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Vista previa del informe diario</DialogTitle>
            <DialogDescription>
              Documento A4 que se descargará y se adjuntará al correo del cierre.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 overflow-auto overscroll-contain bg-stone-200/70 p-4 [scrollbar-gutter:stable] sm:p-8">
          <article className="mx-auto min-h-[1018px] w-full min-w-[720px] max-w-[820px] bg-white text-[13px] leading-relaxed text-stone-900 shadow-xl">
            <header className="grid min-h-40 grid-cols-[130px_1fr_150px] items-center gap-5 bg-orange-600 px-10 py-7 text-white">
              <div className="flex justify-start">
                <div className="grid size-24 place-items-center overflow-hidden rounded-full bg-white p-1 shadow-sm">
                  <img
                    src={logoUrl}
                    alt="Logo de Pizza and Roll"
                    className="size-full rounded-full object-cover"
                  />
                </div>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black tracking-wide">PIZZA AND ROLL</p>
                <h2 className="mt-1 text-xl font-bold">Informe diario de caja</h2>
                <p className="mt-1 text-sm font-medium text-orange-50">
                  Cierre operativo · Valores expresados en pesos chilenos
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-bold">P&amp;R Ventas</p>
                <p className="mt-1 text-orange-50">Reporte gerencial</p>
              </div>
            </header>

            <div className="px-10 py-8">
              <div className="grid grid-cols-2 gap-x-10 gap-y-2 border-b border-stone-300 pb-5">
                <ReportRow label="Cajero responsable" value={report.session.cashierName} />
                <ReportRow label="Duración del turno" value={durationLabel(report.shiftDurationMinutes)} />
                <ReportRow label="Apertura de caja" value={formatDateTime(report.session.openedAt)} />
                <ReportRow label="Cierre / generación" value={formatDateTime(closedAt)} />
              </div>

              <ReportSection title="Resumen de ventas">
                <ReportRow label="Ventas en efectivo" value={formatCurrency(report.cashSales)} />
                <ReportRow label="Ventas con tarjeta" value={formatCurrency(report.cardSales)} />
                <ReportRow label="Ventas por transferencia" value={formatCurrency(report.transferSales)} />
                <ReportRow label="Total de ventas" value={formatCurrency(report.totalSales)} emphasized />
                <div className="mt-3 grid grid-cols-3 gap-6 border-t border-stone-200 pt-3">
                  <ReportRow label="Órdenes" value={String(report.ordersCount)} />
                  <ReportRow label="Ticket promedio" value={formatCurrency(report.averageTicket)} />
                  <ReportRow label="Anuladas" value={String(report.cancelledOrders)} />
                </div>
              </ReportSection>

              <ReportSection title="Caja y movimientos relevantes">
                <ReportRow label="Fondo de apertura" value={formatCurrency(report.session.openingAmount)} />
                <ReportRow label="Efectivo esperado" value={formatCurrency(report.session.expectedAmount)} />
                <ReportRow
                  label="Efectivo contado"
                  value={countedCash == null ? "Pendiente de cierre" : formatCurrency(countedCash)}
                />
                <ReportRow
                  label="Diferencia de caja"
                  value={formatCurrency(difference)}
                  negative={difference < 0}
                  emphasized
                />
                <div className="my-4 border-t border-stone-200" />
                <ReportRow label="PAGOS DE SUELDOS" value={formatCurrency(report.movementTotals.pago_sueldo)} emphasized />
                <ReportRow label="ADELANTOS" value={formatCurrency(report.movementTotals.adelanto)} emphasized />
                <ReportRow label="GASTOS" value={formatCurrency(report.movementTotals.gasto_diario)} emphasized />
                <ReportRow label="RETIROS" value={formatCurrency(report.movementTotals.retiros)} emphasized />
                <ReportRow label="Compras" value={formatCurrency(report.movementTotals.compra)} />
                <ReportRow label="Otros pagos" value={formatCurrency(report.movementTotals.otro_pago)} />
                <ReportRow
                  label="Fondo sugerido para el siguiente turno"
                  value={formatCurrency(report.suggestedNextOpening)}
                  emphasized
                />
              </ReportSection>

              <ReportSection title="Indicadores operativos">
                <div className="grid grid-cols-2 gap-x-12">
                  <ReportRow
                    label="Preparación promedio"
                    value={
                      report.averagePreparationMinutes === null
                        ? "Sin datos"
                        : `${report.averagePreparationMinutes} min`
                    }
                  />
                  <ReportRow label="Pedidos medidos" value={String(report.completedKitchenOrders)} />
                  <ReportRow label="Sobre el promedio" value={String(report.aboveAveragePreparation.length)} />
                  <ReportRow label="Hora de mayor demanda" value={report.busiestHour ?? "Sin datos"} />
                </div>
                {report.aboveAveragePreparation.length ? (
                  <div className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
                    <strong>Demoras destacadas:</strong>{" "}
                    {report.aboveAveragePreparation
                      .map((order) => `${order.number} (${order.minutes} min)`)
                      .join(" · ")}
                  </div>
                ) : null}
              </ReportSection>

              <ReportSection title="Detalle de movimientos de caja">
                {report.movements.length ? (
                  <div className="overflow-hidden border-y border-stone-200">
                    <div className="grid grid-cols-[120px_1fr_120px] bg-stone-100 px-3 py-2 font-bold">
                      <span>Fecha y hora</span>
                      <span>Motivo</span>
                      <span className="text-right">Monto</span>
                    </div>
                    {report.movements.map((movement) => (
                      <div
                        key={movement.id}
                        className="grid grid-cols-[120px_1fr_120px] gap-3 border-t border-stone-100 px-3 py-2"
                      >
                        <span className="text-stone-500">{formatDateTime(movement.createdAt)}</span>
                        <span>{movement.reason}</span>
                        <span className="text-right font-semibold tabular-nums">
                          {formatCurrency(movement.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-3 text-stone-500">No hubo movimientos manuales durante el turno.</p>
                )}
              </ReportSection>

              {report.session.differenceReason ? (
                <p className="mt-6 text-xs text-stone-500">
                  <strong>Observación de diferencia:</strong> {report.session.differenceReason}
                </p>
              ) : null}
              <footer className="mt-10 border-t border-stone-300 pt-3 text-center text-[11px] text-stone-500">
                Pizza and Roll · Informe confidencial generado por P&amp;R Ventas
              </footer>
            </div>
          </article>
        </div>

        <div className="border-t bg-white p-4">
          <Button
            className="mx-auto h-11 w-full max-w-sm rounded-xl"
            disabled={isDownloading}
            onClick={async () => {
              setIsDownloading(true);
              try {
                await downloadDailyCashReportPdf(report);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "No se pudo generar el PDF.");
              } finally {
                setIsDownloading(false);
              }
            }}
          >
            {isDownloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Descargar informe PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
