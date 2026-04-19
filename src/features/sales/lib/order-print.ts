import {
  formatCurrency,
  formatDateTime,
  orderStatusLabel,
  orderTypeLabel,
  paymentMethodLabel,
} from "@/lib/format";
import type { Order } from "@/types/domain";

export type PrintMode = "ticket" | "kitchen";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderOrderItems(order: Order, mode: PrintMode) {
  return order.items
    .map((item) => {
      const modifiers = item.modifiers.length
        ? `<div class="subline">${item.modifiers
            .map((modifier) => `+ ${escapeHtml(modifier.name)}`)
            .join("<br />")}</div>`
        : "";
      const notes = item.notes ? `<div class="subline">Obs: ${escapeHtml(item.notes)}</div>` : "";
      const variant = item.variantName
        ? `<div class="subline">${escapeHtml(item.variantName)}</div>`
        : "";
      const lineTotal =
        mode === "ticket" ? `<div class="price">${formatCurrency(item.subtotal)}</div>` : "";

      return `
        <div class="item-row">
          <div class="item-main">
            <div class="item-name">${item.quantity} x ${escapeHtml(item.productName)}</div>
            ${variant}
            ${modifiers}
            ${notes}
          </div>
          ${lineTotal}
        </div>
      `;
    })
    .join("");
}

function renderContactSection(order: Order) {
  const address = order.deliveryAddress
    ? `
      <div class="section">
        <div class="section-title">Despacho</div>
        <div>${escapeHtml(order.deliveryAddress.street)}</div>
        <div>${escapeHtml(order.deliveryAddress.district)}</div>
        ${
          order.deliveryAddress.reference
            ? `<div>Ref: ${escapeHtml(order.deliveryAddress.reference)}</div>`
            : ""
        }
      </div>
    `
    : "";

  const customer = order.customer
    ? `
      <div class="section">
        <div class="section-title">Cliente</div>
        <div>${escapeHtml(order.customer.fullName)}</div>
        <div>${escapeHtml(order.customer.phone)}</div>
      </div>
    `
    : "";

  return customer + address;
}

function renderExtraCharges(order: Order) {
  const sections = [];

  if (order.deliveryFee > 0) {
    sections.push(`
      <div class="summary-row"><span>Despacho</span><strong>${formatCurrency(order.deliveryFee)}</strong></div>
    `);
  }

  if (order.extraCharges.length) {
    sections.push(
      ...order.extraCharges.map(
        (charge) => `
          <div class="summary-row">
            <span>${escapeHtml(charge.name)} x${charge.quantity}</span>
            <strong>${formatCurrency(charge.total)}</strong>
          </div>
        `,
      ),
    );
  }

  return sections.join("");
}

function renderTotals(order: Order) {
  const itemsSubtotal = order.items.reduce((total, item) => total + item.subtotal, 0);

  return `
    <div class="divider"></div>
    <div class="summary-row"><span>Productos</span><strong>${formatCurrency(itemsSubtotal)}</strong></div>
    ${renderExtraCharges(order)}
    <div class="summary-row"><span>Subtotal</span><strong>${formatCurrency(order.subtotal)}</strong></div>
    <div class="summary-row"><span>Descuento</span><strong>${formatCurrency(order.discountAmount)}</strong></div>
    <div class="summary-row"><span>Promoción</span><strong>${formatCurrency(order.promotionAmount)}</strong></div>
    <div class="summary-row total"><span>Total</span><strong>${formatCurrency(order.total)}</strong></div>
    <div class="summary-row"><span>Pago</span><strong>${paymentMethodLabel(order.paymentMethod)}</strong></div>
  `;
}

