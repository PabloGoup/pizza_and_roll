import { createColumnHelper } from "@tanstack/react-table";
import { UserCog, UserRoundCheck } from "lucide-react";
import { useState } from "react";

import { LoadingState } from "@/components/common/loading-state";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { UserFormDialog } from "@/features/users/components/user-form-dialog";
import { useSaveUser, useUsers } from "@/features/users/hooks/use-users";
import { roleLabel } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import type { AppUser } from "@/types/domain";

const columnHelper = createColumnHelper<AppUser>();

export function UsersPage() {
  const currentUser = useAuthStore((state) => state.currentUser)!;
  const users = useUsers();
  const saveUser = useSaveUser(currentUser);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);

  const rows = users.data ?? [];
  const columns = [
    columnHelper.accessor("fullName", {
      header: "Usuario",
      cell: (info) => (
        <div>
          <p className="font-medium">{info.row.original.fullName}</p>
          <p className="text-xs text-muted-foreground">{info.row.original.email}</p>
        </div>
      ),
    }),
    columnHelper.accessor("role", {
      header: "Rol",
      cell: (info) => roleLabel(info.getValue()),
    }),
    columnHelper.accessor("isActive", {
      header: "Estado",
      cell: (info) => (
        <StatusBadge
          label={info.getValue() ? "Activo" : "Bloqueado"}
          tone={info.getValue() ? "success" : "warning"}
        />
      ),
    }),
    columnHelper.accessor("lastLoginAt", {
      header: "Último acceso",
      cell: (info) => info.getValue() ?? "Sin actividad",
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: (info) => (
        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => {
            setSelectedUser(info.row.original);
            setDialogOpen(true);
          }}
        >
          Editar
        </Button>
      ),
    }),
  ];

  if (users.isLoading) {
    return <LoadingState label="Cargando usuarios..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios y roles"
        description="Perfiles internos asociados a Supabase Auth con permisos por rol."
        action={<span className="text-sm text-muted-foreground">Usuarios sincronizados desde Supabase Auth</span>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Total usuarios"
          value={rows.length.toString()}
          hint="Perfiles disponibles"
          icon={<UserCog className="size-4" />}
        />
        <MetricCard
          label="Activos"
          value={rows.filter((user) => user.isActive).length.toString()}
          hint="Con acceso habilitado"
          icon={<UserRoundCheck className="size-4" />}
        />
        <MetricCard
          label="Administradores"
          value={rows.filter((user) => user.role === "administrador").length.toString()}
          hint="Con control completo"
          icon={<UserRoundCheck className="size-4" />}
        />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        emptyTitle="Sin usuarios cargados"
        emptyDescription="Agrega perfiles para separar accesos entre administración y caja."
      />

      <UserFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={selectedUser}
        isPending={saveUser.isPending}
        onSubmit={async (values) => {
          await saveUser.mutateAsync(values);
        }}
      />
    </div>
  );
}
