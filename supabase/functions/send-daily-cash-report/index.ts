import { createClient } from "npm:@supabase/supabase-js@2";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Settings = {
  is_enabled: boolean;
  recipients: string[];
  sender_name: string;
  subject_prefix: string;
};

type Session = {
  id: string;
  cashier_id: string;
  opening_amount: number;
  expected_amount: number;
  expected_cash_sales_amount: number;
  expected_card_amount: number;
  expected_transfer_amount: number;
  counted_amount: number | null;
  difference_amount: number | null;
  next_opening_amount: number | null;
  difference_reason: string | null;
  opened_at: string;
  closed_at: string | null;
};

type Movement = {
  type: string;
  amount: number;
  reason: string;
  linked_order_id: string | null;
  created_at: string;
};

type Order = {
  number: string;
  status: string;
  total: number;
  created_at: string;
  kitchen_tickets:
    | { status: string; updated_at: string }
    | Array<{ status: string; updated_at: string }>
    | null;
};

type ReportData = {
  session: Session;
  cashier: string;
  settings: Settings;
  movements: Movement[];
  totalSales: number;
  ordersCount: number;
  cancelledOrders: number;
  averageTicket: number;
  suggestedOpening: number;
  averagePreparation: number | null;
  completedKitchenOrders: number;
  delayedOrders: Array<{ number: string; minutes: number }>;
  busiestHour: string | null;
  movementTotals: {
    salaries: number;
    advances: number;
    expenses: number;
    purchases: number;
    withdrawals: number;
    other: number;
  };
};

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);

const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-CL", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Santiago",
      }).format(new Date(value))
    : "Sin registrar";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

async function resolveLogoUrl(configuredUrl?: string) {
  const candidates = [
    configuredUrl,
    "https://pizza-and-roll.vercel.app/favicon.png",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of [...new Set(candidates)]) {
    try {
      const response = await fetch(candidate, { method: "HEAD" });
      if (response.ok && (response.headers.get("content-type") ?? "").startsWith("image/")) {
        return candidate;
      }
    } catch {
      // Continúa con el recurso público de respaldo.
    }
  }
  return undefined;
}

function categoryFromReason(reason: string) {
  const normalized = reason.toLowerCase();
  if (normalized.startsWith("[pago_sueldo]")) return "salaries";
  if (normalized.startsWith("[adelanto]")) return "advances";
  if (normalized.startsWith("[gasto_diario]")) return "expenses";
  if (normalized.startsWith("[compra]")) return "purchases";
  if (normalized.startsWith("[otro_pago]")) return "other";
  return "withdrawals";
}

function cleanReason(reason: string) {
  return reason.replace(/^\[[^\]]+\]\s*/u, "");
}

function ticketFor(order: Order) {
  return Array.isArray(order.kitchen_tickets)
    ? order.kitchen_tickets[0] ?? null
    : order.kitchen_tickets;
}

function minutesBetween(start: string, end: string) {
  return Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000),
  );
}