export function getOrderPrintStyles() {
  return `
    :root {
      color-scheme: light;
      --paper-width: 80mm;
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #f5f5f5;
      color: #111;
      font-family: "SF Mono", "Roboto Mono", "Courier New", monospace;
    }

    body.preview {
      padding: 24px;
    }

    .ticket {
      width: min(100%, var(--paper-width));
      margin: 0 auto;
      background: #fff;
      padding: 14px 12px 20px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
    }

    .center {
      text-align: center;
    }

    .title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .muted {
      color: #4b5563;
      font-size: 11px;
      line-height: 1.45;
    }

    .divider {
      border-top: 1px dashed #111;
      margin: 10px 0;
    }

    .section {
      margin-top: 10px;
      font-size: 12px;
      line-height: 1.45;
    }

    .section-title {
      margin-bottom: 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .summary-row,
    .meta-row,
    .item-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      font-size: 12px;
      line-height: 1.4;
    }

    .item-row + .item-row {
      margin-top: 10px;
    }

    .item-main {
      flex: 1;
      min-width: 0;
    }

    .item-name {
      font-weight: 700;
    }

    .subline {
      margin-top: 2px;
      color: #4b5563;
      font-size: 11px;
      white-space: pre-wrap;
    }

    .price {
      flex: none;
      white-space: nowrap;
      font-weight: 700;
    }

    .total {
      margin-top: 6px;
      font-size: 14px;
    }

    .cut-line {
      margin-top: 18px;
      border-top: 1px dashed #111;
      padding-top: 8px;
      text-align: center;
      font-size: 10px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #6b7280;
    }

    @page {
      size: 80mm auto;
      margin: 4mm;
    }

    @media print {
      html, body {
        background: #fff;
      }

      body.preview {
        padding: 0;
      }

      .ticket {
        width: 100%;
        border: 0;
        box-shadow: none;
        padding: 0;
      }
    }
  `;
}

export function buildOrderPrintMarkup(order: Order, mode: PrintMode) {
  const title = mode === "ticket" ? "Ticket de venta" : "Comanda cocina";
  const items = renderOrderItems(order, mode);
  const contact = renderContactSection(order);
  const totals = mode === "ticket" ? renderTotals(order) : "";

  return `
    <article class="ticket">
      <div class="center">
        <div class="title">P&R_ventas</div>
        <div class="muted">Pizza n Roll</div>
        <div class="muted">${escapeHtml(title)}</div>
      </div>

      <div class="divider"></div>

      <div class="meta-row"><span>Pedido</span><strong>${escapeHtml(order.number)}</strong></div>
      <div class="meta-row"><span>Fecha</span><strong>${escapeHtml(formatDateTime(order.createdAt))}</strong></div>
      <div class="meta-row"><span>Tipo</span><strong>${escapeHtml(orderTypeLabel(order.type))}</strong></div>
      <div class="meta-row"><span>Estado</span><strong>${escapeHtml(orderStatusLabel(order.status))}</strong></div>
      <div class="meta-row"><span>Cajero</span><strong>${escapeHtml(order.cashierName)}</strong></div>

      ${contact}

      ${
        order.notes
          ? `
            <div class="section">
              <div class="section-title">Observaciones generales</div>
              <div>${escapeHtml(order.notes)}</div>
            </div>
          `
          : ""
      }

      <div class="divider"></div>
      <div class="section-title">${mode === "ticket" ? "Detalle" : "Preparación"}</div>
      ${items}
      ${
        order.deliveryFee > 0 || order.extraCharges.length
          ? `
            <div class="section">
              <div class="section-title">Adicionales del pedido</div>
              ${order.deliveryFee > 0 ? `<div>Despacho: ${formatCurrency(order.deliveryFee)}</div>` : ""}
              ${order.extraCharges
                .map(
                  (charge) =>
                    `<div>${escapeHtml(charge.name)} x${charge.quantity} · ${formatCurrency(charge.total)}</div>`,
                )
                .join("")}
            </div>
          `
          : ""
      }
      ${totals}

      <div class="cut-line">Cortar aquí</div>
    </article>
  `;
}

export function buildOrderPrintHtml(order: Order, mode: PrintMode) {
  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(order.number)} - ${mode === "ticket" ? "Ticket" : "Comanda"}</title>
        <style>${getOrderPrintStyles()}</style>
      </head>
      <body class="preview">
        ${buildOrderPrintMarkup(order, mode)}
      </body>
    </html>
  `;
}

export function openPrintWindow() {
  return window.open("", "_blank", "width=420,height=760");
}

export function printOrderToWindow(
  popup: Window,
  order: Order,
  mode: PrintMode,
) {
  popup.document.open();
  popup.document.write(buildOrderPrintHtml(order, mode));
  popup.document.close();

  window.setTimeout(() => {
    popup.focus();
    popup.print();
  }, 250);
}

export function printOrder(order: Order, mode: PrintMode) {
  const popup = openPrintWindow();

  if (!popup) {
    return false;
  }

  printOrderToWindow(popup, order, mode);
  return true;
}
