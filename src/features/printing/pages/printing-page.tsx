import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Check,
  Clock3,
  Loader2,
  MonitorCog,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import logoUrl from "@/assets/logo.png";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  clearSelectedPrintStation,
  getSelectedPrintStationId,
  selectPrintStation,
} from "@/features/printing/lib/print-station";
import type { Database } from "@/types/database";

type PrintJob = Database["public"]["Tables"]["print_jobs"]["Row"];
type FontSize = "compact" | "normal" | "large";
type AgentSettings = {
  id: string;
  name: string;
  isActive: boolean;
  isOnline: boolean;
  lastSeenAt: string | null;
  platform: string | null;
  hostname: string | null;
  printerName: string | null;
  availablePrinters: string[];
  paperWidth: number;
  charactersPerLine: number;
  fontSize: FontSize;
  feedLines: number;
  configVersion: number;
};
type ControlPanel = {
  agents: AgentSettings[];
  queue: { pending: number; processing: number; failed: number };
};

const WINDOWS_INSTALLER_URL =
  "https://github.com/PabloGoup/pizza_and_roll/releases/download/print-agent-latest/Pizza-and-Roll-Impresion-Setup.exe";
const MACOS_INSTALLER_URL =
  "https://github.com/PabloGoup/pizza_and_roll/releases/download/print-agent-latest/Pizza-and-Roll-Impresion.pkg";

const STATUS_LABEL: Record<PrintJob["status"], string> = {
  pending: "Pendiente",
  processing: "Imprimiendo",
  printed: "Impresa",
  failed: "Error",
};

const TYPE_LABEL: Record<PrintJob["job_type"], string> = {
  new: "Nueva",
  revision: "Modificada",
  reprint: "Reimpresión",
};

