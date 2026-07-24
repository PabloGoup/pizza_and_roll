import * as qz from "qz-tray";

import {
  formatDateTime,
  orderStatusLabel,
  orderTypeLabel,
} from "@/lib/format";
import type { Order } from "@/types/domain";
import { enqueueKitchenPrint } from "@/features/sales/services/print-queue-service";

const PRINTER_STORAGE_KEY = "pizza-roll:kitchen-printer";
const USB_PRINTER_STORAGE_KEY = "pizza-roll:kitchen-printer-usb";
const RECEIPT_COLUMNS = 32;
const ESC = "\x1b";

let connectionPromise: Promise<void> | null = null;
let securityConfigured = false;
let usbPrintPromise: Promise<void> = Promise.resolve();

export type KitchenUsbPrinter = {
  vendorId: string;
  productId: string;
  interface: string;
  endpoint: string;
  name: string;
};

type QzUsbDevice = {
  vendorId?: string;
  productId?: string;
  manufacturer?: string;
  product?: string;
};

function configureSecurity() {
  if (securityConfigured) return;
  securityConfigured = true;

  const certificateUrl =
    import.meta.env.VITE_QZ_CERTIFICATE_URL ??
    (import.meta.env.DEV ? "/api/qz/certificate" : undefined);
  const signatureUrl =
    import.meta.env.VITE_QZ_SIGNATURE_URL ??
    (import.meta.env.DEV ? "/api/qz/sign" : undefined);

  if (!certificateUrl || !signatureUrl) return;

  qz.security.setCertificatePromise((resolve, reject) => {
    void fetch(certificateUrl, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo cargar el certificado QZ.");
        return response.text();
      })
      .then(resolve)
      .catch((error: unknown) =>
        reject(error instanceof Error ? error.message : "Certificado QZ inválido."),
      );
  });

  qz.security.setSignatureAlgorithm("SHA512");
  qz.security.setSignaturePromise(async (dataToSign) => {
    const response = await fetch(signatureUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: dataToSign }),
    });

    if (!response.ok) throw new Error(await response.text());
    return response.text();
  });
}

export async function connectQz() {
  configureSecurity();

  if (qz.websocket.isActive()) return;
  if (connectionPromise) return connectionPromise;

  connectionPromise = qz.websocket
    .connect({ retries: 2, delay: 1 })
    .finally(() => {
      connectionPromise = null;
    });

  return connectionPromise;
}

export async function listQzPrinters() {
  await connectQz();
  const result = await qz.printers.find();
  return Array.isArray(result) ? result : [result];
}

export function getSavedKitchenPrinter() {
  return window.localStorage.getItem(PRINTER_STORAGE_KEY);
}

export function saveKitchenPrinter(printerName: string) {
  window.localStorage.setItem(PRINTER_STORAGE_KEY, printerName);
}

export function getSavedKitchenUsbPrinter(): KitchenUsbPrinter | null {
  const saved = window.localStorage.getItem(USB_PRINTER_STORAGE_KEY);
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved) as Partial<KitchenUsbPrinter>;
    if (
      !parsed.vendorId ||
      !parsed.productId ||
      !parsed.interface ||
      !parsed.endpoint
    ) {
      return null;
    }
    return {
      vendorId: parsed.vendorId,
      productId: parsed.productId,
      interface: parsed.interface,
      endpoint: parsed.endpoint,
      name: parsed.name ?? "Impresora USB",
    };
  } catch {
    return null;
  }
}

