import { createColumnHelper } from "@tanstack/react-table";
import { ArrowDownCircle, ArrowUpCircle, Shield, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { LoadingState } from "@/components/common/loading-state";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
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
import { cashMovementLabel, formatCurrency, formatDateTime } from "@/lib/format";
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
            await closeCash.mutateAsync(values);
            setShowClosePanel(false);
          }}
        />
      ) : null}

      <DataTable
        columns={columns}
        data={movements.data ?? []}
        emptyTitle="Sin movimientos de caja"
        emptyDescription="Abre caja o registra ingresos/retiros para iniciar el historial."
      />

      <OpenCashDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        isPending={openCash.isPending}
        onSubmit={async (values) => {
          await openCash.mutateAsync({
            openingAmount: values.openingAmount,
            notes: values.notes ?? "",
          });
        }}
      />

      <RegisterCashMovementDialog
        open={movementDialog}
        onOpenChange={setMovementDialog}
        isPending={registerMovement.isPending}
        onSubmit={async (values) => {
          await registerMovement.mutateAsync(values);
        }}
      />
    </div>
  );
}
