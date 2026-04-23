import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, LogOut, Settings2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChangePasswordDialog } from "@/features/auth/components/change-password-dialog";
import {
  useSignOut,
  useUpdateCurrentProfile,
  useUpdatePassword,
} from "@/features/auth/hooks/use-auth";
import type { AppUser } from "@/types/domain";

const profileSchema = z.object({
  fullName: z.string().min(3, "Ingresa un nombre válido."),
});

type ProfileValues = z.infer<typeof profileSchema>;

export function StorefrontAccountDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AppUser | null;
}) {
  const updateCurrentProfile = useUpdateCurrentProfile();
  const updatePassword = useUpdatePassword();
  const signOut = useSignOut();
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: user?.fullName ?? "",
    },
  });

  useEffect(() => {
    reset({
      fullName: user?.fullName ?? "",
    });
  }, [reset, user]);

  const submitProfile = handleSubmit(async (values) => {
    try {
      await updateCurrentProfile.mutateAsync({
        fullName: values.fullName,
      });
      toast.success("Perfil actualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el perfil.");
    }
  });

  if (!user) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[28px] border-white/10 bg-[#232128] p-0 text-white sm:max-w-2xl">
          <div className="space-y-5 p-6">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-2xl font-semibold">Mi cuenta</DialogTitle>
              <DialogDescription className="text-sm text-zinc-400">
                Administra tu perfil y la configuración de acceso desde la tienda online.
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="perfil" className="gap-5">
              <TabsList className="grid h-auto w-full grid-cols-2 rounded-full bg-white/5 p-1">
                <TabsTrigger className="rounded-full py-2.5 text-sm" value="perfil">
                  <UserRound className="size-4" />
                  Perfil
                </TabsTrigger>
                <TabsTrigger className="rounded-full py-2.5 text-sm" value="configuracion">
                  <Settings2 className="size-4" />
                  Configuración
                </TabsTrigger>
              </TabsList>

              <TabsContent value="perfil" className="space-y-5">
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">{user.fullName}</p>
                  <p className="mt-1 text-xs text-zinc-400">{user.email}</p>
                </div>

                <form className="space-y-4" onSubmit={submitProfile}>
                  <div className="space-y-2">
                    <Label htmlFor="storefront-account-full-name">Nombre visible</Label>
                    <Input
                      id="storefront-account-full-name"
                      className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                      placeholder="Tu nombre"
                      {...register("fullName")}
                    />
                    {errors.fullName ? (
                      <p className="text-xs text-rose-400">{errors.fullName.message}</p>
                    ) : (
                      <p className="text-xs text-zinc-400">
                        Este nombre se mostrará cuando vuelvas a iniciar sesión y en tu historial de pedidos.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="storefront-account-email">Correo</Label>
                    <Input
                      id="storefront-account-email"
                      value={user.email}
                      readOnly
                      className="h-11 rounded-2xl border-white/10 bg-white/5 text-zinc-400"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="h-11 w-full rounded-2xl text-sm font-semibold"
                    disabled={updateCurrentProfile.isPending}
                  >
                    {updateCurrentProfile.isPending ? "Guardando..." : "Guardar perfil"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="configuracion" className="space-y-4">
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">Seguridad</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Cambia tu contraseña o cierra tu sesión actual desde aquí.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => setPasswordDialogOpen(true)}
                >
                  <KeyRound className="size-4" />
                  Cambiar contraseña
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10"
                  onClick={async () => {
                    await signOut.mutateAsync();
                    onOpenChange(false);
                  }}
                  disabled={signOut.isPending}
                >
                  <LogOut className="size-4" />
                  {signOut.isPending ? "Cerrando sesión..." : "Cerrar sesión"}
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      <ChangePasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
        isPending={updatePassword.isPending}
        onSubmit={async (password) => {
          try {
            await updatePassword.mutateAsync(password);
            toast.success("Contraseña actualizada correctamente.");
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "No se pudo actualizar la contraseña.",
            );
            throw error;
          }
        }}
      />
    </>
  );
}