export function saveKitchenUsbPrinter(device: KitchenUsbPrinter | null) {
  if (!device) {
    window.localStorage.removeItem(USB_PRINTER_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(USB_PRINTER_STORAGE_KEY, JSON.stringify(device));
}

function isOutputEndpoint(endpoint: string) {
  const numericEndpoint = Number.parseInt(endpoint.replace(/^0x/i, ""), 16);
  return Number.isFinite(numericEndpoint) && (numericEndpoint & 0x80) === 0;
}

export async function detectKitchenUsbPrinter(): Promise<KitchenUsbPrinter> {
  await connectQz();
  const devices = (await qz.usb.listDevices(false)) as QzUsbDevice[];
  const device = devices.find((candidate) => {
    const description = `${candidate.manufacturer ?? ""} ${candidate.product ?? ""}`;
    const vendorId = candidate.vendorId?.toLowerCase().replace(/^0x/, "");
    const productId = candidate.productId?.toLowerCase().replace(/^0x/, "");
    return (
      (vendorId === "0483" && productId === "7540") ||
      /icod|thermal|pt80|printer/i.test(description)
    );
  });

  if (!device?.vendorId || !device.productId) {
    throw new Error("No se encontró la impresora térmica ICOD conectada por USB.");
  }

  const interfaces = await qz.usb.listInterfaces({
    vendorId: device.vendorId,
    productId: device.productId,
  });

  for (const usbInterface of interfaces) {
    const endpoints = await qz.usb.listEndpoints({
      vendorId: device.vendorId,
      productId: device.productId,
      iface: usbInterface,
    });
    const outputEndpoint = endpoints.find(isOutputEndpoint);

    if (outputEndpoint) {
      return {
        vendorId: device.vendorId,
        productId: device.productId,
        interface: usbInterface,
        endpoint: outputEndpoint,
        name: [device.manufacturer, device.product].filter(Boolean).join(" "),
      };
    }
  }

  throw new Error("La impresora fue detectada, pero no expone un endpoint USB de salida.");
}

async function resolveKitchenPrinter() {
  const savedPrinter = getSavedKitchenPrinter();

  if (savedPrinter) {
    const result = await qz.printers.find(savedPrinter);
    return Array.isArray(result) ? result[0] : result;
  }

  const defaultPrinter = await qz.printers.getDefault();
  saveKitchenPrinter(defaultPrinter);
  return defaultPrinter;
}

function normalizeThermalText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "")
    .trim();
}

function fitLine(value: string) {
  const normalized = normalizeThermalText(value);
  return normalized.length <= RECEIPT_COLUMNS
    ? normalized
    : normalized.slice(0, RECEIPT_COLUMNS);
}

