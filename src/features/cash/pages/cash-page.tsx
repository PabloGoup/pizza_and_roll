import { createColumnHelper } from "@tanstack/react-table";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BanknoteArrowDown,
  BanknoteArrowUp,
  FileText,
  HandCoins,
  ReceiptText,
  Shield,
  ShoppingBag,
  Undo2,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { LoadingState } from "@/components/common/loading-state";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CloseCashPanel } from "@/features/cash/components/close-cash-panel";
import { CashReportDialog } from "@/features/cash/components/cash-report-dialog";
import { ClosedSessionsHistory } from "@/features/cash/components/closed-sessions-history";
import { OpenCashDialog } from "@/features/cash/components/open-cash-dialog";
import {
  RegisterCashMovementDialog,
  type CashMovementPreset,
} from "@/features/cash/components/register-cash-movement-dialog";
import {
  useCloseCash,
  useClosedCashSessions,
  useCurrentCashSession,
  useCurrentCloseSummary,
  useCashMovements,
  useOpenCash,
  useRegisterCashMovement,
  useCashReports,
  useGenerateCashReport,
  useSuggestedOpeningAmount,
  useUndoLastCashMovement,
} from "@/features/cash/hooks/use-cash";
import { useUpdateOrderPaymentMethod } from "@/features/sales/hooks/use-sales";
import {
  cashMovementLabel,
  cashPaymentCategoryLabel,
  formatCurrency,
  formatDateTime,
} from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import type { CashMovement, CashReport } from "@/types/domain";

const columnHelper = createColumnHelper<CashMovement>();

