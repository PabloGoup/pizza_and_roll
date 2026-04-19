import { createColumnHelper } from "@tanstack/react-table";
import { ArrowDownCircle, ArrowUpCircle, Shield, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { LoadingState } from "@/components/common/loading-state";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CloseCashPanel } from "@/features/cash/components/close-cash-panel";
import { OpenCashDialog } from "@/features/cash/components/open-cash-dialog";
import { RegisterCashMovementDialog } from "@/features/cash/components/register-cash-movement-dialog";
import {
  useCloseCash,
  useCurrentCashSession,
  useCurrentCloseSummary,
  useCashMovements,
  useOpenCash,
  useRegisterCashMovement,
} from "@/features/cash/hooks/use-cash";
import { useUpdateOrderPaymentMethod } from "@/features/sales/hooks/use-sales";
import {
  cashMovementLabel,
  cashPaymentCategoryLabel,
  formatCurrency,
  formatDateTime,
} from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import type { CashMovement } from "@/types/domain";

const columnHelper = createColumnHelper<CashMovement>();

export function CashPage() {
  const currentUser = useAuthStore((state) => state.currentUser)!;
  const session = useCurrentCashSession();
  const closeSummary = useCurrentCloseSummary(Boolean(session.data));
  const movements = useCashMovements();
  const openCash = useOpenCash(currentUser);
  const registerMovement = useRegisterCashMovement(currentUser);
  const closeCash = useCloseCash(currentUser);
  const updateOrderPaymentMethod = useUpdateOrderPaymentMethod(currentUser);
  const [openDialog, setOpenDialog] = useState(false);
  const [movementDialog, setMovementDialog] = useState(false);
  const [showClosePanel, setShowClosePanel] = useState(false);
  const [section, setSection] = useState<"movimientos" | "pagos">("movimientos");

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

  const paymentSummary = useMemo(
    () =>
      paymentRows.reduce(
        (acc, movement) => {
          acc.total += movement.amount;

          switch (movement.paymentCategory) {
            case "gasto_diario":
              acc.gastoDiario += movement.amount;
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
        { total: 0, gastoDiario: 0, adelantos: 0, sueldos: 0, otros: 0 },
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
                <Button variant="outline" className="rounded-full" onClick={() => setMovementDialog(true)}>
                  Registrar movimiento
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
          value={formatCurrency(session.data?.expectedAmount ?? 0)}
          hint="Según movimientos y ventas en efectivo"
          icon={<ArrowUpCircle className="size-4" />}
        />
        <MetricCard
          label="Movimientos"
          value={(movements.data?.length ?? 0).toString()}
          hint="Historial del día"
          icon={<ArrowDownCircle className="size-4" />}
        />
      </div>

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
              await closeCash.mutateAsync(values);
              setShowClosePanel(false);
              toast.success("Caja cerrada correctamente.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "No se pudo cerrar la caja.");
            }
          }}
        />
      ) : null}

      <Tabs
        value={section}
        onValueChange={(value) => setSection(value as "movimientos" | "pagos")}
        className="space-y-4"
      >
        <TabsList variant="line">
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Pagos totales"
              value={formatCurrency(paymentSummary.total)}
              hint={`${paymentRows.length} registros`}
              icon={<ArrowDownCircle className="size-4" />}
            />
            <MetricCard
              label="Gastos diarios"
              value={formatCurrency(paymentSummary.gastoDiario)}
              hint="Operación y compras"
              icon={<ArrowDownCircle className="size-4" />}
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
      </Tabs>

      <OpenCashDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        isPending={openCash.isPending}
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

      <RegisterCashMovementDialog
        open={movementDialog}
        onOpenChange={setMovementDialog}
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
    </div>
  );
}