function wrapThermalText(value: string, prefix = "") {
  const normalized = normalizeThermalText(value);
  const availableColumns = Math.max(1, RECEIPT_COLUMNS - prefix.length);
  const words = normalized.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > availableColumns) {
      if (current) {
        lines.push(`${prefix}${current}`);
        current = "";
      }

      for (let index = 0; index < word.length; index += availableColumns) {
        lines.push(`${prefix}${word.slice(index, index + availableColumns)}`);
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > availableColumns) {
      lines.push(`${prefix}${current}`);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(`${prefix}${current}`);
  return lines.length ? `${lines.join("\n")}\n` : "";
}

function largeThermalText(value: string, prefix = "") {
  const wrappedLines = wrapThermalText(value, prefix).trimEnd().split("\n").filter(Boolean);

  return wrappedLines
    .map(
      (line) =>
        // Conservamos doble altura para cocina, pero sin énfasis. ESC E hace
        // que el cabezal vuelva a calentar cada punto y esta impresora activa
        // su protección térmica siempre a una longitud física similar.
        `${ESC}E\x00${ESC}!\x10${line}\n${ESC}!\x00`,
    )
    .join("");
}

function separator() {
  return "-".repeat(RECEIPT_COLUMNS);
}

function sourceLabel(source: Order["source"]) {
  switch (source) {
    case "web":
      return "Web";
    case "whatsapp":
      return "WhatsApp";
    default:
      return "Local POS";
  }
}

function buildKitchenEscPos(
  order: Order,
  options?: { isRevision?: boolean; isReprint?: boolean },
) {
  const customerName = order.customer?.fullName ?? order.customerNameSnapshot;
  const customerPhone = order.customer?.phone ?? order.customerPhoneSnapshot;
  const documentTitle = options?.isRevision
    ? "COMANDA MODIFICADA"
    : options?.isReprint
      ? "REIMPRESION COMANDA"
      : "COMANDA COCINA";
  const lines: string[] = [
    `${ESC}@`,
    `${ESC}a\x01`,
    `${ESC}!\x30`,
    "P&R VENTAS\n",
    // Este firmware se detiene después del encabezado si se mantiene activo
    // el modo de doble altura. Restauramos el tamaño normal antes del cuerpo.
    `${ESC}!\x00`,
    // El cuerpo se imprime sin énfasis para evitar el corte térmico del
    // cabezal. Los datos prioritarios mantienen doble altura.
    `${ESC}E\x00`,
    `${documentTitle}\n`,
    `${separator()}\n`,
    `${ESC}a\x00`,
    `PEDIDO: ${fitLine(order.number)}\n`,
    wrapThermalText(`FECHA: ${formatDateTime(order.createdAt)}`),
    wrapThermalText(`TIPO: ${orderTypeLabel(order.type)}`),
    wrapThermalText(`CANAL: ${sourceLabel(order.source)}`),
    wrapThermalText(`ESTADO: ${orderStatusLabel(order.status)}`),
    wrapThermalText(`CAJERO: ${order.cashierName}`),
  ];

  if (options?.isRevision) {
    lines.push(wrapThermalText(`MODIFICADO: ${formatDateTime(order.updatedAt)}`));
  }

  if (customerName) lines.push(wrapThermalText(`CLIENTE: ${customerName}`));
  if (customerPhone) lines.push(wrapThermalText(`TELEFONO: ${customerPhone}`));
  if (order.deliveryAddress) {
    lines.push(
      wrapThermalText(`DIRECCION: ${order.deliveryAddress.street}`),
      wrapThermalText(`COMUNA: ${order.deliveryAddress.district}`),
    );
    if (order.deliveryAddress.reference) {
      lines.push(wrapThermalText(`REFERENCIA: ${order.deliveryAddress.reference}`));
    }
  }
  if (order.estimatedReadyAt) {
    lines.push(wrapThermalText(`HORA ESTIMADA: ${formatDateTime(order.estimatedReadyAt)}`));
  }

  lines.push(
    `${separator()}\n`,
    "PRODUCTOS\n",
  );

  for (const item of order.items) {
    lines.push(
      wrapThermalText(`CATEGORIA: ${item.categoryName || "Sin categoria"}`.toUpperCase()),
      // La impresora tolera doble altura en líneas individuales. Se restaura
      // inmediatamente para evitar el bloqueo que ocurre al usarla en todo el ticket.
      largeThermalText(`${item.quantity} x ${item.productName}`.toUpperCase()),
    );

    if (item.variantName) {
      lines.push(wrapThermalText(`VARIANTE: ${item.variantName}`.toUpperCase(), "  "));
    }

    for (const modifier of item.modifiers) {
      const modifierQuantity = modifier.quantity && modifier.quantity > 1
        ? `${modifier.quantity} x `
        : "";
      const modifierText = `+ ${modifierQuantity}${modifier.name}`.toUpperCase();
      const isWrapping = normalizeThermalText(modifier.name)
        .toLowerCase()
        .startsWith("envoltura:");
      lines.push(
        isWrapping
          ? largeThermalText(modifierText, "  ")
          : wrapThermalText(modifierText, "  "),
      );
    }

    if (item.notes) {
      lines.push(largeThermalText(`OBS: ${item.notes}`.toUpperCase(), "  "));
    }
  }

  if (order.notes) {
    lines.push(
      `${separator()}\n`,
      "OBSERVACIONES\n",
      wrapThermalText(order.notes),
    );
  }

  lines.push(
    `${separator()}\n`,
    `${ESC}a\x01`,
    `${ESC}!\x10`,
    "FIN DEL PEDIDO\n",
    `${ESC}!\x00`,
    `${ESC}E\x00`,
    `${fitLine(order.number)}\n`,
    `${ESC}E\x00`,
    `${ESC}d\x05`,
  );
  return lines.join("");
}

async function sendKitchenOrderDirectUsb(
  device: KitchenUsbPrinter,
  data: string,
) {
  const send = async () => {
    await qz.usb.claimDevice({
      vendorId: device.vendorId,
      productId: device.productId,
      interface: device.interface,
    });

    try {
      // Un único envío USB conserva una sola comanda continua. El protocolo
      // Bulk aplica backpressure cuando se llena el búfer interno de la
      // impresora, sin crear páginas ni trabajos adicionales en CUPS.
      await qz.usb.sendData({
        vendorId: device.vendorId,
        productId: device.productId,
        endpoint: device.endpoint,
        data,
        type: "PLAIN",
      });
    } finally {
      await qz.usb.releaseDevice({
        vendorId: device.vendorId,
        productId: device.productId,
      });
    }
  };

  usbPrintPromise = usbPrintPromise.then(send, send);
  return usbPrintPromise;
}

async function printWithLocalMacBridge(data: string) {
  let response: Response;

  try {
    response = await fetch("/api/local-print/raw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: btoa(data) }),
    });
  } catch {
    return null;
  }

  if (response.status === 404 || response.status === 501) return null;
  if (!response.ok) {
    throw new Error((await response.text()) || "Falló la impresión local.");
  }
  return response.text();
}