export function CashPage() {
  const currentUser = useAuthStore((state) => state.currentUser)!;
  const session = useCurrentCashSession();
  const closeSummary = useCurrentCloseSummary(Boolean(session.data));
  const movements = useCashMovements();
  const openCash = useOpenCash(currentUser);
  const registerMovement = useRegisterCashMovement(currentUser);
  const undoLastMovement = useUndoLastCashMovement(currentUser);
  const closeCash = useCloseCash(currentUser);
  const closedSessions = useClosedCashSessions();
  const updateOrderPaymentMethod = useUpdateOrderPaymentMethod(currentUser);
  const reports = useCashReports();
  const suggestedOpening = useSuggestedOpeningAmount();
  const generateReport = useGenerateCashReport(currentUser);
  const [openDialog, setOpenDialog] = useState(false);
  const [movementPreset, setMovementPreset] = useState<CashMovementPreset | null>(null);
  const [showClosePanel, setShowClosePanel] = useState(false);
  const [section, setSection] = useState<"movimientos" | "pagos" | "historial" | "reportes">("movimientos");
  const [selectedReport, setSelectedReport] = useState<CashReport | null>(null);
  const [showUndoConfirmation, setShowUndoConfirmation] = useState(false);

  const columns = [
    columnHelper.accessor("type", {
      header: "Tipo",
      cell: (info) => <StatusBadge label={cashMovementLabel(info.getValue())} tone="neutral" />,
    }),
    columnHelper.accessor("amount", {
      header: "Monto",
      cell: (info) => formatCurrency(info.getValue()),
    }),
    columnHelper.accessor("reason", {
      header: "Motivo",
    }),
    columnHelper.accessor("performedByName", {
      header: "Usuario",
    }),
    columnHelper.accessor("createdAt", {
      header: "Fecha",
      cell: (info) => formatDateTime(info.getValue()),
    }),
  ];

  const paymentColumns = [
    columnHelper.accessor("paymentCategory", {
      header: "Categoría",
      cell: (info) =>
        info.getValue() ? cashPaymentCategoryLabel(info.getValue()!) : "Otro pago",
    }),
    columnHelper.accessor("amount", {
      header: "Monto",
      cell: (info) => formatCurrency(info.getValue()),
    }),
    columnHelper.accessor("reason", {
      header: "Detalle",
    }),
    columnHelper.accessor("performedByName", {
      header: "Usuario",
    }),
    columnHelper.accessor("createdAt", {
      header: "Fecha",
      cell: (info) => formatDateTime(info.getValue()),
    }),
  ];

  const paymentRows = useMemo(
    () => (movements.data ?? []).filter((movement) => movement.type === "retiro"),
    [movements.data],
  );
  const lastUndoableMovement = useMemo(
    () =>
      (movements.data ?? []).find(
        (movement) =>
          (movement.type === "ingreso" || movement.type === "retiro") &&
          !movement.linkedOrderId,
      ) ?? null,
    [movements.data],
  );

  const paymentSummary = useMemo(
    () =>
      paymentRows.reduce(
        (acc, movement) => {
          acc.total += movement.amount;

          switch (movement.paymentCategory) {
            case "gasto_diario":
              acc.gastoDiario += movement.amount;
              break;
            case "compra":
              acc.compras += movement.amount;
              break;
            case "adelanto":
              acc.adelantos += movement.amount;
              break;
            case "pago_sueldo":
              acc.sueldos += movement.amount;
              break;
            default:
              acc.otros += movement.amount;
              break;
          }

          return acc;
        },
        { total: 0, gastoDiario: 0, compras: 0, adelantos: 0, sueldos: 0, otros: 0 },
      ),
    [paymentRows],
  );

  if (session.isLoading || movements.isLoading) {
    return <LoadingState label="Cargando estado de caja..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caja"
        description="Apertura, ingresos, retiros y cierre diario con trazabilidad por usuario."
        action={
          <div className="flex flex-wrap gap-2">
            {!session.data ? (
              <Button className="rounded-full" onClick={() => setOpenDialog(true)}>
                Abrir caja
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="rounded-full"
                  disabled={generateReport.isPending}
                  onClick={async () => {
                    try {
                      setSelectedReport(await generateReport.mutateAsync("X"));
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "No se pudo generar el Corte X.");
                    }
                  }}
                >
                  Corte X
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full"
                  disabled={generateReport.isPending}
                  onClick={async () => {
                    try {
                      setSelectedReport(await generateReport.mutateAsync("Z"));
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "No se pudo generar el Corte Z.");
                    }
                  }}
                >
                  Corte Z
                </Button>
                <Button variant="outline" className="rounded-full" onClick={() => setMovementPreset("retiro")}>
                  Registrar operación
                </Button>
                <Button className="rounded-full" onClick={() => setShowClosePanel(true)}>
                  Cerrar caja
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Estado"
          value={session.data ? "Abierta" : "Sin sesión"}
          hint={session.data ? `Turno de ${session.data.cashierName}` : "Lista para apertura"}
          icon={<Shield className="size-4" />}
        />
        <MetricCard
          label="Monto inicial"
          value={formatCurrency(session.data?.openingAmount ?? 0)}
          hint="Fondo informado al abrir"
          icon={<Wallet className="size-4" />}
        />
        <MetricCard
          label="Esperado"
          value={formatCurrency(
            session.data ? (closeSummary.data?.cash.expectedAmount ?? 0) : 0,
          )}
          hint={
            session.data
              ? "Ventas en efectivo + fondo neto de caja"
              : "Se calculará al abrir la caja"
          }
          icon={<ArrowUpCircle className="size-4" />}
        />
        <MetricCard
          label="Movimientos"
          value={(movements.data?.length ?? 0).toString()}
          hint="Historial del día"
          icon={<ArrowDownCircle className="size-4" />}
        />
      </div>

      {session.data ? (
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Operaciones de caja</CardTitle>
            <p className="text-sm text-muted-foreground">
              Registra cada entrada o salida. El monto actualizará inmediatamente el efectivo esperado.
            </p>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { preset: "ingreso", label: "Ingreso", icon: BanknoteArrowUp },
              { preset: "retiro", label: "Retiro", icon: BanknoteArrowDown },
              { preset: "compra", label: "Compra", icon: ShoppingBag },
              { preset: "pago_sueldo", label: "Pago sueldo", icon: ReceiptText },
              { preset: "adelanto", label: "Adelanto", icon: HandCoins },
              { preset: "otro_pago", label: "Otro pago", icon: Wallet },
            ].map((action) => (
              <Button
                key={action.preset}
                type="button"
                variant="outline"
                className="h-14 justify-start rounded-2xl px-4"
                onClick={() => setMovementPreset(action.preset as CashMovementPreset)}
              >
                <action.icon className="mr-2 size-4" />
                {action.label}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              className="h-14 justify-start rounded-2xl border-rose-200 px-4 text-rose-600 hover:bg-rose-50 hover:text-rose-700 lg:col-span-2"
              disabled={!lastUndoableMovement || undoLastMovement.isPending}
              onClick={() => setShowUndoConfirmation(true)}
            >
              <Undo2 className="mr-2 size-4" />
              {lastUndoableMovement ? "Deshacer último movimiento" : "Nada que deshacer"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {showClosePanel && session.data ? (
        <CloseCashPanel
          summary={closeSummary.data}
          isLoadingSummary={closeSummary.isLoading || closeSummary.isFetching}
          isPending={closeCash.isPending}
          paymentUpdatePending={updateOrderPaymentMethod.isPending}
          onCancel={() => setShowClosePanel(false)}
          onUpdateOrderPaymentMethod={async (orderId, paymentMethod) => {
            try {
              await updateOrderPaymentMethod.mutateAsync({ orderId, paymentMethod });
              toast.success("Medio de pago actualizado.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "No se pudo actualizar el medio de pago.");
            }
          }}
          onSubmit={async (values) => {
            try {
              const result = await closeCash.mutateAsync(values);
              setShowClosePanel(false);
              setSelectedReport(result.report);
              toast.success("Caja cerrada correctamente.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "No se pudo cerrar la caja.");
            }
          }}
        />
      ) : null}

      <Tabs
        value={section}
        onValueChange={(value) => setSection(value as "movimientos" | "pagos" | "historial" | "reportes")}
        className="space-y-4"
      >
        <TabsList variant="line">
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
          <TabsTrigger value="historial">Historial de cajas</TabsTrigger>
          <TabsTrigger value="reportes">Cortes y cuadraturas</TabsTrigger>
        </TabsList>

        <TabsContent value="movimientos" className="m-0">
          <DataTable
            columns={columns}
            data={movements.data ?? []}
            emptyTitle="Sin movimientos de caja"
            emptyDescription="Abre caja o registra ingresos/retiros para iniciar el historial."
          />
        </TabsContent>

        <TabsContent value="pagos" className="m-0 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard
              label="Pagos totales"
              value={formatCurrency(paymentSummary.total)}
              hint={`${paymentRows.length} registros`}
              icon={<ArrowDownCircle className="size-4" />}
            />
            <MetricCard
              label="Gastos diarios"
              value={formatCurrency(paymentSummary.gastoDiario)}
              hint="Retiros operativos"
              icon={<ArrowDownCircle className="size-4" />}
            />
            <MetricCard
              label="Compras"
              value={formatCurrency(paymentSummary.compras)}
              hint="Insumos y abastecimiento"
              icon={<ShoppingBag className="size-4" />}
            />
            <MetricCard
              label="Adelantos"
              value={formatCurrency(paymentSummary.adelantos)}
              hint="Anticipos al personal"
              icon={<ArrowDownCircle className="size-4" />}
            />
            <MetricCard
              label="Pagos sueldo"
              value={formatCurrency(paymentSummary.sueldos)}
              hint="Sueldos y abonos"
              icon={<ArrowDownCircle className="size-4" />}
            />
            <MetricCard
              label="Otros pagos"
              value={formatCurrency(paymentSummary.otros)}
              hint="Retiros no clasificados"
              icon={<ArrowDownCircle className="size-4" />}
            />
          </div>

          <DataTable
            columns={paymentColumns}
            data={paymentRows}
            emptyTitle="Sin pagos registrados"
            emptyDescription="Registra retiros clasificados para controlar sueldos, adelantos y gastos."
          />
        </TabsContent>

        <TabsContent value="historial" className="m-0">
          <ClosedSessionsHistory
            sessions={closedSessions.data ?? []}
            isLoading={closedSessions.isLoading}
          />
        </TabsContent>

        <TabsContent value="reportes" className="m-0">
          <div className="space-y-3">
            {(reports.data ?? []).map((report) => (
              <button
                key={report.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-4 text-left transition-colors hover:bg-muted/30"
                onClick={() => setSelectedReport(report)}
              >
                <span className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-muted"><FileText className="size-4" /></span>
                  <span><span className="block font-medium">{report.type === "CUADRATURA" ? "Cuadratura" : `Corte ${report.type}`}</span><span className="block text-xs text-muted-foreground">{report.reportNumber} · {report.generatedByName}</span></span>
                </span>
                <span className="text-right"><span className="block font-semibold">{formatCurrency(report.totalSales)}</span><span className="block text-xs text-muted-foreground">{report.ordersCount} ventas</span></span>
              </button>
            ))}
            {!reports.isLoading && !reports.data?.length ? (
              <p className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">Aún no hay cortes ni cuadraturas guardados.</p>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>

      <OpenCashDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        isPending={openCash.isPending}
        suggestedAmount={suggestedOpening.data}
        onSubmit={async (values) => {
          try {
            await openCash.mutateAsync({
              openingAmount: values.openingAmount,
              notes: values.notes ?? "",
            });
            toast.success("Caja abierta correctamente.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "No se pudo abrir la caja.");
          }
        }}
      />

      <CashReportDialog report={selectedReport} onClose={() => setSelectedReport(null)} />

      <RegisterCashMovementDialog
        key={movementPreset ?? "closed"}
        open={Boolean(movementPreset)}
        preset={movementPreset}
        onOpenChange={(open) => {
          if (!open) setMovementPreset(null);
        }}
        isPending={registerMovement.isPending}
        onSubmit={async (values) => {
          try {
            await registerMovement.mutateAsync(values);
            toast.success("Movimiento registrado.");
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "No se pudo registrar el movimiento.",
            );
          }
        }}
      />

      <AlertDialog open={showUndoConfirmation} onOpenChange={setShowUndoConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Deshacer el último movimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              {lastUndoableMovement
                ? `${cashMovementLabel(lastUndoableMovement.type)} por ${formatCurrency(lastUndoableMovement.amount)}: ${lastUndoableMovement.reason}. La reversa quedará registrada en Auditoría.`
                : "No hay un ingreso o retiro manual disponible para deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={undoLastMovement.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!lastUndoableMovement || undoLastMovement.isPending}
              onClick={async () => {
                try {
                  await undoLastMovement.mutateAsync();
                  setShowUndoConfirmation(false);
                  toast.success("Último movimiento deshecho y registrado en Auditoría.");
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "No se pudo deshacer el último movimiento.",
                  );
                }
              }}
            >
              {undoLastMovement.isPending ? "Deshaciendo..." : "Sí, deshacer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
