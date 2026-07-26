import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

import logoUrl from "@/assets/logo.png";
import type { DailyCashReportData } from "@/features/cash/services/daily-cash-report-service";
import {
  cashMovementLabel,
  cashPaymentCategoryLabel,
  formatCurrency,
  formatDateTime,
} from "@/lib/format";

type Rgb = [number, number, number];
type ReportRow = [string, string];

const ORANGE: Rgb = [234, 88, 12];
const ORANGE_LIGHT: Rgb = [255, 237, 213];
const STONE: Rgb = [41, 37, 36];
const MUTED: Rgb = [100, 100, 105];
const LINE: Rgb = [214, 211, 209];

async function imageDataUrl(url: string) {
  const response = await fetch(url);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours ? `${hours} h ${remaining} min` : `${remaining} min`;
}

function lastTableY(document: jsPDF) {
  return (document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;
}

function sectionBand(document: jsPDF, title: string, startY: number) {
  let y = startY;
  if (y > 268) {
    document.addPage();
    y = 20;
  }
  document.setFillColor(...ORANGE_LIGHT);
  document.setDrawColor(251, 146, 60);
  document.rect(14, y, 182, 9, "FD");
  document.setFont("helvetica", "bold");
  document.setFontSize(10);
  document.setTextColor(...STONE);
  document.text(title.toUpperCase(), 17, y + 6);
  return y + 11;
}

function accountingTable(
  document: jsPDF,
  rows: ReportRow[],
  startY: number,
  emphasizedRows: number[] = [],
) {
  autoTable(document, {
    startY,
    theme: "plain",
    margin: { left: 17, right: 17, bottom: 18 },
    body: rows,
    styles: {
      cellPadding: { top: 2, right: 1.5, bottom: 2, left: 1.5 },
      fontSize: 9.5,
      textColor: STONE,
      lineColor: LINE,
      overflow: "linebreak",
    },
    columnStyles: {
      0: { cellWidth: 124 },
      1: { cellWidth: 52, halign: "right" },
    },
    didParseCell: (data) => {
      if (emphasizedRows.includes(data.row.index)) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.lineWidth = { top: 0.35 };
      }
    },
  });
  return lastTableY(document);
}

