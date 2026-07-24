import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSelectedPrintStationId } from "@/features/printing/lib/print-station";
import { formatCurrency, formatDateTime, orderTypeLabel, paymentMethodLabel } from "@/lib/format";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { CashReport } from "@/types/domain";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function MoneyColumn({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/20 px-3 py-2.5">
      <p className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-base font-semibold tabular-nums">
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function reportHtml(report: CashReport, paperWidth: number) {
  const printableWidth = paperWidth === 80 ? 72 : 48;
  const cashierRows = report.cashierSummaries.map((cashier) => `
    <section><b>${escapeHtml(cashier.cashierName)}</b><br>
    ${cashier.ordersCount} ventas
    <div class="money-column"><span>Total</span><b>${formatCurrency(cashier.total)}</b></div>
    <div class="money-column"><span>Efectivo</span><b>${formatCurrency(cashier.cash)}</b></div>
    <div class="money-column"><span>Tarjeta</span><b>${formatCurrency(cashier.card)}</b></div>
    <div class="money-column"><span>Debito</span><b>${formatCurrency(cashier.debit)}</b></div>
    <div class="money-column"><span>Credito</span><b>${formatCurrency(cashier.credit)}</b></div>
    ${cashier.unclassifiedCard ? `<div class="money-column"><span>Sin clasificar</span><b>${formatCurrency(cashier.unclassifiedCard)}</b></div>` : ""}
    <div class="money-column"><span>Transferencia</span><b>${formatCurrency(cashier.transfer)}</b></div>
    </section>
  `).join("");
  const orderRows = report.orders.map((order) => `
    <div class="order"><b>${escapeHtml(order.orderNumber)}</b><br>
    ${orderTypeLabel(order.orderType)} · ${paymentMethodLabel(order.paymentMethod)} · ${escapeHtml(order.cashierName ?? "Usuario")}<br>
    <small>${escapeHtml((order.products ?? []).join(", ") || "Sin detalle")}</small>
    <div class="money-column"><span>Total venta</span><b>${formatCurrency(order.total)}</b></div></div>
  `).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${report.reportNumber}</title>
  <style>
    @page { size: ${paperWidth}mm auto; margin: 2mm; }
    * { box-sizing: border-box; }
    body { width: ${printableWidth}mm; margin: 0 auto; color:#000; font: 10px/1.28 "Courier New", monospace; }
    h1 { font-size: 15px; text-align:center; margin:0 0 3px; }
    .center { text-align:center; } .line { border-top:1px dashed #000; margin:5px 0; }
    .money-column { display:block; margin-top:4px; padding:3px 0; border-top:1px dotted #999; }
    .money-column span,.money-column b { display:block; overflow-wrap:anywhere; }
    .money-column b { margin-top:1px; font-size:11px; }
    section,.order { border-top:1px dashed #000; padding:5px 0; }
    small { font-size:8px; }
  </style></head><body>
  <h1>${report.type === "CUADRATURA" ? "CUADRATURA DE CAJA" : `CORTE ${report.type}`}</h1>
  <div class="center">${escapeHtml(report.reportNumber)}<br>${formatDateTime(report.generatedAt)}</div>
  <div class="line"></div>
  <div class="money-column"><span>Apertura</span><b>${formatCurrency(report.openingAmount)}</b></div>
  <div class="money-column"><span>Ventas (${report.ordersCount})</span><b>${formatCurrency(report.totalSales)}</b></div>
  <div class="money-column"><span>Efectivo</span><b>${formatCurrency(report.cashTotal)}</b></div>
  <div class="money-column"><span>Tarjeta</span><b>${formatCurrency(report.cardTotal)}</b></div>
  <div class="money-column"><span>Debito</span><b>${formatCurrency(report.debitTotal)}</b></div>
  <div class="money-column"><span>Credito</span><b>${formatCurrency(report.creditTotal)}</b></div>
  ${report.unclassifiedCardTotal ? `<div class="money-column"><span>Sin clasificar</span><b>${formatCurrency(report.unclassifiedCardTotal)}</b></div>` : ""}
  <div class="money-column"><span>Transferencia</span><b>${formatCurrency(report.transferTotal)}</b></div>
  <div class="line"></div>
  <div class="money-column"><span>Local</span><b>${formatCurrency(report.localTotal)}</b></div>
  <div class="money-column"><span>Retiro</span><b>${formatCurrency(report.pickupTotal)}</b></div>
  <div class="money-column"><span>Despacho</span><b>${formatCurrency(report.deliveryTotal)}</b></div>
  ${report.type === "CUADRATURA" ? `
    <div class="line"></div>
    <div class="money-column"><span>Esperado caja</span><b>${formatCurrency(report.expectedCashAmount)}</b></div>
    <div class="money-column"><span>Contado caja</span><b>${formatCurrency(report.countedCashAmount ?? 0)}</b></div>
    <div class="money-column"><span>Diferencia</span><b>${formatCurrency(report.differenceAmount ?? 0)}</b></div>
    <div class="money-column"><span>Fondo siguiente</span><b>${formatCurrency(report.nextOpeningAmount ?? 0)}</b></div>
    ${report.differenceReason ? `<div>Motivo: ${escapeHtml(report.differenceReason)}</div>` : ""}
  ` : ""}
  <h2>Cajeros</h2>${cashierRows}
  ${report.type === "X" ? "" : `<h2>Ventas</h2>${orderRows}`}
  <div class="line"></div><div class="center">Generado por ${escapeHtml(report.generatedByName)}</div>
  <script>window.onload=()=>{window.print();}</script></body></html>`;
}

async function printReport(report: CashReport) {
  let paperWidth = 58;
  const agentId = getSelectedPrintStationId();
  if (agentId) {
    const { data } = await getSupabaseClient()
      .from("print_agents")
      .select("paper_width")
      .eq("id", agentId)
      .maybeSingle();
    paperWidth = Number(data?.paper_width ?? 58);
  }
  const popup = window.open("", "_blank", "width=520,height=760");
  if (!popup) throw new Error("El navegador bloqueó la ventana de impresión.");
  popup.document.write(reportHtml(report, paperWidth));
  popup.document.close();
}

export function CashReportDialog({
  report,
  onClose,
}: {
  report: CashReport | null;
  onClose: () => void;
}) {
  if (!report) return null;
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[92vh] max-w-[760px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {report.type === "CUADRATURA" ? "Reporte de cuadratura" : `Corte ${report.type}`}
          </DialogTitle>
          <DialogDescription>
            {report.reportNumber} · {formatDateTime(report.generatedAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2">
          {[
            ["Ventas", report.totalSales],
            ["Efectivo", report.cashTotal],
            ["Tarjeta", report.cardTotal],
            ["Transferencia", report.transferTotal],
          ].map(([label, value]) => (
            <div key={String(label)} className="min-w-0 rounded-2xl border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 break-words text-lg font-semibold tabular-nums">
                {formatCurrency(Number(value))}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">Totales por cajero</p>
          {report.cashierSummaries.map((cashier) => (
            <div key={cashier.cashierId} className="rounded-2xl border border-border/70 p-4">
              <div>
                <p className="font-medium">{cashier.cashierName}</p>
                <p className="text-xs text-muted-foreground">{cashier.ordersCount} ventas</p>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <MoneyColumn label="Total" value={cashier.total} />
                <MoneyColumn label="Efectivo" value={cashier.cash} />
                <MoneyColumn label="Tarjeta" value={cashier.card} />
                <MoneyColumn label="Transferencia" value={cashier.transfer} />
                <MoneyColumn label="Débito" value={cashier.debit} />
                <MoneyColumn label="Crédito" value={cashier.credit} />
                {cashier.unclassifiedCard ? (
                  <MoneyColumn label="Sin clasificar" value={cashier.unclassifiedCard} />
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {report.type !== "X" ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Detalle resumido de ventas</p>
            {report.orders.map((order) => (
              <div key={order.orderId} className="rounded-xl border border-border/70 px-3 py-2 text-xs">
                <p className="font-medium">{order.orderNumber} · {order.cashierName}</p>
                <p className="mt-1 text-muted-foreground">
                  {orderTypeLabel(order.orderType)} · {paymentMethodLabel(order.paymentMethod)}
                  {order.cardType ? ` (${order.cardType === "debito" ? "Débito" : "Crédito"})` : ""} · {(order.products ?? []).join(", ")}
                </p>
                <div className="mt-2">
                  <MoneyColumn label="Total venta" value={order.total} />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <Button className="h-11 w-full rounded-2xl" onClick={() => void printReport(report)}>
          <Printer className="size-4" /> Imprimir en formato térmico
        </Button>
      </DialogContent>
    </Dialog>
  );
}
