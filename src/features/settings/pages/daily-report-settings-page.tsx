import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  dailyReportSettingsService,
  type DailyReportDelivery,
} from "@/features/settings/services/daily-report-settings-service";
import { formatDateTime } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function deliveryLabel(status: DailyReportDelivery["status"]) {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "processing":
      return "Enviando";
    case "sent":
      return "Enviado";
    case "failed":
      return "Con error";
    case "skipped":
      return "Omitido";
  }
}

export function DailyReportSettingsPage() {
  const currentUser = useAuthStore((state) => state.currentUser)!;
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings", "daily-report"],
    queryFn: dailyReportSettingsService.getSettings,
  });
  const deliveries = useQuery({
    queryKey: ["settings", "daily-report-deliveries"],
    queryFn: dailyReportSettingsService.listDeliveries,
  });
  const [isEnabled, setIsEnabled] = useState(true);
  const [recipients, setRecipients] = useState("");
  const [senderName, setSenderName] = useState("Pizza and Roll");
  const [subjectPrefix, setSubjectPrefix] = useState("Cierre diario");
  const [loadedSettings, setLoadedSettings] = useState(settings.data);
  const savedRecipients = settings.data?.recipients ?? [];

  if (settings.data && settings.data !== loadedSettings) {
    setLoadedSettings(settings.data);
    setIsEnabled(settings.data.isEnabled);
    setRecipients(settings.data.recipients.join("\n"));
    setSenderName(settings.data.senderName);
    setSubjectPrefix(settings.data.subjectPrefix);
  }

  const saveSettings = useMutation({
    mutationFn: async () => {
      const normalizedRecipients = [...new Set(
        recipients
          .split(/[\n,;]+/)
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
      )];
      const invalidEmail = normalizedRecipients.find((email) => !EMAIL_PATTERN.test(email));

      if (invalidEmail) {
        throw new Error(`El correo “${invalidEmail}” no es válido.`);
      }
      if (isEnabled && normalizedRecipients.length === 0) {
        throw new Error("Agrega al menos un destinatario o desactiva el envío automático.");
      }

      await dailyReportSettingsService.updateSettings(
        {
          isEnabled,
          recipients: normalizedRecipients,
          senderName: senderName.trim() || "Pizza and Roll",
          subjectPrefix: subjectPrefix.trim() || "Cierre diario",
        },
        currentUser.id,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings", "daily-report"] });
      toast.success("Configuración del informe diario guardada.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la configuración.");
    },
  });
  const retryDelivery = useMutation({
    mutationFn: dailyReportSettingsService.retryDelivery,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["settings", "daily-report-deliveries"],
      });
      toast.success("Informe enviado correctamente.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "No se pudo reenviar el informe.");
    },
  });

  if (settings.isLoading) {
    return (
      <div className="grid min-h-52 place-items-center rounded-3xl border border-border/70">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (settings.error) {
    return (
      <Card className="border-amber-300 bg-amber-50">
        <CardHeader>
          <CardTitle>Falta habilitar el informe diario</CardTitle>
          <CardDescription className="text-amber-900">
            Aplica la migración `20260726090000_add_daily_cash_report_delivery.sql` en Supabase.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-orange-100 p-2.5 text-orange-700">
              <Mail className="size-5" />
            </div>
            <div>
              <CardTitle>Informe diario por correo</CardTitle>
              <CardDescription className="mt-1">
                Al cerrar la caja se adjuntará automáticamente el PDF gerencial.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="flex items-start gap-3 rounded-2xl border border-border/70 p-4">
            <input
              type="checkbox"
              checked={isEnabled}
              className="mt-1 size-4"
              onChange={(event) => setIsEnabled(event.target.checked)}
            />
            <span>
              <span className="block font-medium">Enviar automáticamente al cerrar caja</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Si está desactivado, el PDF seguirá disponible para vista previa y descarga.
              </span>
            </span>
          </label>

          <div className="space-y-2">
            <Label htmlFor="daily-report-recipients">Destinatarios</Label>
            <Textarea
              id="daily-report-recipients"
              rows={6}
              value={recipients}
              placeholder={"administracion@empresa.cl\\ndueño@empresa.cl"}
              onChange={(event) => setRecipients(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Escribe un correo por línea. También se aceptan comas o punto y coma.
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Correos guardados</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Estos destinatarios recibirán el informe al cerrar la caja.
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                {savedRecipients.length} {savedRecipients.length === 1 ? "destinatario" : "destinatarios"}
              </span>
            </div>
            {savedRecipients.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {savedRecipients.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-foreground shadow-sm"
                  >
                    <UserRoundCheck className="size-4 text-emerald-600" />
                    {email}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                Aún no hay correos guardados.
              </p>
            )}
            {settings.data?.updatedAt ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Última actualización: {formatDateTime(settings.data.updatedAt)}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="daily-report-sender">Nombre del remitente</Label>
              <Input
                id="daily-report-sender"
                value={senderName}
                onChange={(event) => setSenderName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="daily-report-subject">Prefijo del asunto</Label>
              <Input
                id="daily-report-subject"
                value={subjectPrefix}
                onChange={(event) => setSubjectPrefix(event.target.value)}
              />
            </div>
          </div>

          <Button
            className="h-11 w-full rounded-xl"
            disabled={saveSettings.isPending}
            onClick={() => saveSettings.mutate()}
          >
            {saveSettings.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Guardar configuración
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actividad de envíos</CardTitle>
          <CardDescription>Últimos cierres procesados por el servicio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {deliveries.data?.length ? (
            deliveries.data.map((delivery) => {
              const Icon =
                delivery.status === "sent"
                  ? CheckCircle2
                  : delivery.status === "failed"
                    ? XCircle
                    : Clock3;
              return (
                <div key={delivery.id} className="rounded-2xl border border-border/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="size-4" />
                      {deliveryLabel(delivery.status)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(delivery.sentAt ?? delivery.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {delivery.recipients.join(", ") || "Sin destinatarios"}
                  </p>
                  {delivery.lastError ? (
                    <p className="mt-2 text-xs text-rose-600">{delivery.lastError}</p>
                  ) : null}
                  {delivery.status === "failed" || delivery.status === "pending" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full rounded-xl"
                      disabled={retryDelivery.isPending}
                      onClick={() => retryDelivery.mutate(delivery.sessionId)}
                    >
                      <RefreshCw
                        className={`size-3.5 ${retryDelivery.isPending ? "animate-spin" : ""}`}
                      />
                      Reintentar envío
                    </Button>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Los envíos aparecerán después del primer cierre.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