export async function printKitchenOrderWithQz(
  order: Order,
  options?: { isRevision?: boolean; isReprint?: boolean },
) {
  const escPosData = buildKitchenEscPos(order, options);
  const localPrinter = await printWithLocalMacBridge(escPosData);
  if (localPrinter) return localPrinter;

  await connectQz();
  const directUsbPrinter = getSavedKitchenUsbPrinter();

  if (directUsbPrinter) {
    await sendKitchenOrderDirectUsb(
      directUsbPrinter,
      escPosData,
    );
    return directUsbPrinter.name;
  }

  const printer = await resolveKitchenPrinter();

  if (!printer) {
    throw new Error("No se encontró la impresora configurada.");
  }

  const config = qz.configs.create(printer, {
    encoding: "ISO-8859-1",
    copies: 1,
    // La prueba directa con `lp -o raw` imprime más de 80 líneas completas.
    // En macOS, la ruta Java de QZ trunca este controlador ICOD; forceRaw
    // conserva un solo trabajo y entrega los bytes ESC/POS a la cola Raw.
    forceRaw: true,
  });

  await qz.print(config, [
    {
      type: "raw",
      format: "command",
      flavor: "plain",
      data: escPosData,
    },
  ]);

  return printer;
}

function isPrintQueueUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /enqueue_kitchen_print|schema cache|could not find the function|PGRST202/i.test(
    message,
  );
}

export async function printKitchenOrderAutomatically(
  order: Order,
  options?: { isRevision?: boolean; isReprint?: boolean },
) {
  const kind = options?.isReprint
    ? "reprint"
    : options?.isRevision
      ? "revision"
      : "new";

  try {
    await enqueueKitchenPrint(order, kind);
    return "agente de cocina";
  } catch (error) {
    // Compatibilidad durante el despliegue: si la migración aún no fue
    // aplicada, conserva la ruta local que ya funciona.
    if (isPrintQueueUnavailable(error)) {
      return printKitchenOrderWithQz(order, options);
    }
    throw error;
  }
}

export function getQzErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (/connect|socket|qz tray/i.test(message)) {
    return "QZ Tray no está abierto. Inícialo en este computador e intenta nuevamente.";
  }

  if (/printer|impresora/i.test(message)) {
    return "No se encontró la impresora configurada. Revisa la configuración de impresión.";
  }

  return message || "No se pudo enviar la comanda a QZ Tray.";
}