async function loadReportData(
  admin: ReturnType<typeof createClient>,
  sessionId: string,
): Promise<ReportData> {
  const { data: settings, error: settingsError } = await admin
    .from("daily_cash_report_settings")
    .select("is_enabled, recipients, sender_name, subject_prefix")
    .eq("id", true)
    .single();
  if (settingsError) throw new Error(`Configuración: ${settingsError.message}`);

  const { data: session, error: sessionError } = await admin
    .from("cash_sessions")
    .select(
      "id, cashier_id, opening_amount, expected_amount, expected_cash_sales_amount, expected_card_amount, expected_transfer_amount, counted_amount, difference_amount, next_opening_amount, difference_reason, opened_at, closed_at",
    )
    .eq("id", sessionId)
    .eq("status", "cerrada")
    .single();
  if (sessionError) throw new Error(`Cierre: ${sessionError.message}`);

  const closedAt = session.closed_at ?? new Date().toISOString();
  const [profileResult, movementsResult, ordersResult] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", session.cashier_id).single(),
    admin
      .from("cash_movements")
      .select("type, amount, reason, linked_order_id, created_at")
      .eq("session_id", sessionId)
      .is("linked_order_id", null)
      .order("created_at"),
    admin
      .from("orders")
      .select("number, status, total, created_at, kitchen_tickets(status, updated_at)")
      .gte("created_at", session.opened_at)
      .lte("created_at", closedAt)
      .order("created_at"),
  ]);
  if (profileResult.error) throw new Error(`Cajero: ${profileResult.error.message}`);
  if (movementsResult.error) throw new Error(`Movimientos: ${movementsResult.error.message}`);
  if (ordersResult.error) throw new Error(`Ventas: ${ordersResult.error.message}`);

  const movements = (movementsResult.data ?? []) as Movement[];
  const orders = (ordersResult.data ?? []) as unknown as Order[];
  const effectiveOrders = orders.filter((order) => order.status !== "cancelado");
  const totalSales = effectiveOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const movementTotals: ReportData["movementTotals"] = {
    salaries: 0,
    advances: 0,
    expenses: 0,
    purchases: 0,
    withdrawals: 0,
    other: 0,
  };
  for (const movement of movements) {
    if (movement.type !== "retiro") continue;
    movementTotals[categoryFromReason(movement.reason)] += Number(movement.amount);
  }

  const preparation = orders
    .map((order) => {
      const ticket = ticketFor(order);
      if (!ticket || ticket.status !== "listo") return null;
      return {
        number: order.number,
        minutes: minutesBetween(order.created_at, ticket.updated_at),
      };
    })
    .filter((item): item is { number: string; minutes: number } => item !== null);
  const averagePreparation = preparation.length
    ? Math.round(preparation.reduce((sum, order) => sum + order.minutes, 0) / preparation.length)
    : null;

  const hourCounts = new Map<number, number>();
  for (const order of effectiveOrders) {
    const hour = new Date(order.created_at).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }
  const busiest = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    session: session as Session,
    cashier: profileResult.data.full_name,
    settings: settings as Settings,
    movements,
    totalSales,
    ordersCount: effectiveOrders.length,
    cancelledOrders: orders.length - effectiveOrders.length,
    averageTicket: effectiveOrders.length ? totalSales / effectiveOrders.length : 0,
    suggestedOpening: Number(session.next_opening_amount ?? session.opening_amount),
    averagePreparation,
    completedKitchenOrders: preparation.length,
    delayedOrders:
      averagePreparation === null
        ? []
        : preparation
            .filter((order) => order.minutes > averagePreparation)
            .sort((a, b) => b.minutes - a.minutes),
    busiestHour: busiest
      ? `${String(busiest[0]).padStart(2, "0")}:00 - ${String((busiest[0] + 1) % 24).padStart(2, "0")}:00`
      : null,
    movementTotals,
  };
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = pdfSafe(text).split(/\s+/u);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function pdfSafe(value: string) {
  return value
    .replace(/[–—]/gu, "-")
    .replace(/[“”]/gu, '"')
    .replace(/[‘’]/gu, "'")
    .replace(/…/gu, "...")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[^\x20-\xFF]/gu, "");
}

