import { zodResolver } from "@hookform/resolvers/zod";
import {
  KeyRound,
  LogOut,
  MapPin,
  ReceiptText,
  Save,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useSignOut,
  useUpdateCurrentProfile,
  useUpdatePassword,
} from "@/features/auth/hooks/use-auth";
import type { StorefrontCustomerProfile } from "@/features/storefront/services/storefront-order-service";
import { formatCurrency } from "@/lib/format";
import type { AppUser } from "@/types/domain";
import type { StorefrontCustomerDraft } from "@/stores/storefront-cart-store";

const profileSchema = z.object({
  fullName: z.string().min(3, "Ingresa un nombre válido."),
});

const passwordSchema = z
  .object({
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
    confirmPassword: z.string().min(6, "Confirma la nueva contraseña."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

type ProfileValues = z.infer<typeof profileSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

export function StorefrontAccountSection({
  user,
  customerDraft,
  customerProfile,
  onCustomerDraftChange,
  onClose,
}: {
  user: AppUser;
  customerDraft: StorefrontCustomerDraft;
  customerProfile: StorefrontCustomerProfile | null | undefined;
  onCustomerDraftChange: (draft: Partial<StorefrontCustomerDraft>) => void;
  onClose: () => void;
}) {
  const updateCurrentProfile = useUpdateCurrentProfile();
  const updatePassword = useUpdatePassword();
  const signOut = useSignOut();
  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      fullName: user.fullName,
    },
  });
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const submitProfile = profileForm.handleSubmit(async (values) => {
    try {
      await updateCurrentProfile.mutateAsync({
        fullName: values.fullName,
      });
      toast.success("Perfil actualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el perfil.");
    }
  });

  const submitPassword = passwordForm.handleSubmit(async (values) => {
    try {
      await updatePassword.mutateAsync(values.password);
      passwordForm.reset();
      toast.success("Contraseña actualizada correctamente.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo actualizar la contraseña.",
      );
    }
  });

  const recentOrders = customerProfile?.recentOrders ?? [];
  const recommendedProducts = customerProfile?.recommendedProducts ?? [];
  const savedAddresses = customerProfile?.addresses ?? [];

  return (
    <section id="mi-cuenta" className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-[#ff2b17]">
            <UserRound className="size-4" />
            Mi cuenta
          </div>
          <h2 className="mt-1 text-2xl font-semibold text-white md:text-3xl">
            Perfil y configuración del usuario
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-300">
            Administra tus datos, deja guardada tu información de compra y revisa el historial que
            la tienda ya reconoce para futuras recomendaciones.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
          onClick={onClose}
        >
          Volver a la carta
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          className="rounded-[28px] border text-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
          style={{ backgroundColor: "#2a272f", borderColor: "rgba(255,255,255,0.08)" }}
        >
          <CardContent className="space-y-3 p-5">
           
            <p className="text-xl font-semibold">{user.fullName}</p>
            <p className="text-sm text-zinc-400">{user.email}</p>
            <Badge className="w-fit rounded-full border-0 bg-emerald-500/15 px-3 py-1 text-emerald-200">
              Sesión iniciada
            </Badge>
          </CardContent>
        </Card>

        <Card
          className="rounded-[28px] border text-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
          style={{ backgroundColor: "#2a272f", borderColor: "rgba(255,255,255,0.08)" }}
        >
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-medium text-zinc-400">Historial</p>
            <p className="text-3xl font-semibold">{recentOrders.length}</p>
            <p className="text-sm text-zinc-300">pedidos reconocidos por la tienda</p>
          </CardContent>
        </Card>

        <Card
          className="rounded-[28px] border text-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
          style={{ backgroundColor: "#2a272f", borderColor: "rgba(255,255,255,0.08)" }}
        >
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-medium text-zinc-400">Recomendaciones</p>
            <p className="text-3xl font-semibold">{recommendedProducts.length}</p>
            <p className="text-sm text-zinc-300">productos sugeridos para tu próxima compra</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-4">
          <Card
            className="rounded-[30px] border text-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
            style={{ backgroundColor: "#2a272f", borderColor: "rgba(255,255,255,0.08)" }}
          >
            <CardContent className="space-y-5 p-5">
              <div>
                <p className="text-lg font-semibold">Perfil</p>
                <p className="mt-1 text-sm text-zinc-400">
                  Actualiza cómo quieres aparecer dentro de tu cuenta.
                </p>
              </div>

              <form className="space-y-4" onSubmit={submitProfile}>
                <div className="space-y-2">
                  <Label htmlFor="profile-full-name">Nombre visible</Label>
                  <Input
                    id="profile-full-name"
                    className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                    {...profileForm.register("fullName")}
                  />
                  {profileForm.formState.errors.fullName ? (
                    <p className="text-xs text-rose-400">
                      {profileForm.formState.errors.fullName.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profile-email">Correo</Label>
                  <Input
                    id="profile-email"
                    readOnly
                    value={user.email}
                    className="h-11 rounded-2xl border-white/10 bg-white/5 text-zinc-400"
                  />
                </div>

                <Button
                  type="submit"
                  className="h-11 w-full rounded-2xl"
                  disabled={updateCurrentProfile.isPending}
                >
                  <Save className="size-4" />
                  {updateCurrentProfile.isPending ? "Guardando..." : "Guardar perfil"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card
            className="rounded-[30px] border text-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
            style={{ backgroundColor: "#2a272f", borderColor: "rgba(255,255,255,0.08)" }}
          >
            <CardContent className="space-y-5 p-5">
              <div>
                <p className="text-lg font-semibold">Seguridad</p>
                <p className="mt-1 text-sm text-zinc-400">
                  Cambia tu contraseña y administra tu sesión actual sin salir de la página.
                </p>
              </div>

              <form className="space-y-4" onSubmit={submitPassword}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="security-password">Nueva contraseña</Label>
                    <Input
                      id="security-password"
                      type="password"
                      className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                      {...passwordForm.register("password")}
                    />
                    {passwordForm.formState.errors.password ? (
                      <p className="text-xs text-rose-400">
                        {passwordForm.formState.errors.password.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="security-confirm-password">Confirmar contraseña</Label>
                    <Input
                      id="security-confirm-password"
                      type="password"
                      className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                      {...passwordForm.register("confirmPassword")}
                    />
                    {passwordForm.formState.errors.confirmPassword ? (
                      <p className="text-xs text-rose-400">
                        {passwordForm.formState.errors.confirmPassword.message}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Button
                    type="submit"
                    className="h-11 rounded-2xl"
                    disabled={updatePassword.isPending}
                  >
                    <KeyRound className="size-4" />
                    {updatePassword.isPending ? "Actualizando..." : "Actualizar contraseña"}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10"
                    disabled={signOut.isPending}
                    onClick={async () => {
                      await signOut.mutateAsync();
                    }}
                  >
                    <LogOut className="size-4" />
                    {signOut.isPending ? "Cerrando sesión..." : "Cerrar sesión"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            className="rounded-[30px] border text-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
            style={{ backgroundColor: "#2a272f", borderColor: "rgba(255,255,255,0.08)" }}
          >
            <CardContent className="space-y-5 p-5">
              <div>
                <p className="text-lg font-semibold">Datos para compra</p>
                <p className="mt-1 text-sm text-zinc-400">
                  Esta información se reutiliza para que el checkout salga más rápido.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="draft-phone">Teléfono</Label>
                  <Input
                    id="draft-phone"
                    value={customerDraft.phone}
                    onChange={(event) => onCustomerDraftChange({ phone: event.target.value })}
                    className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                    placeholder="+56 9 ..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="draft-label">Etiqueta</Label>
                  <Input
                    id="draft-label"
                    value={customerDraft.addressLabel}
                    onChange={(event) =>
                      onCustomerDraftChange({ addressLabel: event.target.value })
                    }
                    className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                    placeholder="Casa, oficina..."
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="draft-street">Dirección</Label>
                  <Input
                    id="draft-street"
                    value={customerDraft.addressStreet}
                    onChange={(event) =>
                      onCustomerDraftChange({ addressStreet: event.target.value })
                    }
                    className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                    placeholder="Calle y número"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="draft-district">Comuna</Label>
                  <Input
                    id="draft-district"
                    value={customerDraft.addressDistrict}
                    onChange={(event) =>
                      onCustomerDraftChange({ addressDistrict: event.target.value })
                    }
                    className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                    placeholder="Ej. Recoleta"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="draft-reference">Referencia</Label>
                <Input
                  id="draft-reference"
                  value={customerDraft.addressReference}
                  onChange={(event) =>
                    onCustomerDraftChange({ addressReference: event.target.value })
                  }
                  className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                  placeholder="Portón azul, local 3..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="draft-notes">Indicaciones frecuentes</Label>
                <Textarea
                  id="draft-notes"
                  value={customerDraft.notes}
                  onChange={(event) => onCustomerDraftChange({ notes: event.target.value })}
                  className="min-h-[110px] rounded-[22px] border-white/10 bg-white/5 text-white"
                  placeholder="Ej. llamar al llegar, salsa aparte..."
                />
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                Estos datos quedan listos para el siguiente checkout en este dispositivo.
              </div>
            </CardContent>
          </Card>

          <Card
            className="rounded-[30px] border text-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
            style={{ backgroundColor: "#2a272f", borderColor: "rgba(255,255,255,0.08)" }}
          >
            <CardContent className="space-y-5 p-5">
              <div className="flex items-center gap-2">
                <ReceiptText className="size-5 text-[#ff2b17]" />
                <p className="text-lg font-semibold">Historial y recomendaciones</p>
              </div>

              {customerDraft.phone.replace(/\D/g, "").length < 8 ? (
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                  Agrega tu teléfono en “Datos para compra” para enlazar tu historial y mostrar recomendaciones reales.
                </div>
              ) : null}

              {savedAddresses.length ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-zinc-400">Direcciones reconocidas</p>
                  {savedAddresses.slice(0, 2).map((address) => (
                    <div
                      key={address.id}
                      className="rounded-[22px] border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className="size-4 text-zinc-400" />
                        <p className="font-medium text-white">{address.label}</p>
                      </div>
                      <p className="mt-2 text-sm text-zinc-300">
                        {address.street}, {address.district}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {recentOrders.length ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-zinc-400">Pedidos recientes</p>
                  {recentOrders.slice(0, 3).map((order) => (
                    <div
                      key={order.id}
                      className="rounded-[22px] border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-white">{order.number}</p>
                        <span className="text-sm font-semibold text-white">
                          {formatCurrency(order.total)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-zinc-300">
                        {order.itemsSummary.join(" · ")}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {recommendedProducts.length ? (
                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-zinc-400">
                    <Sparkles className="size-4 text-[#ff2b17]" />
                    Recomendaciones
                  </p>
                  {recommendedProducts.slice(0, 3).map((product) => (
                    <div
                      key={product.productId}
                      className="rounded-[22px] border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-white">{product.productName}</p>
                        <span className="text-sm font-semibold text-white">
                          {formatCurrency(product.unitPrice)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-zinc-300">{product.categoryName}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