function wrapPreview(text: string, width: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function KitchenTicketPreview({ settings }: { settings: AgentSettings }) {
  const largeWidth =
    settings.fontSize === "large"
      ? Math.max(8, Math.floor(settings.charactersPerLine / 2))
      : settings.charactersPerLine;
  const productLines = [
    ...wrapPreview("1 X EBI TEMPURA ROLL", largeWidth),
    ...wrapPreview("+ ENVOLTURA: QUESO", largeWidth),
    ...wrapPreview("OBS: SIN CEBOLLIN", largeWidth),
  ];
  const fontSize =
    settings.fontSize === "large" ? 17 : settings.fontSize === "normal" ? 14 : 11;

  return (
    <div className="rounded-2xl border bg-muted/25 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Vista previa</p>
          <p className="text-xs text-muted-foreground">
            Aproximación del resultado ESC/POS
          </p>
        </div>
        <span className="rounded-full border bg-background px-2.5 py-1 text-xs">
          {settings.paperWidth} mm
        </span>
      </div>

      <div className="overflow-x-auto pb-2">
        <div
          className="mx-auto min-h-[620px] bg-white px-4 py-5 text-black shadow-xl shadow-black/10"
          style={{ width: settings.paperWidth === 80 ? 340 : 252 }}
        >
          <div className="font-mono">
            <div className="text-center text-[22px] font-black tracking-wide">
              P&amp;R VENTAS
            </div>
            <div className="text-center text-[13px] font-bold">COMANDA COCINA</div>
            <div className="my-3 border-t border-dashed border-black" />

            <div className="space-y-0.5 text-[12px] leading-4">
              <p>PEDIDO: PR-001234</p>
              <p>FECHA: 24 JUL 2026, 12:30</p>
              <p>TIPO: CONSUMO EN LOCAL</p>
              <p>CANAL: LOCAL POS</p>
              <p>ESTADO: EN PREPARACION</p>
              <p>CAJERO: PABLO TOLEDO</p>
            </div>

            <div className="my-3 border-t border-dashed border-black" />
            <p className="text-[13px] font-black">PRODUCTOS</p>
            <p className="mt-2 text-[12px] font-bold">CATEGORIA: AVOCADOS</p>
            <div
              className="mt-1 font-black uppercase"
              style={{ fontSize, lineHeight: 1.15 }}
            >
              {productLines.map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
            </div>

            <p className="mt-4 text-[12px] font-bold">CATEGORIA: CALIFORNIA</p>
            <div
              className="mt-1 font-black uppercase"
              style={{ fontSize, lineHeight: 1.15 }}
            >
              {wrapPreview("2 X PEPINO ROLL", largeWidth).map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
              {wrapPreview("+ ENVOLTURA: SESAMO", largeWidth).map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
            </div>

            <div className="my-3 border-t border-dashed border-black" />
            <div
              className="font-black uppercase"
              style={{ fontSize, lineHeight: 1.15 }}
            >
              {wrapPreview("OBS PEDIDO: PRIORIDAD SIN SALSA", largeWidth).map(
                (line, index) => (
                  <p key={`${line}-${index}`}>{line}</p>
                ),
              )}
            </div>
            <div className="my-3 border-t border-dashed border-black" />
            <p className="text-center text-[13px] font-black">FIN DE COMANDA</p>
            <div style={{ height: Math.max(16, settings.feedLines * 5) }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof Printer;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-xl bg-muted",
            tone === "success" && "bg-emerald-100 text-emerald-700",
            tone === "danger" && "bg-red-100 text-red-700",
          )}
        >
          <Icon className="size-4" />
        </div>
      </div>
    </div>
  );
}

export function PrintingPage() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [agents, setAgents] = useState<AgentSettings[]>([]);
  const [queue, setQueue] = useState<ControlPanel["queue"]>({
    pending: 0,
    processing: 0,
    failed: 0,
  });
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [draft, setDraft] = useState<AgentSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [printerDialogOpen, setPrinterDialogOpen] = useState(false);
  const [computerDialogOpen, setComputerDialogOpen] = useState(false);
  const [candidateAgentId, setCandidateAgentId] = useState("");
  const [candidatePrinter, setCandidatePrinter] = useState("");
  const [newComputerName, setNewComputerName] = useState("");
  const [newComputerPlatform, setNewComputerPlatform] = useState<"windows" | "macos">("windows");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingExpiresAt, setPairingExpiresAt] = useState<string | null>(null);
  const [browserStationId, setBrowserStationId] = useState(
    () => getSelectedPrintStationId() ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  const loadControlPanel = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const supabase = getSupabaseClient();
    const [panelResult, jobsResult] = await Promise.all([
      supabase.rpc("get_print_control_panel"),
      supabase
        .from("print_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    if (panelResult.error || jobsResult.error) {
      setError(panelResult.error?.message ?? jobsResult.error?.message ?? "Error desconocido");
      setIsLoading(false);
      return;
    }

    const panel = panelResult.data as unknown as ControlPanel;
    const nextAgents = panel.agents ?? [];
    setAgents(nextAgents);
    setQueue(panel.queue ?? { pending: 0, processing: 0, failed: 0 });
    setJobs(jobsResult.data ?? []);
    const storedAgentId = getSelectedPrintStationId();
    const initialAgent =
      nextAgents.find((agent) => agent.id === storedAgentId) ?? nextAgents[0] ?? null;
    setSelectedAgentId((current) => current || initialAgent?.id || "");
    setDraft((current) => current ?? initialAgent);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadControlPanel(), 0);
    const interval = window.setInterval(() => void loadControlPanel(), 5_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadControlPanel]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  async function saveSettings() {
    if (!draft) return;
    setIsSaving(true);
    const { error: saveError } = await getSupabaseClient().rpc(
      "update_print_agent_settings",
      {
        p_agent_id: draft.id,
        p_printer_name: draft.printerName ?? "",
        p_paper_width: draft.paperWidth,
        p_characters_per_line: draft.charactersPerLine,
        p_font_size: draft.fontSize,
        p_feed_lines: draft.feedLines,
        p_is_active: draft.isActive,
      },
    );
    setIsSaving(false);

    if (saveError) {
      toast.error(saveError.message);
      return;
    }

    toast.success("Configuración guardada. El agente la aplicará en segundos.");
    setDraft(null);
    await loadControlPanel();
  }

  function openAddPrinter() {
    const firstAvailableAgent =
      agents.find((agent) => agent.isOnline && agent.availablePrinters.length) ??
      agents.find((agent) => agent.availablePrinters.length) ??
      null;
    setCandidateAgentId(firstAvailableAgent?.id ?? "");
    setCandidatePrinter(firstAvailableAgent?.availablePrinters[0] ?? "");
    setPrinterDialogOpen(true);
  }

  async function addDetectedPrinter() {
    const agent = agents.find((entry) => entry.id === candidateAgentId);
    if (!agent || !candidatePrinter) return;

    setIsSaving(true);
    const { error: saveError } = await getSupabaseClient().rpc(
      "update_print_agent_settings",
      {
        p_agent_id: agent.id,
        p_printer_name: candidatePrinter,
        p_paper_width: agent.paperWidth,
        p_characters_per_line: agent.charactersPerLine,
        p_font_size: agent.fontSize,
        p_feed_lines: agent.feedLines,
        p_is_active: true,
      },
    );
    setIsSaving(false);

    if (saveError) {
      toast.error(saveError.message);
      return;
    }

    selectPrintStation(agent.id);
    setBrowserStationId(agent.id);
    setSelectedAgentId(agent.id);
    setDraft(null);
    setPrinterDialogOpen(false);
    toast.success(`${candidatePrinter} quedó vinculada a este navegador.`);
    await loadControlPanel();
  }

  async function removePrinter(agent: AgentSettings) {
    setIsSaving(true);
    const { error: saveError } = await getSupabaseClient().rpc(
      "update_print_agent_settings",
      {
        p_agent_id: agent.id,
        p_printer_name: "",
        p_paper_width: agent.paperWidth,
        p_characters_per_line: agent.charactersPerLine,
        p_font_size: agent.fontSize,
        p_feed_lines: agent.feedLines,
        p_is_active: false,
      },
    );
    setIsSaving(false);

    if (saveError) {
      toast.error(saveError.message);
      return;
    }

    clearSelectedPrintStation(agent.id);
    if (browserStationId === agent.id) setBrowserStationId("");
    toast.success("La impresora se quitó de la web. El controlador permanece instalado.");
    setDraft(null);
    await loadControlPanel();
  }

  function chooseStationForBrowser(agent: AgentSettings) {
    if (!agent.printerName) {
      toast.error("Primero agrega una impresora a este computador.");
      return;
    }
    selectPrintStation(agent.id);
    setBrowserStationId(agent.id);
    toast.success(`Este navegador enviará las comandas a ${agent.printerName}.`);
  }

  function downloadComputerInstaller() {
    const link = document.createElement("a");
    link.href =
      newComputerPlatform === "windows" ? WINDOWS_INSTALLER_URL : MACOS_INSTALLER_URL;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function createComputerInstaller() {
    const safeName = newComputerName
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!safeName) {
      toast.error("Escribe un nombre para identificar el computador.");
      return;
    }

    setIsSaving(true);

    const { data, error: pairingError } = await getSupabaseClient().rpc(
      "create_print_agent_pairing",
      { p_name: safeName },
    );
    setIsSaving(false);

    if (pairingError) {
      const migrationMissing =
        pairingError.message.includes("create_print_agent_pairing") &&
        pairingError.message.includes("schema cache");
      toast.error(
        migrationMissing
          ? "Falta actualizar Supabase para habilitar la vinculación de computadores."
          : pairingError.message,
      );
      return;
    }

    const pairing = data as unknown as {
      code: string;
      name: string;
      expiresAt: string;
    };
    setPairingCode(pairing.code);
    setPairingExpiresAt(pairing.expiresAt);
    downloadComputerInstaller();
    toast.success("Instalador descargado. Usa el código mostrado para vincularlo.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Impresión"
        description="Administra los computadores de cocina, formato térmico, cola y actividad desde un solo lugar."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPairingCode("");
                setPairingExpiresAt(null);
                setComputerDialogOpen(true);
              }}
            >
              <MonitorCog className="size-4" />
              Agregar computador
            </Button>
            <Button onClick={openAddPrinter}>
              <Plus className="size-4" />
              Agregar impresora
            </Button>
            <Button variant="outline" disabled={isLoading} onClick={() => void loadControlPanel()}>
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Actualizar
            </Button>
          </div>
        }
      />

      <Dialog
        open={computerDialogOpen}
        onOpenChange={(open) => {
          setComputerDialogOpen(open);
          if (!open) {
            setPairingCode("");
            setPairingExpiresAt(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {pairingCode ? (
            <>
              <DialogHeader className="items-center text-center">
                <img
                  src={logoUrl}
                  alt="Pizza and Roll"
                  className="mb-2 size-20 rounded-2xl object-cover shadow-sm"
                />
                <DialogTitle>Instalador listo</DialogTitle>
                <DialogDescription>
                  Abre “Pizza and Roll - Impresión” en{" "}
                  {newComputerPlatform === "windows" ? "Windows" : "macOS"} e ingresa este código.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-6 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-800">
                    Código de vinculación
                  </p>
                  <p className="mt-3 font-mono text-4xl font-bold tracking-[0.22em] text-orange-950">
                    {pairingCode.match(/.{1,4}/g)?.join(" ")}
                  </p>
                  <p className="mt-3 text-xs text-orange-900/75">
                    Válido hasta{" "}
                    {pairingExpiresAt
                      ? new Intl.DateTimeFormat("es-CL", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(pairingExpiresAt))
                      : "por 15 minutos"}
                  </p>
                </div>
                <div className="rounded-xl border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground">
                  El asistente instalará el servicio con el logo de Pizza and Roll y lo iniciará
                  automáticamente con el computador. No necesitas usar la consola.
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={downloadComputerInstaller}>
                  Descargar nuevamente
                </Button>
                <Button onClick={() => setComputerDialogOpen(false)}>Listo</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <div className="mb-2 flex items-center gap-3">
                  <img
                    src={logoUrl}
                    alt="Pizza and Roll"
                    className="size-12 rounded-xl object-cover"
                  />
                  <div>
                    <DialogTitle>Agregar computador de impresión</DialogTitle>
                    <DialogDescription className="mt-1">
                      Instalación guiada y vinculación segura.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="print-computer-name">Nombre del computador</Label>
                  <Input
                    id="print-computer-name"
                    value={newComputerName}
                    placeholder="Ej. Cocina principal"
                    onChange={(event) => setNewComputerName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sistema operativo</Label>
                  <Select
                    value={newComputerPlatform}
                    onValueChange={(value) =>
                      setNewComputerPlatform((value as "windows" | "macos") ?? "windows")
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {newComputerPlatform === "windows" ? "Windows" : "macOS"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="windows">Windows</SelectItem>
                      <SelectItem value="macos">macOS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-xs leading-5 text-orange-950">
                  {newComputerPlatform === "windows"
                    ? "Descargarás un asistente gráfico de Pizza and Roll. Al finalizar, las impresoras instaladas en este computador aparecerán automáticamente en el panel."
                    : "Descargarás un paquete de Pizza and Roll para macOS. Al terminar la instalación se abrirá la vinculación gráfica, sin comandos ni Terminal."}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setComputerDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  disabled={!newComputerName.trim() || isSaving}
                  onClick={() => void createComputerInstaller()}
                >
                  {isSaving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Descargar instalador
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={printerDialogOpen} onOpenChange={setPrinterDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Agregar una impresora detectada</DialogTitle>
            <DialogDescription>
              Elige el computador y una de las impresoras que su agente encontró. Quedará como
              destino de este navegador.
            </DialogDescription>
          </DialogHeader>

          {agents.some((agent) => agent.availablePrinters.length) ? (
            <div className="space-y-5 py-2">
              <div className="space-y-2">
                <Label>Computador</Label>
                <Select
                  value={candidateAgentId}
                  onValueChange={(value) => {
                    const agent = agents.find((entry) => entry.id === value);
                    setCandidateAgentId(value ?? "");
                    setCandidatePrinter(agent?.availablePrinters[0] ?? "");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {agents.find((agent) => agent.id === candidateAgentId)?.hostname ??
                        "Seleccionar computador"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {agents
                      .filter((agent) => agent.availablePrinters.length)
                      .map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.hostname ?? agent.name}
                          {agent.isOnline ? " · En línea" : " · Desconectado"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Impresoras instaladas o detectadas</Label>
                <div className="grid max-h-64 gap-2 overflow-y-auto">
                  {(
                    agents.find((agent) => agent.id === candidateAgentId)?.availablePrinters ?? []
                  ).map((printer) => (
                    <button
                      key={printer}
                      type="button"
                      className={cn(
                        "flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                        candidatePrinter === printer
                          ? "border-orange-300 bg-orange-50"
                          : "border-border/70 hover:bg-muted/50",
                      )}
                      onClick={() => setCandidatePrinter(printer)}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <Printer className="size-4 shrink-0" />
                        <span className="truncate font-medium">{printer}</span>
                      </span>
                      {candidatePrinter === printer ? (
                        <Check className="size-4 text-orange-600" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <Printer className="mx-auto size-7 text-muted-foreground" />
              <p className="mt-3 font-medium">No hay impresoras detectadas</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Verifica que el agente esté instalado y en línea en el computador de impresión.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPrinterDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!candidateAgentId || !candidatePrinter || isSaving}
              onClick={() => void addDetectedPrinter()}
            >
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Agregar y usar aquí
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Agente"
          value={selectedAgent?.isOnline ? "En línea" : "Desconectado"}
          hint={selectedAgent?.hostname ?? "Sin computador reportado"}
          icon={selectedAgent?.isOnline ? Wifi : WifiOff}
          tone={selectedAgent?.isOnline ? "success" : "danger"}
        />
        <Metric
          label="Impresora"
          value={selectedAgent?.printerName ?? "Sin asignar"}
          hint={`${selectedAgent?.paperWidth ?? 58} mm · ${selectedAgent?.charactersPerLine ?? 32} caracteres`}
          icon={Printer}
        />
        <Metric
          label="En cola"
          value={queue.pending + queue.processing}
          hint={`${queue.processing} imprimiendo ahora`}
          icon={Clock3}
        />
        <Metric
          label="Errores"
          value={queue.failed}
          hint="Trabajos agotados tras reintentos"
          icon={AlertTriangle}
          tone={queue.failed ? "danger" : "default"}
        />
      </div>

      {error && (
        <div className="flex gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-border/70 bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div>
            <h2 className="font-semibold">Impresoras agregadas</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              El navegador enviará las nuevas comandas al destino marcado como “En uso aquí”.
            </p>
          </div>
          <Button variant="outline" onClick={openAddPrinter}>
            <Plus className="size-4" />
            Agregar otra
          </Button>
        </div>

        <div className="grid gap-3 p-5 lg:grid-cols-2">
          {agents
            .filter((agent) => agent.printerName)
            .map((agent) => {
              const isBrowserStation = browserStationId === agent.id;
              return (
                <article
                  key={agent.id}
                  className={cn(
                    "rounded-2xl border p-4",
                    isBrowserStation
                      ? "border-emerald-300 bg-emerald-50/70"
                      : "border-border/70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background ring-1 ring-border/70">
                        <Printer className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{agent.printerName}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {agent.hostname ?? agent.name} · {agent.platform ?? "Sistema desconocido"}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        agent.isOnline
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {agent.isOnline ? "En línea" : "Desconectada"}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      variant={isBrowserStation ? "secondary" : "outline"}
                      disabled={isBrowserStation || !agent.isOnline}
                      onClick={() => chooseStationForBrowser(agent)}
                    >
                      {isBrowserStation ? <Check className="size-4" /> : <MonitorCog className="size-4" />}
                      {isBrowserStation ? "En uso aquí" : "Usar en este navegador"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSelectedAgentId(agent.id);
                        setDraft(agent);
                      }}
                    >
                      Configurar
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={isSaving}
                      onClick={() => void removePrinter(agent)}
                    >
                      <Trash2 className="size-4" />
                      Quitar
                    </Button>
                  </div>
                </article>
              );
            })}

          {!agents.some((agent) => agent.printerName) ? (
            <div className="col-span-full rounded-xl border border-dashed p-8 text-center">
              <Printer className="mx-auto size-7 text-muted-foreground" />
              <p className="mt-3 font-medium">Aún no agregas impresoras</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Presiona “Agregar impresora” y elige una de las detectadas.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {draft ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-border/70 bg-card p-5">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <MonitorCog className="size-5" />
                    <h2 className="font-semibold">Computador remoto e impresora</h2>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Selecciona el computador que recibirá las comandas y una cola instalada en él.
                  </p>
                </div>
                <span
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
                    selectedAgent?.isOnline
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {selectedAgent?.isOnline ? (
                    <Wifi className="size-3.5" />
                  ) : (
                    <WifiOff className="size-3.5" />
                  )}
                  {selectedAgent?.isOnline ? "En línea" : "Desconectado"}
                </span>
              </div>

              <div className="mb-5 flex gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
                <MonitorCog className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-medium">Estás configurando un computador remoto</p>
                  <p className="mt-1 text-xs leading-5 text-orange-900/80">
                    Las impresoras de este panel pertenecen a{" "}
                    <strong>{selectedAgent?.hostname ?? selectedAgent?.name}</strong>. El navegador
                    actual no puede consultar por sí solo las impresoras instaladas en el
                    dispositivo desde el que abriste la web.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Computador de impresión</Label>
                  <Select
                    value={selectedAgentId}
                    onValueChange={(value) => {
                      const agent = agents.find((entry) => entry.id === value);
                      setSelectedAgentId(value ?? "");
                      setDraft(agent ?? null);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {selectedAgent?.hostname ?? selectedAgent?.name ?? "Seleccionar"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.hostname ?? agent.name}
                          {agent.platform ? ` · ${agent.platform}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Agente: {selectedAgent?.name ?? "Sin identificar"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>
                    Impresoras reportadas por{" "}
                    {selectedAgent?.hostname ?? selectedAgent?.name ?? "el computador"}
                  </Label>
                  <Select
                    value={draft.printerName ?? ""}
                    onValueChange={(value) =>
                      setDraft((current) =>
                        current ? { ...current, printerName: value ?? "" } : current,
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>{draft.printerName ?? "Seleccionar impresora"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {draft.availablePrinters.map((printer) => (
                        <SelectItem key={printer} value={printer}>
                          {printer}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {draft.availablePrinters.length} cola(s) instalada(s) disponible(s) en ese
                    computador
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card p-5">
              <div className="mb-5">
                <h2 className="font-semibold">Formato de la comanda</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Los cambios se reflejan inmediatamente en la previsualización.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Ancho del papel</Label>
                  <Select
                    value={String(draft.paperWidth)}
                    onValueChange={(value) =>
                      setDraft((current) =>
                        current ? { ...current, paperWidth: Number(value) } : current,
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>{draft.paperWidth} mm</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58">58 mm</SelectItem>
                      <SelectItem value="80">80 mm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tamaño del texto principal</Label>
                  <Select
                    value={draft.fontSize}
                    onValueChange={(value) =>
                      setDraft((current) =>
                        current ? { ...current, fontSize: value as FontSize } : current,
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {draft.fontSize === "large"
                          ? "Grande cocina"
                          : draft.fontSize === "normal"
                            ? "Normal"
                            : "Compacto"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compact">Compacto</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="large">Grande cocina</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Caracteres por línea</Label>
                  <Input
                    type="number"
                    min={16}
                    max={64}
                    value={draft.charactersPerLine}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, charactersPerLine: Number(event.target.value) }
                          : current,
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Avance final del papel</Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={draft.feedLines}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, feedLines: Number(event.target.value) }
                          : current,
                      )
                    }
                  />
                </div>
              </div>

              <label className="mt-5 flex items-center justify-between gap-4 rounded-xl border p-4">
                <div>
                  <p className="text-sm font-medium">Impresión automática</p>
                  <p className="text-xs text-muted-foreground">
                    Pausar conserva los pedidos en cola sin perderlos.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="size-4"
                  checked={draft.isActive}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, isActive: event.target.checked } : current,
                    )
                  }
                />
              </label>

              <Button className="mt-5 w-full" disabled={isSaving} onClick={() => void saveSettings()}>
                {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Guardar y aplicar
              </Button>
            </section>
          </div>

          <div className="xl:sticky xl:top-6">
            <KitchenTicketPreview settings={draft} />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <MonitorCog className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">No hay agentes configurados</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Instala y conecta el agente del computador de cocina.
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-border/70 bg-card">
        <div className="border-b border-border/70 px-5 py-4">
          <h2 className="font-semibold">Actividad reciente</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Últimos trabajos enviados por pedidos nuevos, modificaciones y reimpresiones.
          </p>
        </div>
        <div className="divide-y divide-border/70">
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {job.status === "printed" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                ) : job.status === "processing" ? (
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                ) : job.status === "failed" ? (
                  <AlertTriangle className="size-4 shrink-0 text-red-600" />
                ) : (
                  <Clock3 className="size-4 shrink-0 text-amber-600" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {TYPE_LABEL[job.job_type]} · {STATUS_LABEL[job.status]}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {job.last_error ?? job.id}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                Intento {job.attempts}/{job.max_attempts}
              </span>
            </div>
          ))}
          {!jobs.length && (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Todavía no hay actividad de impresión.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