async function createPdf(report: ReportData, logoUrl?: string) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 42;
  const contentWidth = pageSize[0] - margin * 2;
  const orange = rgb(0.92, 0.35, 0.05);
  const orangeLight = rgb(1, 0.93, 0.82);
  const dark = rgb(0.14, 0.13, 0.12);
  const muted = rgb(0.4, 0.4, 0.42);
  const rule = rgb(0.84, 0.83, 0.82);
  let page: PDFPage;
  let y: number;
  let embeddedLogo: PDFImage | null = null;

  if (logoUrl) {
    try {
      const response = await fetch(logoUrl);
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        const contentType = response.headers.get("content-type") ?? "";
        embeddedLogo = contentType.includes("jpeg") || contentType.includes("jpg")
          ? await pdf.embedJpg(bytes)
          : await pdf.embedPng(bytes);
      }
    } catch {
      embeddedLogo = null;
    }
  }

  const addPage = (withMainHeader = false) => {
    page = pdf.addPage(pageSize);
    if (withMainHeader) {
      page.drawRectangle({
        x: 0,
        y: pageSize[1] - 130,
        width: pageSize[0],
        height: 130,
        color: orange,
      });
      if (embeddedLogo) {
        page.drawCircle({
          x: 77,
          y: pageSize[1] - 65,
          size: 37,
          color: rgb(1, 1, 1),
        });
        const scaled = embeddedLogo.scaleToFit(68, 68);
        page.drawImage(embeddedLogo, {
          x: 77 - scaled.width / 2,
          y: pageSize[1] - 65 - scaled.height / 2,
          width: scaled.width,
          height: scaled.height,
        });
      } else {
        page.drawCircle({
          x: 77,
          y: pageSize[1] - 65,
          size: 34,
          color: rgb(1, 1, 1),
        });
        page.drawText("P&R", {
          x: 77 - bold.widthOfTextAtSize("P&R", 17) / 2,
          y: pageSize[1] - 71,
          font: bold,
          size: 17,
          color: orange,
        });
      }
      const titleCenter = 325;
      const brand = "PIZZA AND ROLL";
      const title = "Informe diario de caja";
      const subtitle = "Cierre operativo | Valores expresados en pesos chilenos";
      page.drawText(brand, {
        x: titleCenter - bold.widthOfTextAtSize(brand, 20) / 2,
        y: pageSize[1] - 48,
        font: bold,
        size: 20,
        color: rgb(1, 1, 1),
      });
      page.drawText(title, {
        x: titleCenter - bold.widthOfTextAtSize(title, 16) / 2,
        y: pageSize[1] - 75,
        font: bold,
        size: 16,
        color: rgb(1, 1, 1),
      });
      page.drawText(subtitle, {
        x: titleCenter - regular.widthOfTextAtSize(subtitle, 8) / 2,
        y: pageSize[1] - 94,
        font: regular,
        size: 8,
        color: rgb(1, 0.94, 0.89),
      });
      page.drawText("P&R VENTAS", {
        x: pageSize[0] - margin - bold.widthOfTextAtSize("P&R VENTAS", 10),
        y: pageSize[1] - 52,
        font: bold,
        size: 10,
        color: rgb(1, 1, 1),
      });
      page.drawText("Reporte gerencial", {
        x: pageSize[0] - margin - regular.widthOfTextAtSize("Reporte gerencial", 8),
        y: pageSize[1] - 70,
        font: regular,
        size: 8,
        color: rgb(1, 0.94, 0.89),
      });
      y = pageSize[1] - 157;
    } else {
      page.drawRectangle({
        x: 0,
        y: pageSize[1] - 16,
        width: pageSize[0],
        height: 16,
        color: orange,
      });
      y = pageSize[1] - 42;
    }
  };
  const ensure = (height: number) => {
    if (y - height < 48) addPage();
  };
  const section = (title: string) => {
    ensure(32);
    page.drawRectangle({
      x: margin,
      y: y - 5,
      width: contentWidth,
      height: 23,
      color: orangeLight,
      borderColor: rgb(0.98, 0.65, 0.35),
      borderWidth: 0.5,
    });
    page.drawText(title.toUpperCase(), {
      x: margin + 8,
      y: y + 2,
      font: bold,
      size: 10,
      color: dark,
    });
    y -= 32;
  };
  const row = (label: string, value: string, emphasized = false) => {
    const labelFont = emphasized ? bold : regular;
    const valueFont = emphasized ? bold : regular;
    const size = emphasized ? 10.5 : 9.5;
    const labelLines = wrap(label, labelFont, size, contentWidth - 150);
    const valueLines = wrap(value, valueFont, size, 140);
    const rowHeight = Math.max(labelLines.length, valueLines.length) * 13 + 6;
    ensure(rowHeight + (emphasized ? 4 : 0));
    if (emphasized) {
      page.drawLine({
        start: { x: margin + 7, y: y + 5 },
        end: { x: pageSize[0] - margin - 7, y: y + 5 },
        thickness: 0.7,
        color: dark,
      });
    }
    labelLines.forEach((lineText, index) => {
      page.drawText(lineText, {
        x: margin + 8,
        y: y - index * 13,
        font: labelFont,
        size,
        color: dark,
      });
    });
    valueLines.forEach((lineText, index) => {
      page.drawText(lineText, {
        x: pageSize[0] - margin - 8 - valueFont.widthOfTextAtSize(lineText, size),
        y: y - index * 13,
        font: valueFont,
        size,
        color: dark,
      });
    });
    y -= rowHeight;
  };
  const note = (text: string) => {
    const lines = wrap(text, regular, 8.5, contentWidth - 16);
    ensure(lines.length * 12 + 12);
    page.drawRectangle({
      x: margin + 4,
      y: y - lines.length * 12 - 3,
      width: contentWidth - 8,
      height: lines.length * 12 + 12,
      color: rgb(0.98, 0.98, 0.97),
    });
    lines.forEach((lineText, index) => {
      page.drawText(lineText, {
        x: margin + 11,
        y: y - index * 12,
        font: regular,
        size: 8.5,
        color: muted,
      });
    });
    y -= lines.length * 12 + 18;
  };

  addPage(true);
  const identityRows: Array<[string, string, string, string]> = [
    [
      "Cajero responsable",
      report.cashier,
      "Duración",
      `${minutesBetween(report.session.opened_at, report.session.closed_at ?? new Date().toISOString())} min`,
    ],
    [
      "Apertura de caja",
      dateTime(report.session.opened_at),
      "Cierre",
      dateTime(report.session.closed_at),
    ],
  ];
  for (const [leftLabel, leftValue, rightLabel, rightValue] of identityRows) {
    const safeLeftLabel = pdfSafe(leftLabel);
    const safeLeftValue = pdfSafe(leftValue);
    const safeRightLabel = pdfSafe(rightLabel);
    const safeRightValue = pdfSafe(rightValue);
    page.drawText(safeLeftLabel, { x: margin, y, font: bold, size: 8.5, color: dark });
    page.drawText(safeLeftValue, { x: margin + 88, y, font: regular, size: 8.5, color: dark });
    page.drawText(safeRightLabel, { x: 340, y, font: bold, size: 8.5, color: dark });
    page.drawText(safeRightValue, {
      x: pageSize[0] - margin - regular.widthOfTextAtSize(safeRightValue, 8.5),
      y,
      font: regular,
      size: 8.5,
      color: dark,
    });
    y -= 17;
  }
  page.drawLine({
    start: { x: margin, y: y + 5 },
    end: { x: pageSize[0] - margin, y: y + 5 },
    thickness: 0.5,
    color: rule,
  });
  y -= 13;

  section("Resumen de ventas");
  row("Ventas en efectivo", money(report.session.expected_cash_sales_amount));
  row("Ventas con tarjeta", money(report.session.expected_card_amount));
  row("Ventas por transferencia", money(report.session.expected_transfer_amount));
  row("Total de ventas", money(report.totalSales), true);
  row("Cantidad de órdenes", String(report.ordersCount));
  row("Ticket promedio", money(report.averageTicket));
  row("Ventas anuladas", String(report.cancelledOrders));

  section("Caja y conciliación");
  row("Fondo de apertura", money(report.session.opening_amount));
  row("Efectivo esperado", money(report.session.expected_amount));
  row(
    "Efectivo contado",
    report.session.counted_amount === null ? "Sin registrar" : money(report.session.counted_amount),
  );
  row("Diferencia de caja", money(report.session.difference_amount ?? 0), true);
  row("Fondo sugerido para el siguiente turno", money(report.suggestedOpening), true);
  if (report.session.difference_reason) {
    note(`Motivo de diferencia: ${report.session.difference_reason}`);
  }

  section("Movimientos destacados");
  row("PAGOS DE SUELDOS", money(report.movementTotals.salaries), true);
  row("ADELANTOS", money(report.movementTotals.advances), true);
  row("GASTOS", money(report.movementTotals.expenses), true);
  row("RETIROS", money(report.movementTotals.withdrawals), true);
  row("Compras", money(report.movementTotals.purchases));
  row("Otros pagos", money(report.movementTotals.other));

  section("Indicadores operativos");
  row(
    "Tiempo promedio de preparación",
    report.averagePreparation === null ? "Sin datos" : `${report.averagePreparation} min`,
  );
  row("Pedidos medidos en cocina", String(report.completedKitchenOrders));
  row("Pedidos sobre el promedio", String(report.delayedOrders.length));
  row("Hora con mayor demanda", report.busiestHour ?? "Sin datos");
  if (report.delayedOrders.length) {
    note(
      `Demoras destacadas: ${report.delayedOrders
        .map((order) => `${order.number} (${order.minutes} min)`)
        .join(" | ")}`,
    );
  }

  section("Detalle de movimientos de caja");
  if (!report.movements.length) {
    row("Movimientos manuales", "No hubo movimientos durante el turno");
  } else {
    for (const movement of report.movements) {
      const detail = `${movement.type.toUpperCase()} | ${cleanReason(movement.reason)}`;
      row(`${dateTime(movement.created_at)} · ${detail}`, money(Number(movement.amount)));
    }
  }

  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    current.drawLine({
      start: { x: margin, y: 32 },
      end: { x: pageSize[0] - margin, y: 32 },
      thickness: 0.5,
      color: rule,
    });
    const footer = `Pizza and Roll | Informe confidencial | Página ${index + 1} de ${pages.length}`;
    current.drawText(footer, {
      x: pageSize[0] / 2 - regular.widthOfTextAtSize(footer, 8) / 2,
      y: 19,
      font: regular,
      size: 8,
      color: muted,
    });
  });
  return pdf.save();
}