export async function createDailyCashReportPdf(report: DailyCashReportData) {
  const document = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const closedAt = report.session.closedAt ?? report.generatedAt;
  const difference = report.session.differenceAmount ?? 0;

  document.setFillColor(...ORANGE);
  document.rect(0, 0, 210, 46, "F");
  try {
    document.setFillColor(255, 255, 255);
    document.circle(28, 23, 14, "F");
    document.addImage(await imageDataUrl(logoUrl), "PNG", 15.5, 10.5, 25, 25);
  } catch {
    document.setFillColor(255, 255, 255);
    document.circle(28, 23, 12, "F");
    document.setTextColor(...ORANGE);
    document.setFont("helvetica", "bold");
    document.setFontSize(12);
    document.text("P&R", 28, 25, { align: "center" });
  }

  document.setTextColor(255, 255, 255);
  document.setFont("helvetica", "bold");
  document.setFontSize(19);
  document.text("PIZZA AND ROLL", 112, 15, { align: "center" });
  document.setFontSize(16);
  document.text("Informe diario de caja", 112, 24, { align: "center" });
  document.setFont("helvetica", "normal");
  document.setFontSize(9);
  document.text("Cierre operativo · Valores expresados en pesos chilenos", 112, 31, {
    align: "center",
  });
  document.setFont("helvetica", "bold");
  document.setFontSize(10);
  document.text("P&R VENTAS", 194, 18, { align: "right" });
  document.setFont("helvetica", "normal");
  document.setFontSize(8.5);
  document.text("Reporte gerencial", 194, 24, { align: "right" });

  let y = 54;
  document.setTextColor(...STONE);
  autoTable(document, {
    startY: y,
    theme: "plain",
    margin: { left: 17, right: 17 },
    body: [
      ["Cajero responsable", report.session.cashierName, "Duración", durationLabel(report.shiftDurationMinutes)],
      ["Apertura de caja", formatDateTime(report.session.openedAt), "Cierre", formatDateTime(closedAt)],
    ],
    styles: { fontSize: 8.7, cellPadding: 1.8, textColor: STONE },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 31 },
      1: { cellWidth: 63 },
      2: { fontStyle: "bold", cellWidth: 24 },
      3: { cellWidth: 58, halign: "right" },
    },
  });
  y = lastTableY(document) + 4;

  y = sectionBand(document, "Resumen de ventas", y);
  y = accountingTable(
    document,
    [
      ["Ventas en efectivo", formatCurrency(report.cashSales)],
      ["Ventas con tarjeta", formatCurrency(report.cardSales)],
      ["Ventas por transferencia", formatCurrency(report.transferSales)],
      ["Total de ventas", formatCurrency(report.totalSales)],
      ["Cantidad de órdenes", String(report.ordersCount)],
      ["Ticket promedio", formatCurrency(report.averageTicket)],
      ["Ventas anuladas", String(report.cancelledOrders)],
    ],
    y,
    [3],
  ) + 4;

  y = sectionBand(document, "Caja y conciliación", y);
  y = accountingTable(
    document,
    [
      ["Fondo de apertura", formatCurrency(report.session.openingAmount)],
      ["Efectivo esperado", formatCurrency(report.session.expectedAmount)],
      [
        "Efectivo contado",
        report.session.countedAmount == null
          ? "Pendiente de cierre"
          : formatCurrency(report.session.countedAmount),
      ],
      ["Diferencia de caja", formatCurrency(difference)],
      ["Fondo sugerido para el siguiente turno", formatCurrency(report.suggestedNextOpening)],
    ],
    y,
    [3, 4],
  ) + 4;

  y = sectionBand(document, "Movimientos destacados", y);
  y = accountingTable(
    document,
    [
      ["PAGOS DE SUELDOS", formatCurrency(report.movementTotals.pago_sueldo)],
      ["ADELANTOS", formatCurrency(report.movementTotals.adelanto)],
      ["GASTOS", formatCurrency(report.movementTotals.gasto_diario)],
      ["RETIROS", formatCurrency(report.movementTotals.retiros)],
      ["Compras", formatCurrency(report.movementTotals.compra)],
      ["Otros pagos", formatCurrency(report.movementTotals.otro_pago)],
    ],
    y,
    [0, 1, 2, 3],
  ) + 4;

  y = sectionBand(document, "Indicadores operativos", y);
  y = accountingTable(
    document,
    [
      [
        "Tiempo promedio de preparación",
        report.averagePreparationMinutes === null
          ? "Sin datos"
          : `${report.averagePreparationMinutes} min`,
      ],
      ["Pedidos medidos en cocina", String(report.completedKitchenOrders)],
      ["Pedidos sobre el promedio", String(report.aboveAveragePreparation.length)],
      ["Hora de mayor demanda", report.busiestHour ?? "Sin datos"],
    ],
    y,
  ) + 4;

  if (report.aboveAveragePreparation.length) {
    y = sectionBand(document, "Pedidos con demora superior al promedio", y);
    autoTable(document, {
      startY: y,
      theme: "plain",
      margin: { left: 17, right: 17, bottom: 18 },
      head: [["Pedido", "Tiempo de preparación"]],
      body: report.aboveAveragePreparation.map((order) => [order.number, `${order.minutes} min`]),
      headStyles: { fillColor: [245, 245, 244], textColor: STONE, fontStyle: "bold" },
      styles: { fontSize: 8.5, cellPadding: 2.2 },
      columnStyles: { 1: { halign: "right" } },
    });
    y = lastTableY(document) + 4;
  }

  if (report.movements.length) {
    y = sectionBand(document, "Detalle de movimientos de caja", y);
    autoTable(document, {
      startY: y,
      margin: { left: 14, right: 14, bottom: 18 },
      head: [["Hora", "Tipo", "Motivo", "Responsable", "Monto"]],
      body: report.movements.map((movement) => [
        new Intl.DateTimeFormat("es-CL", {
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(movement.createdAt)),
        movement.paymentCategory
          ? cashPaymentCategoryLabel(movement.paymentCategory)
          : cashMovementLabel(movement.type),
        movement.reason,
        movement.performedByName,
        formatCurrency(movement.amount),
      ]),
      headStyles: { fillColor: STONE, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 250, 249] },
      styles: { fontSize: 7.5, cellPadding: 2.2, overflow: "linebreak" },
      columnStyles: {
        0: { cellWidth: 16 },
        1: { cellWidth: 27 },
        2: { cellWidth: 66 },
        3: { cellWidth: 42 },
        4: { cellWidth: 31, halign: "right" },
      },
    });
  }

  if (report.session.differenceReason) {
    const noteY = Math.min(272, lastTableY(document) + 8);
    document.setFont("helvetica", "normal");
    document.setFontSize(8);
    document.setTextColor(...MUTED);
    document.text(
      document.splitTextToSize(
        `Observación de diferencia: ${report.session.differenceReason}`,
        176,
      ),
      17,
      noteY,
    );
  }

  const pages = document.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    document.setPage(page);
    document.setDrawColor(...LINE);
    document.line(14, 283, 196, 283);
    document.setFont("helvetica", "normal");
    document.setFontSize(7.5);
    document.setTextColor(...MUTED);
    document.text(
      `Pizza and Roll · Informe confidencial · Página ${page} de ${pages}`,
      105,
      289,
      { align: "center" },
    );
  }

  return document;
}

export async function downloadDailyCashReportPdf(report: DailyCashReportData) {
  const document = await createDailyCashReportPdf(report);
  const date = (report.session.closedAt ?? report.generatedAt).slice(0, 10);
  document.save(`informe-caja-${date}.pdf`);
}
