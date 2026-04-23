import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import type { AppUser } from "@/types/domain";

const schema = z
  .object({
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
    confirmPassword: z.string().min(6, "Confirma la nueva contraseña."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

type Values = z.infer<typeof schema>;

export function ResetUserPasswordDialog({
  open,
  onOpenChange,
  user,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AppUser | null;
  onSubmit: (password: string) => Promise<unknown>;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit(values.password);
    reset();
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Restablecer contraseña</DialogTitle>
          <DialogDescription>
            {user
              ? `Define una nueva contraseña para @${user.profileName}. Este flujo reemplaza la clave anterior.`
              : "Selecciona un usuario para restablecer la contraseña."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="resetPassword">Nueva contraseña</Label>
            <Input
              id="resetPassword"
              type="password"
              className="h-11 rounded-2xl"
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-xs text-rose-500">{errors.password.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="resetConfirmPassword">Confirmar contraseña</Label>
            <Input
              id="resetConfirmPassword"
              type="password"
              className="h-11 rounded-2xl"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword ? (
              <p className="text-xs text-rose-500">{errors.confirmPassword.message}</p>
            ) : null}
          </div>

          <Button type="submit" className="h-11 w-full rounded-2xl" disabled={isPending || !user}>
            {isPending ? "Restableciendo..." : "Guardar nueva contraseña"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
