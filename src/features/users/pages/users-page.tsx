import { createColumnHelper } from "@tanstack/react-table";
import { KeyRound, UserCog, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { LoadingState } from "@/components/common/loading-state";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { ResetUserPasswordDialog } from "@/features/users/components/reset-user-password-dialog";
import { UserFormDialog } from "@/features/users/components/user-form-dialog";
import {
  useDeleteUser,
  useResetUserPassword,
  useSaveUser,
  useUsers,
} from "@/features/users/hooks/use-users";
import { roleLabel } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import type { AppUser } from "@/types/domain";

const columnHelper = createColumnHelper<AppUser>();

export function UsersPage() {
  const currentUser = useAuthStore((state) => state.currentUser)!;
  const users = useUsers();
  const saveUser = useSaveUser(currentUser);
  const deleteUser = useDeleteUser(currentUser);
  const resetUserPassword = useResetUserPassword(currentUser);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<AppUser | null>(null);

  const rows = users.data ?? [];
  const columns = [
    columnHelper.accessor("fullName", {
      header: "Usuario",
      cell: (info) => (
        <div>
          <p className="font-medium">{info.row.original.fullName}</p>
          <p className="text-xs text-muted-foreground">@{info.row.original.profileName}</p>
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
        <div className="flex items-center justify-end gap-2">
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
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => {
              setPasswordTarget(info.row.original);
              setResetDialogOpen(true);
            }}
          >
            <KeyRound className="size-4" />
            Restablecer clave
          </Button>
          <Button
            variant="outline"
            className="rounded-full"
            disabled={deleteUser.isPending || info.row.original.id === currentUser.id}
            onClick={async () => {
              try {
                const result = await deleteUser.mutateAsync(info.row.original.id);
                toast.success(
                  result.mode === "deleted"
                    ? "Usuario eliminado."
                    : "El usuario tiene historial y fue desactivado.",
                );
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "No se pudo eliminar el usuario.",
                );
              }
            }}
          >
            Eliminar
          </Button>
        </div>
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
        description="Perfiles internos con acceso por nombre de perfil y permisos por rol."
        action={
          <Button
            className="rounded-full"
            onClick={() => {
              setSelectedUser(null);
              setDialogOpen(true);
            }}
          >
            Crear usuario
          </Button>
        }
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
          try {
            await saveUser.mutateAsync(values);
            toast.success(selectedUser ? "Usuario actualizado." : "Usuario creado.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "No se pudo guardar el usuario.");
            throw error;
          }
        }}
      />

      <ResetUserPasswordDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        user={passwordTarget}
        isPending={resetUserPassword.isPending}
        onSubmit={async (password) => {
          if (!passwordTarget) {
            return;
          }

          try {
            await resetUserPassword.mutateAsync({ user: passwordTarget, password });
            toast.success(`Contraseña restablecida para @${passwordTarget.profileName}.`);
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "No se pudo restablecer la contraseña.",
            );
            throw error;
          }
        }}
      />
    </div>
  );
}
