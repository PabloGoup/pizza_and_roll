import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

const ESC = "\x1b";
const REQUIRED_ENV = [
  "PRINT_AGENT_SUPABASE_URL",
  "PRINT_AGENT_SUPABASE_ANON_KEY",
  "PRINT_AGENT_NAME",
  "PRINT_AGENT_TOKEN",
];

for (const variable of REQUIRED_ENV) {
  if (!process.env[variable]) {
    throw new Error(`Falta la variable ${variable}.`);
  }
}

const config = {
  url: process.env.PRINT_AGENT_SUPABASE_URL,
  anonKey: process.env.PRINT_AGENT_SUPABASE_ANON_KEY,
  name: process.env.PRINT_AGENT_NAME,
  token: process.env.PRINT_AGENT_TOKEN,
  printer: process.env.PRINT_AGENT_PRINTER || "",
  pollMs: Math.max(350, Number(process.env.PRINT_AGENT_POLL_MS ?? 800)),
  logFile: process.env.PRINT_AGENT_LOG_FILE || "",
};

const runtimeConfig = {
  isActive: true,
  printerName: config.printer,
  paperWidth: 58,
  charactersPerLine: 32,
  fontSize: "large",
  feedLines: 6,
  configVersion: 0,
};

const supabase = createClient(config.url, config.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let stopping = false;

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e\n]/g, "")
    .trim();
}

function wrap(text, width = runtimeConfig.charactersPerLine) {
  const words = normalize(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    if (word.length > width) {
      if (line) lines.push(line);
      for (let offset = 0; offset < word.length; offset += width) {
        lines.push(word.slice(offset, offset + width));
      }
      line = "";
    } else if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function labelOrderType(type) {
  return {
    consumo_local: "Consumo en local",
    retiro_local: "Retiro en local",
    despacho: "Despacho",
  }[type] ?? type;
}

function labelStatus(status) {
  return {
    pendiente: "Pendiente",
    en_preparacion: "En preparacion",
    listo: "Listo",
    entregado: "Entregado",
    cancelado: "Cancelado",
  }[status] ?? status;
}

function labelSource(source) {
  return { pos: "Local POS", web: "Web", whatsapp: "WhatsApp" }[source] ?? source;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(new Date(value));
}

function line(text = "") {
  return `${normalize(text)}\n`;
}

function largeLines(text, indent = "") {
  const isDoubleWidth = runtimeConfig.fontSize === "large";
  const width = isDoubleWidth
    ? Math.max(8, Math.floor(runtimeConfig.charactersPerLine / 2))
    : runtimeConfig.charactersPerLine;
  return wrap(text, width).map((entry) => `${indent}${entry}`).join("\n") + "\n";
}

function emphasisMode() {
  if (runtimeConfig.fontSize === "large") return "\x30";
  if (runtimeConfig.fontSize === "normal") return "\x10";
  return "\x00";
}

function buildTicket(order, jobType) {
  const title =
    jobType === "revision"
      ? "COMANDA MODIFICADA"
      : jobType === "reprint"
        ? "REIMPRESION COMANDA"
        : "COMANDA COCINA";
  let output = "";

  output += ESC + "@";
  output += ESC + "a" + "\x01";
  output += ESC + "!" + "\x30";
  output += line("P&R VENTAS");
  output += ESC + "!" + "\x10";
  output += line(title);
  output += ESC + "!" + "\x00";
  output += line("-".repeat(runtimeConfig.charactersPerLine));
  output += ESC + "a" + "\x00";
  output += line(`PEDIDO: ${order.number}`);
  output += line(`FECHA: ${formatDate(order.createdAt)}`);
  output += line(`TIPO: ${labelOrderType(order.type)}`);
  output += line(`CANAL: ${labelSource(order.source)}`);
  output += line(`ESTADO: ${labelStatus(order.status)}`);
  output += line(`CAJERO: ${order.cashierName}`);
  if (jobType === "revision") {
    output += line(`MODIFICADO: ${formatDate(order.updatedAt)}`);
  }
  if (order.customerName) output += line(`CLIENTE: ${order.customerName}`);
  if (order.customerPhone) output += line(`TELEFONO: ${order.customerPhone}`);
  if (order.deliveryAddress) {
    output += line(`DIRECCION: ${order.deliveryAddress.street}`);
    output += line(`COMUNA: ${order.deliveryAddress.district}`);
    if (order.deliveryAddress.reference) {
      output += line(`REFERENCIA: ${order.deliveryAddress.reference}`);
    }
  }
  output += line("-".repeat(runtimeConfig.charactersPerLine));
  output += ESC + "E" + "\x01";
  output += line("PRODUCTOS");
  output += ESC + "E" + "\x00";

  for (const item of order.items ?? []) {
    output += ESC + "E" + "\x01";
    for (const categoryLine of wrap(`CATEGORIA: ${item.categoryName}`)) {
      output += line(categoryLine);
    }
    output += ESC + "E" + "\x00";
    output += ESC + "!" + emphasisMode();
    const quantity = Number(item.quantity);
    const quantityLabel = Number.isInteger(quantity) ? String(quantity) : String(quantity);
    output += largeLines(`${quantityLabel} X ${item.productName}`);
    if (item.variantName) output += largeLines(`+ VARIANTE: ${item.variantName}`);
    for (const modifier of item.modifiers ?? []) {
      output += largeLines(`+ ${modifier.name}`);
    }
    if (item.notes) output += largeLines(`OBS: ${item.notes}`);
    output += ESC + "!" + "\x00";
  }

  if (order.notes) {
    output += line("-".repeat(runtimeConfig.charactersPerLine));
    output += ESC + "!" + emphasisMode();
    output += largeLines(`OBS PEDIDO: ${order.notes}`);
    output += ESC + "!" + "\x00";
  }

  output += line("-".repeat(runtimeConfig.charactersPerLine));
  output += ESC + "a" + "\x01";
  output += ESC + "E" + "\x01";
  output += line("FIN DE COMANDA");
  output += ESC + "E" + "\x00";
  output += "\n".repeat(runtimeConfig.feedLines);
  return Buffer.from(output, "binary");
}

async function log(level, message, details = {}) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...details,
  });
  console.log(entry);
  if (config.logFile) {
    await appendFile(config.logFile, `${entry}\n`).catch(() => undefined);
  }
}

