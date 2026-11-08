import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getSelectedPrintStationId } from "@/features/printing/lib/print-station";

export async function enqueueCashReportLines(lines: string[]) {
  const { error } = await getSupabaseClient().rpc("enqueue_cash_report", {
    p_payload: { lines: lines.map((line) => line.trim()).filter(Boolean) },
    p_agent_id: getSelectedPrintStationId(),
  });
  if (error) throw new Error(`No se pudo enviar el reporte a caja: ${error.message}`);
  toast.success("Reporte enviado a la impresora de caja.");
}

export function reportHtmlLines(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style").forEach((node) => node.remove());
  doc.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  doc.querySelectorAll("div, section, h1, h2, p").forEach((node) => node.append("\n"));
  return (doc.body.textContent ?? "").split("\n");
}
