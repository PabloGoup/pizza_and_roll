import { createColumnHelper } from "@tanstack/react-table";

import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/data-table/data-table";
import { useAuditEvents } from "@/features/audit/hooks/use-audit";
import { formatDateTime } from "@/lib/format";
import type { AuditEvent } from "@/types/domain";

const columnHelper = createColumnHelper<AuditEvent>();

export function AuditPage() {
  const audit = useAuditEvents();

  const columns = [
    columnHelper.accessor("module", {
      header: "Módulo",
    }),
    columnHelper.accessor("action", {
      header: "Acción",
    }),
    columnHelper.accessor("detail", {
      header: "Detalle",
      cell: (info) => <div className="max-w-md whitespace-normal">{info.getValue()}</div>,
    }),
    columnHelper.accessor("performedByName", {
      header: "Usuario",
    }),
    columnHelper.accessor("reason", {
      header: "Motivo",
      cell: (info) => info.getValue() ?? "—",
    }),
    columnHelper.accessor("createdAt", {
      header: "Fecha",
      cell: (info) => formatDateTime(info.getValue()),
    }),
  ];

  if (audit.isLoading) {
    return <LoadingState label="Cargando auditoría..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoría"
        description="Trazabilidad de acciones sensibles: ventas, caja, usuarios y catálogo."
      />

      <DataTable
        columns={columns}
        data={audit.data ?? []}
        emptyTitle="Sin eventos de auditoría"
        emptyDescription="Las acciones críticas del sistema quedarán registradas aquí."
      />
    </div>
  );
}