function run(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8").trim());
      } else {
        reject(
          new Error(
            Buffer.concat(stderr).toString("utf8").trim() ||
              `${command} terminó con código ${code}.`,
          ),
        );
      }
    });
    child.stdin.end(input);
  });
}

async function printRaw(data) {
  if (process.platform === "win32") {
    const folder = await mkdtemp(path.join(tmpdir(), "pizza-roll-print-"));
    const dataFile = path.join(folder, "ticket.bin");
    const script = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "windows-raw-print.ps1",
    );
    try {
      await writeFile(dataFile, data);
      await run(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          script,
          "-PrinterName",
          runtimeConfig.printerName,
          "-DataFile",
          dataFile,
        ],
        null,
      );
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
    return;
  }

  await run("/usr/bin/lp", ["-d", runtimeConfig.printerName, "-o", "raw", "-"], data);
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function discoverPrinters() {
  if (process.platform === "win32") {
    const result = await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-Printer | Select-Object -ExpandProperty Name",
      ],
      null,
    );
    return result.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  }

  const destinations = await run("/usr/bin/lpstat", ["-e"], null).catch(
    () => "",
  );
  const destinationNames = destinations
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (destinationNames.length) return destinationNames;

  const devices = await run("/usr/bin/lpstat", ["-v"], null).catch(() => "");
  const deviceNames = devices
    .split(/\r?\n/)
    .map((entry) => entry.match(/(?:device for|dispositivo para)\s+([^:]+):/i)?.[1])
    .filter(Boolean);
  if (deviceNames.length) return deviceNames;

  const profiler = await run(
    "/usr/sbin/system_profiler",
    ["SPPrintersDataType", "-json"],
    null,
  ).catch(() => "");
  if (!profiler) return [];

  const names = new Set();
  function collectPrinterNames(value) {
    if (Array.isArray(value)) {
      for (const entry of value) collectPrinterNames(entry);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (typeof value._name === "string" && value._name !== "Printers") {
      names.add(value._name);
    }
    for (const entry of Object.values(value)) collectPrinterNames(entry);
  }
  collectPrinterNames(JSON.parse(profiler));
  return [...names];
}

