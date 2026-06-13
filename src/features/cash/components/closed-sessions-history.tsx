import { createColumnHelper } from "@tanstack/react-table";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSessionMovements } from "@/features/cash/hooks/use-cash";
import { cashMovementLabel, formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CashSession } from "@/types/domain";

const columnHelper = createColumnHelper<CashSession>();

function totalDifference(session: CashSession) {
  return (
    (session.differenceAmount ?? 0) +
    (session.differenceCardAmount ?? 0) +
    (session.differenceTransferAmount ?? 0)
  );
}

function differenceTone(value: number) {
  if (value === 0) {
    return "text-emerald-600";
  }

  return value > 0 ? "text-sky-600" : "text-rose-500";
}

function MethodRow({
  label,
  expected,
  counted,
  difference,
}: {
  label: string;
  expected: number;
  counted: number | null | undefined;
  difference: number | null | undefined;
}) {
  const diff = difference ?? 0;

  return (
    <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-3 px-4 py-3 text-sm">
      <span className="font-medium">{label}</span>
      <span>{formatCurrency(expected)}</span>
      <span>{formatCurrency(counted ?? expected)}</span>
      <span className={cn("font-medium", differenceTone(diff))}>{formatCurrency(diff)}</span>
    </div>
  );
}

function SessionDetailDialog({
  session,
  onClose,
}: {
  session: CashSession;
  onClose: () => void;
}) {
  const movements = useSessionMovements(session.id);
  const diff = totalDifference(session);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-[760px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cierre de {session.cashierName}</DialogTitle>
          <DialogDescription>
            Abierta {formatDateTime(session.openedAt)}
            {session.closedAt ? ` · Cerrada ${formatDateTime(session.closedAt)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Monto inicial
              </p>
              <p className="mt-1 text-xl font-semibold">{formatCurrency(session.openingAmount)}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Efectivo esperado
              </p>
              <p className="mt-1 text-xl font-semibold">{formatCurrency(session.expectedAmount)}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Diferencia total
              </p>
              <p className={cn("mt-1 text-xl font-semibold", differenceTone(diff))}>
                {formatCurrency(diff)}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/70">
            <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-3 border-b border-border/70 bg-muted/30 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              <span>Medio</span>
              <span>Esperado</span>
              <span>Contado</span>
              <span>Diferencia</span>
            </div>
            <MethodRow
              label="Efectivo"
              expected={session.expectedAmount}
              counted={session.countedAmount}
              difference={session.differenceAmount}
            />
            <MethodRow
              label="Tarjeta"
              expected={session.expectedCardAmount}
              counted={session.countedCardAmount}
              difference={session.differenceCardAmount}
            />
            <MethodRow
              label="Transferencia"
              expected={session.expectedTransferAmount}
              counted={session.countedTransferAmount}
              difference={session.differenceTransferAmount}
            />
          </div>

          {session.notes ? (
            <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">
              <span className="font-medium">Notas del cierre: </span>
              {session.notes}
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium">Movimientos del turno</p>
            {movements.isLoading ? (
              <LoadingState label="Cargando movimientos..." />
            ) : movements.data?.length ? (
              <div className="space-y-1">
                {movements.data.map((movement) => (
                  <div
                    key={movement.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <StatusBadge label={cashMovementLabel(movement.type)} tone="neutral" />
                      <span className="text-muted-foreground">{movement.reason}</span>
                    </div>
                    <span className="font-medium">{formatCurrency(movement.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ClosedSessionsHistory({
  sessions,
  isLoading,
}: {
  sessions: CashSession[];
  isLoading: boolean;
}) {
  const [selected, setSelected] = useState<CashSession | null>(null);

  const columns = useMemo(
    () => [
      columnHelper.accessor("closedAt", {
        header: "Cierre",
        cell: (info) => (info.getValue() ? formatDateTime(info.getValue()!) : "—"),
      }),
      columnHelper.accessor("cashierName", {
        header: "Cajero",
      }),
      columnHelper.accessor("openingAmount", {
        header: "Apertura",
        cell: (info) => formatCurrency(info.getValue()),
      }),
      columnHelper.accessor("expectedAmount", {
        header: "Efectivo esperado",
        cell: (info) => formatCurrency(info.getValue()),
      }),
      columnHelper.display({
        id: "difference",
        header: "Diferencia total",
        cell: (info) => {
          const diff = totalDifference(info.row.original);
          return (
            <span className={cn("font-medium", differenceTone(diff))}>{formatCurrency(diff)}</span>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="xs"
              className="rounded-full"
              onClick={() => setSelected(info.row.original)}
            >
              Ver detalle
            </Button>
          </div>
        ),
      }),
    ],
    [],
  );

  function exportCsv() {
    downloadCsv(
      `cierres-caja-${new Date().toISOString().slice(0, 10)}`,
      [
        "Apertura",
        "Cierre",
        "Cajero",
        "Monto inicial",
        "Efectivo esperado",
        "Efectivo contado",
        "Dif. efectivo",
        "Tarjeta esperada",
        "Tarjeta contada",
        "Dif. tarjeta",
        "Transferencia esperada",
        "Transferencia contada",
        "Dif. transferencia",
        "Diferencia total",
        "Notas",
      ],
      sessions.map((s) => [
        s.openedAt,
        s.closedAt ?? "",
        s.cashierName,
        s.openingAmount,
        s.expectedAmount,
        s.countedAmount ?? "",
        s.differenceAmount ?? 0,
        s.expectedCardAmount,
        s.countedCardAmount ?? "",
        s.differenceCardAmount ?? 0,
        s.expectedTransferAmount,
        s.countedTransferAmount ?? "",
        s.differenceTransferAmount ?? 0,
        totalDifference(s),
        s.notes ?? "",
      ]),
    );
  }

  if (isLoading) {
    return <LoadingState label="Cargando historial de cajas..." />;
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={exportCsv}
          disabled={!sessions.length}
        >
          <Download className="size-4" />
          Exportar CSV
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={sessions}
        emptyTitle="Sin cierres registrados"
        emptyDescription="Los cierres de caja anteriores aparecerán aquí con su diferencia por método."
      />
      {selected ? (
        <SessionDetailDialog session={selected} onClose={() => setSelected(null)} />
      ) : null}
    </>
  );
}
