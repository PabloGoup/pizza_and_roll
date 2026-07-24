import path from "node:path";
import { spawn } from "node:child_process";
import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const MAX_SIGN_BODY_BYTES = 128 * 1024;

function respond(response: ServerResponse, status: number, body: string) {
  response.statusCode = status;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(body);
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > MAX_SIGN_BODY_BYTES) {
      throw new Error("La solicitud de firma excede el tamaño permitido.");
    }

    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
    data?: unknown;
  };
}

async function printRawWithLp(data: Buffer, printerName: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "/usr/bin/lp",
      ["-d", printerName, "-o", "raw", "-t", "Comanda-Cocina", "-"],
      {
        stdio: ["pipe", "ignore", "pipe"],
      },
    );
    const errors: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("La impresión local superó el tiempo permitido."));
    }, 15_000);

    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          Buffer.concat(errors).toString("utf8").trim() ||
            `lp terminó con código ${String(code)}.`,
        ),
      );
    });
    child.stdin.on("error", reject);
    child.stdin.end(data);
  });
}

function localPrintingPlugin(
  certificatePath?: string,
  privateKeyPath?: string,
  kitchenPrinter = "ICOD_PT80KM",
): Plugin {
  return {
    name: "local-printing-and-qz-signing",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split("?")[0];

        if (pathname === "/api/local-print/raw" && request.method === "POST") {
          if (process.platform !== "darwin") {
            respond(response, 501, "La impresión local con lp solo está disponible en macOS.");
            return;
          }

          try {
            const body = await readJsonBody(request);
            if (typeof body.data !== "string" || !body.data) {
              respond(response, 400, "Falta la comanda codificada.");
              return;
            }

            const rawData = Buffer.from(body.data, "base64");
            if (!rawData.length || rawData.length > MAX_SIGN_BODY_BYTES) {
              respond(response, 400, "El tamaño de la comanda no es válido.");
              return;
            }

            await printRawWithLp(rawData, kitchenPrinter);
            respond(response, 200, kitchenPrinter);
          } catch (error) {
            respond(
              response,
              500,
              error instanceof Error
                ? error.message
                : "No se pudo imprimir mediante la cola local.",
            );
          }
          return;
        }

        if (pathname === "/api/qz/certificate" && request.method === "GET") {
          if (!certificatePath) {
            respond(response, 503, "QZ_CERTIFICATE_PATH no está configurado.");
            return;
          }

          try {
            respond(response, 200, await readFile(certificatePath, "utf8"));
          } catch {
            respond(response, 500, "No se pudo leer el certificado público de QZ.");
          }
          return;
        }

        if (pathname === "/api/qz/sign" && request.method === "POST") {
          if (!privateKeyPath) {
            respond(response, 503, "QZ_PRIVATE_KEY_PATH no está configurado.");
            return;
          }

          try {
            const body = await readJsonBody(request);

            if (typeof body.data !== "string" || !body.data) {
              respond(response, 400, "Falta el contenido que se debe firmar.");
              return;
            }

            const signer = createSign("RSA-SHA512");
            signer.update(body.data, "utf8");
            signer.end();
            const privateKey = await readFile(privateKeyPath, "utf8");
            respond(response, 200, signer.sign(privateKey, "base64"));
          } catch (error) {
            respond(
              response,
              500,
              error instanceof Error ? error.message : "No se pudo firmar la solicitud QZ.",
            );
          }
          return;
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      tailwindcss(),
      localPrintingPlugin(
        env.QZ_CERTIFICATE_PATH,
        env.QZ_PRIVATE_KEY_PATH,
        env.LOCAL_KITCHEN_PRINTER || "ICOD_PT80KM",
      ),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
