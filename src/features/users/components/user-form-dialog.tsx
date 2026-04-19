import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { AppUser, UserFormData } from "@/types/domain";

const schema = z.object({
  profileName: z
    .string()
    .min(3, "Nombre de perfil demasiado corto.")
    .regex(/^[a-z0-9._-]+$/i, "Usa solo letras, números, punto, guion o guion bajo."),
  fullName: z.string().min(3, "Nombre demasiado corto."),
  role: z.enum(["administrador", "cajero"]),
  isActive: z.boolean(),
  password: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export function UserFormDialog({
  open,
  onOpenChange,
  user,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: AppUser | null;
  onSubmit: (values: UserFormData) => Promise<unknown>;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      profileName: user?.profileName ?? "",
      fullName: user?.fullName ?? "",
      role: user?.role ?? "cajero",
      isActive: user?.isActive ?? true,
      password: "",
    },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      id: user?.id,
      ...values,
    });
    reset();
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{user ? "Editar usuario" : "Nuevo usuario"}</DialogTitle>
          <DialogDescription>
            Crea perfiles internos con nombre de acceso y rol operativo.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="profileName">Nombre de perfil</Label>
            <Input
              id="profileName"
              className="h-11 rounded-2xl"
              autoCapitalize="none"
              disabled={Boolean(user)}
              {...register("profileName")}
            />
            {errors.profileName ? (
              <p className="text-xs text-rose-500">{errors.profileName.message}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {user
                ? "El nombre de perfil se mantiene fijo para no romper el acceso."
                : "Se usará para iniciar sesión. Ejemplo: pablo"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Nombre completo</Label>
            <Input id="fullName" className="h-11 rounded-2xl" {...register("fullName")} />
            {errors.fullName ? <p className="text-xs text-rose-500">{errors.fullName.message}</p> : null}
          </div>

          {!user ? (
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" className="h-11 rounded-2xl" {...register("password")} />
              {errors.password ? <p className="text-xs text-rose-500">{errors.password.message}</p> : null}
              <p className="text-xs text-muted-foreground">
                Mínimo 6 caracteres.
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Rol</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-11 w-full rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="administrador">Administrador</SelectItem>
                    <SelectItem value="cajero">Cajero</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-border/70 px-4 py-3">
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
            <div>
              <p className="text-sm font-medium">Usuario activo</p>
              <p className="text-xs text-muted-foreground">Permite iniciar sesión y operar.</p>
            </div>
          </div>

          <Button type="submit" className="h-11 w-full rounded-2xl" disabled={isPending}>
            {isPending ? "Guardando..." : user ? "Guardar cambios" : "Crear usuario"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