async function synchronizeConfiguration() {
  const discoveredPrinters = await discoverPrinters().catch((error) => {
    void log("warn", "No se pudo enumerar impresoras", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  });
  const availablePrinters = [
    ...new Set(
      [runtimeConfig.printerName, config.printer, ...discoveredPrinters].filter(Boolean),
    ),
  ];
  const nextConfig = await rpc("report_print_agent", {
    p_agent_name: config.name,
    p_agent_token: config.token,
    p_platform: process.platform,
    p_hostname: hostname(),
    p_preferred_printer: config.printer,
    p_available_printers: availablePrinters,
  });

  if (!nextConfig) return;
  runtimeConfig.isActive = nextConfig.isActive !== false;
  runtimeConfig.printerName = nextConfig.printerName || "";
  runtimeConfig.paperWidth = Number(nextConfig.paperWidth ?? 58);
  runtimeConfig.charactersPerLine = Number(nextConfig.charactersPerLine ?? 32);
  runtimeConfig.fontSize = nextConfig.fontSize ?? "large";
  runtimeConfig.feedLines = Number(nextConfig.feedLines ?? 6);

  if (runtimeConfig.configVersion !== Number(nextConfig.configVersion)) {
    runtimeConfig.configVersion = Number(nextConfig.configVersion);
    await log("info", "Configuración aplicada", {
      printer: runtimeConfig.printerName,
      paperWidth: runtimeConfig.paperWidth,
      charactersPerLine: runtimeConfig.charactersPerLine,
      fontSize: runtimeConfig.fontSize,
      feedLines: runtimeConfig.feedLines,
      enabled: runtimeConfig.isActive,
    });
  }
}

async function processJob(job) {
  try {
    if (!runtimeConfig.printerName) {
      throw new Error("No hay una impresora vinculada a este computador.");
    }
    if (!job.order_payload) throw new Error("El pedido no devolvió datos imprimibles.");
    const ticket = buildTicket(job.order_payload, job.job_type);
    await printRaw(ticket);
    await rpc("complete_print_job", {
      p_agent_name: config.name,
      p_agent_token: config.token,
      p_job_id: job.job_id,
    });
    await log("info", "Comanda impresa", {
      jobId: job.job_id,
      order: job.order_payload.number,
      type: job.job_type,
      bytes: ticket.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await rpc("fail_print_job", {
      p_agent_name: config.name,
      p_agent_token: config.token,
      p_job_id: job.job_id,
      p_error: message,
    }).catch(() => undefined);
    await log("error", "Falló la comanda", {
      jobId: job.job_id,
      error: message,
      attempt: job.attempt_number,
    });
  }
}

async function main() {
  await log("info", "Agente de impresión iniciado", {
    agent: config.name,
    printer: runtimeConfig.printerName,
    platform: process.platform,
  });

  let nextSynchronizationAt = 0;
  while (!stopping) {
    try {
      if (Date.now() >= nextSynchronizationAt) {
        await synchronizeConfiguration();
        nextSynchronizationAt = Date.now() + 10_000;
      }

      if (!runtimeConfig.isActive || !runtimeConfig.printerName) {
        await new Promise((resolve) => setTimeout(resolve, config.pollMs));
        continue;
      }

      const jobs =
        (await rpc("claim_print_jobs", {
          p_agent_name: config.name,
          p_agent_token: config.token,
          p_limit: 3,
        })) ?? [];
      for (const job of jobs) await processJob(job);
    } catch (error) {
      await log("error", "No se pudo consultar la cola", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (!stopping) {
      await new Promise((resolve) => setTimeout(resolve, config.pollMs));
    }
  }
}

process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

await main();
