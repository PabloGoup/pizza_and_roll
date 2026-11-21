import { synchronizeCancellations } from "./queue-cancellation.mjs";
import { buildCashDocument } from "./cash-document.mjs";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

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
  // Without jobs for a while, poll less often to cut Supabase requests/logs.
  idlePollMs: Math.max(350, Number(process.env.PRINT_AGENT_IDLE_POLL_MS ?? 2000)),
  idleAfterMs: Math.max(0, Number(process.env.PRINT_AGENT_IDLE_AFTER_MS ?? 120_000)),
  logFile: process.env.PRINT_AGENT_LOG_FILE || "",
};

const runtimeConfig = {
  isActive: true,
  printerName: config.printer,
  paperWidth: 58,
  charactersPerLine: 32,
  fontSize: "compact",
  feedLines: 6,
  configVersion: 0,
};

const supabase = createClient(config.url, config.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let stopping = false;

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

async function printRaw(data, jobId) {
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
          "-DocumentName",
          `PizzaAndRoll:${jobId}`,
        ],
        null,
      );
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
    return;
  }

  await run("/usr/bin/lp", ["-d", runtimeConfig.printerName, "-t", `PizzaAndRoll:${jobId}`, "-o", "raw", "-"], data);
}

async function cancelSystemJobs(request) {
  if (process.platform !== "win32") {
    throw new Error("La limpieza automática de la cola del sistema requiere Windows. Cancela los documentos en la cola del sistema antes de continuar.");
  }
  const folder = await mkdtemp(path.join(tmpdir(), "pizza-roll-cancel-"));
  const requestFile = path.join(folder, "request.json");
  try {
    await writeFile(requestFile, JSON.stringify(request));
    await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", path.join(path.dirname(fileURLToPath(import.meta.url)), "windows-cancel-print.ps1"),
      "-PrinterName", request.printerName, "-RequestFile", requestFile], null);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

const credentials = { p_agent_name: config.name, p_agent_token: config.token };
function drainCancellations() {
  return synchronizeCancellations({ rpc, credentials, cancel: cancelSystemJobs, log });
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
    p_supported_documents: ["cash-v1"],
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
  runtimeConfig.fontSize = nextConfig.fontSize ?? "compact";
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
    const ticket = buildCashDocument(job.order_payload, runtimeConfig);
    if (!await drainCancellations()) return;
    if (!await rpc("can_submit_print_job", { ...credentials, p_job_id: job.job_id })) return;
    await printRaw(ticket, job.job_id);
    // A cancellation may have arrived while Windows accepted the document.
    if (!await drainCancellations()) return;
    if (!await rpc("can_submit_print_job", { ...credentials, p_job_id: job.job_id })) return;
    await rpc("complete_print_job", {
      p_agent_name: config.name,
      p_agent_token: config.token,
      p_job_id: job.job_id,
    });
    await log("info", "Documento de caja impreso", {
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
  let lastActivityAt = Date.now();
  const currentPollMs = () =>
    Date.now() - lastActivityAt > config.idleAfterMs
      ? Math.max(config.pollMs, config.idlePollMs)
      : config.pollMs;
  while (!stopping) {
    try {
      if (Date.now() >= nextSynchronizationAt) {
        await synchronizeConfiguration();
        nextSynchronizationAt = Date.now() + 10_000;
      }

      const cancellationReady = await drainCancellations();
      if (!cancellationReady || !runtimeConfig.isActive || !runtimeConfig.printerName) {
        await new Promise((resolve) => setTimeout(resolve, currentPollMs()));
        continue;
      }

      const jobs =
        (await rpc("claim_print_jobs", {
          p_agent_name: config.name,
          p_agent_token: config.token,
          p_limit: 3,
        })) ?? [];
      if (jobs.length) lastActivityAt = Date.now();
      for (const job of jobs) await processJob(job);
    } catch (error) {
      await log("error", "No se pudo consultar la cola", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (!stopping) {
      await new Promise((resolve) => setTimeout(resolve, currentPollMs()));
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