function createEmailHtml(report: ReportData, logoUrl?: string) {
  const delay =
    report.averagePreparation === null
      ? "Sin datos suficientes"
      : `${report.averagePreparation} minutos`;
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f6f4f1;font-family:Arial,sans-serif;color:#171717">
    <div style="max-width:680px;margin:0 auto;padding:28px 16px">
      <div style="background:#171717;color:white;border-radius:18px 18px 0 0;padding:28px">
        <div style="display:flex;align-items:center;gap:14px">
          ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" width="52" height="52" alt="Pizza and Roll" style="border-radius:50%;object-fit:cover">` : ""}
          <div style="font-size:24px;font-weight:800">P&amp;R VENTAS</div>
        </div>
        <div style="margin-top:6px;color:#d9d9d9">Informe diario de cierre de caja</div>
      </div>
      <div style="background:white;border-radius:0 0 18px 18px;padding:28px">
        <p>Hola,</p>
        <p>La caja del turno de <strong>${escapeHtml(report.cashier)}</strong> fue cerrada correctamente. Adjuntamos el informe completo en PDF.</p>
        <table role="presentation" style="width:100%;border-collapse:collapse;margin:22px 0">
          <tr><td style="padding:10px;border-bottom:1px solid #eee">Total de ventas</td><td style="padding:10px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${money(report.totalSales)}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #eee">Efectivo</td><td style="padding:10px;border-bottom:1px solid #eee;text-align:right">${money(report.session.expected_cash_sales_amount)}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #eee">Tarjeta</td><td style="padding:10px;border-bottom:1px solid #eee;text-align:right">${money(report.session.expected_card_amount)}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #eee">Transferencia</td><td style="padding:10px;border-bottom:1px solid #eee;text-align:right">${money(report.session.expected_transfer_amount)}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #eee"><strong>Pagos de sueldos</strong></td><td style="padding:10px;border-bottom:1px solid #eee;text-align:right"><strong>${money(report.movementTotals.salaries)}</strong></td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #eee"><strong>Adelantos</strong></td><td style="padding:10px;border-bottom:1px solid #eee;text-align:right"><strong>${money(report.movementTotals.advances)}</strong></td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #eee"><strong>Gastos</strong></td><td style="padding:10px;border-bottom:1px solid #eee;text-align:right"><strong>${money(report.movementTotals.expenses)}</strong></td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #eee"><strong>Retiros</strong></td><td style="padding:10px;border-bottom:1px solid #eee;text-align:right"><strong>${money(report.movementTotals.withdrawals)}</strong></td></tr>
        </table>
        <div style="background:#fff6ed;border:1px solid #fed7aa;border-radius:12px;padding:16px">
          <strong>Operación:</strong> ${report.ordersCount} ventas · ticket promedio ${money(report.averageTicket)} · preparación promedio ${delay}.<br>
          <strong>Próximo fondo sugerido:</strong> ${money(report.suggestedOpening)}.
        </div>
        <p style="margin-top:24px;color:#666;font-size:13px">Apertura: ${dateTime(report.session.opened_at)}<br>Cierre: ${dateTime(report.session.closed_at)}</p>
      </div>
    </div>
  </body>
</html>`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("DAILY_REPORT_FROM_EMAIL");
  const logoUrl = await resolveLogoUrl(Deno.env.get("DAILY_REPORT_LOGO_URL"));
  if (!url || !anonKey || !serviceKey || !resendKey || !fromEmail) {
    return Response.json(
      { ok: false, error: "Faltan secretos del servicio de informes diarios." },
      { status: 500, headers: corsHeaders },
    );
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const admin = createClient(url, serviceKey);

  let sessionId = "";
  try {
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) throw new Error("Sesión de usuario no válida.");
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role, is_active")
      .eq("id", authData.user.id)
      .single();
    if (
      profileError ||
      !profile?.is_active ||
      !["administrador", "cajero"].includes(profile.role)
    ) {
      throw new Error("No tienes permisos para enviar informes de caja.");
    }

    const body = await request.json();
    sessionId = String(body?.sessionId ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(sessionId)) {
      throw new Error("El identificador de cierre no es válido.");
    }

    const report = await loadReportData(admin, sessionId);
    if (!report.settings.is_enabled || !report.settings.recipients.length) {
      await admin
        .from("daily_cash_report_deliveries")
        .update({
          status: "skipped",
          recipients: report.settings.recipients,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("session_id", sessionId);
      return Response.json(
        { ok: true, status: "skipped" },
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: existingDelivery } = await admin
      .from("daily_cash_report_deliveries")
      .select("attempts")
      .eq("session_id", sessionId)
      .maybeSingle();
    await admin
      .from("daily_cash_report_deliveries")
      .upsert(
        {
          session_id: sessionId,
          status: "processing",
          recipients: report.settings.recipients,
          attempts: Number(existingDelivery?.attempts ?? 0) + 1,
          last_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "session_id" },
      );

    const pdf = await createPdf(report, logoUrl);
    const base64 = btoa(
      Array.from(pdf, (byte) => String.fromCharCode(byte)).join(""),
    );
    const day = new Intl.DateTimeFormat("es-CL", {
      dateStyle: "medium",
      timeZone: "America/Santiago",
    }).format(new Date(report.session.closed_at ?? Date.now()));
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${report.settings.sender_name} <${fromEmail}>`,
        to: report.settings.recipients,
        subject: `${report.settings.subject_prefix} · ${day} · ${report.cashier}`,
        html: createEmailHtml(report, logoUrl),
        attachments: [
          {
            filename: `informe-cierre-${day.replace(/[^\d-]/gu, "-")}.pdf`,
            content: base64,
          },
        ],
      }),
    });
    const resendData = await resendResponse.json();
    if (!resendResponse.ok) {
      throw new Error(resendData?.message ?? "El proveedor de correo rechazó el envío.");
    }

    await admin
      .from("daily_cash_report_deliveries")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: resendData.id ?? null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId);

    return Response.json(
      { ok: true, status: "sent", messageId: resendData.id },
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado.";
    if (sessionId) {
      const { data: current } = await admin
        .from("daily_cash_report_deliveries")
        .select("attempts")
        .eq("session_id", sessionId)
        .maybeSingle();
      await admin
        .from("daily_cash_report_deliveries")
        .upsert(
          {
            session_id: sessionId,
            status: "failed",
            attempts: Math.max(1, Number(current?.attempts ?? 0)),
            last_error: message.slice(0, 1000),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "session_id" },
        );
    }
    return Response.json(
      { ok: false, error: message },
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
