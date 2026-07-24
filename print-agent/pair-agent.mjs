import { writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const [pairingCode, supabaseUrl, supabaseAnonKey, installDirectory] =
  process.argv.slice(2);

if (!pairingCode || !supabaseUrl || !supabaseAnonKey || !installDirectory) {
  throw new Error("Faltan datos para vincular el computador.");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await supabase.rpc("claim_print_agent_pairing", {
  p_code: pairingCode,
  p_hostname: hostname(),
  p_platform: "win32",
});

if (error) {
  throw new Error(`No se pudo vincular el computador: ${error.message}`);
}

const credentials = data;
const envContent = [
  `PRINT_AGENT_SUPABASE_URL=${supabaseUrl}`,
  `PRINT_AGENT_SUPABASE_ANON_KEY=${supabaseAnonKey}`,
  `PRINT_AGENT_NAME=${credentials.name}`,
  `PRINT_AGENT_TOKEN=${credentials.token}`,
  "PRINT_AGENT_PRINTER=",
  "PRINT_AGENT_POLL_MS=800",
  `PRINT_AGENT_LOG_FILE=${path.join(installDirectory, "print-agent.log")}`,
  "",
].join("\n");

await writeFile(path.join(installDirectory, ".env"), envContent, "utf8");
