import { zodResolver } from "@hookform/resolvers/zod";
import {
  LockKeyhole,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UserRoundPlus,
} from "lucide-react";
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
import { useSignIn, useSignUpCustomer } from "@/features/auth/hooks/use-auth";

const loginSchema = z.object({
  profileName: z.string().min(3, "Ingresa un perfil o correo válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
});

const signupSchema = z
  .object({
    fullName: z.string().min(3, "Ingresa tu nombre completo."),
    email: z.string().email("Ingresa un correo válido."),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
    confirmPassword: z.string().min(6, "Confirma la contraseña."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;

const sushiBackground = new URL("../../../../fondos/Fondo sushi.png", import.meta.url).href;

const fieldClassName =
  "h-12 rounded-2xl border border-white/10 bg-white/5 text-white placeholder:text-zinc-500 focus:border-[#ff3b26]/50 focus:ring-0 [&:-webkit-autofill]:border-white/10 [&:-webkit-autofill]:shadow-[inset_0_0_0px_1000px_rgba(42,39,47,1)] [&:-webkit-autofill]:[-webkit-text-fill-color:white]";

export function StorefrontAuthDialog({
  open,
  mode = "login",
  onOpenChange,
}: {
  open: boolean;
  mode?: "login" | "signup";
  onOpenChange: (open: boolean) => void;
}) {
  const signIn = useSignIn();
  const signUpCustomer = useSignUpCustomer();
  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      profileName: "",
      password: "",
    },
  });
  const signupForm = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const submitLogin = loginForm.handleSubmit(async (values) => {
    try {
      const user = await signIn.mutateAsync(values);
      toast.success(
        user.role === "cliente"
          ? "Sesión iniciada. Ya puedes seguir comprando."
          : "Sesión iniciada. El acceso al POS ya está disponible.",
      );
      loginForm.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo iniciar sesión.");
    }
  });

  const submitSignup = signupForm.handleSubmit(async (values) => {
    try {
      const result = await signUpCustomer.mutateAsync({
        fullName: values.fullName,
        email: values.email,
        password: values.password,
      });

      signupForm.reset();
      onOpenChange(false);

      if (result.requiresEmailVerification) {
        toast.success("Cuenta creada. Revisa tu correo para confirmar el acceso.");
        return;
      }

      toast.success("Cuenta creada. Ya puedes comprar con tu sesión activa.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear la cuenta.");
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-1.25rem)] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[30px] border border-white/10 bg-[#232128] p-0 text-white shadow-[0_30px_120px_rgba(0,0,0,0.45)] sm:max-w-4xl">
        <div className="grid max-h-[calc(100vh-1.25rem)] overflow-y-auto lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
          <div className="relative overflow-hidden border-b border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(255,59,38,0.2),transparent_32%),linear-gradient(180deg,#2b2831_0%,#221f27_100%)] p-6 lg:border-r lg:border-b-0 lg:p-8">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-[0.08]"
              style={{ backgroundImage: `url(${sushiBackground})` }}
            />
            <div className="relative space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#ff3b26]/20 bg-[#ff3b26]/10 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-[#ff8f82] uppercase">
                <Sparkles className="size-3.5" />
                Acceso web
              </div>

              <DialogHeader className="space-y-3 text-left">
                <DialogTitle className="max-w-sm text-3xl leading-tight font-semibold">
                  Acceso a la tienda
                </DialogTitle>
                <DialogDescription className="max-w-md text-sm leading-7 text-zinc-300">
                  Entra para comprar más rápido, guardar tus datos y revisar tu historial. El
                  acceso al POS se habilita solo para cajeros y administradores.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <div className="rounded-[24px] border border-white/8 bg-black/15 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-2xl bg-[#ff3b26]/14 text-[#ff8f82]">
                      <ShoppingBag className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Compra más rápido</p>
                      <p className="text-xs leading-5 text-zinc-400">
                        Guarda tu información para repetir pedidos sin empezar de cero.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/8 bg-black/15 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-200">
                      <ShieldCheck className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Acceso protegido</p>
                      <p className="text-xs leading-5 text-zinc-400">
                        Clientes, cajeros y administradores se validan con el mismo flujo.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/8 bg-black/15 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-2xl bg-white/8 text-zinc-100">
                      <LockKeyhole className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">POS interno separado</p>
                      <p className="text-xs leading-5 text-zinc-400">
                        Si tu cuenta tiene permisos internos, el botón POS aparece automáticamente.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#26222b] p-5 sm:p-6 lg:p-8">
            <Tabs key={`${open ? "open" : "closed"}-${mode}`} defaultValue={mode} className="gap-5">
              <TabsList className="grid h-auto w-full grid-cols-2 rounded-full border border-white/8 bg-[#312d37] p-1">
                <TabsTrigger
                  className="rounded-full py-3 text-sm font-semibold data-active:bg-[#ff3b26] data-active:text-white"
                  value="login"
                >
                  Ingresar
                </TabsTrigger>
                <TabsTrigger
                  className="rounded-full py-3 text-sm font-semibold data-active:bg-[#ff3b26] data-active:text-white"
                  value="signup"
                >
                  Crear cuenta
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-0">
                <div className="rounded-[28px] border border-white/8 bg-[#2f2b35] p-4 sm:p-5">
                  <div className="mb-5 flex items-start gap-3">
                    <div className="mt-0.5 flex size-11 items-center justify-center rounded-2xl bg-[#ff3b26]/12 text-[#ff8f82]">
                      <UserRoundPlus className="size-5" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-white">Entrar a tu cuenta</p>
                      <p className="text-sm leading-6 text-zinc-400">
                        Usa tu perfil interno o tu correo si ya tienes una cuenta activa.
                      </p>
                    </div>
                  </div>

                  <form className="space-y-4" onSubmit={submitLogin}>
                    <div className="space-y-2">
                      <Label htmlFor="storefront-profile">Perfil o correo</Label>
                      <Input
                        id="storefront-profile"
                        autoCapitalize="none"
                        autoComplete="username"
                        className={fieldClassName}
                        placeholder="ej. pablo o pablo@dominio.cl"
                        {...loginForm.register("profileName")}
                      />
                      {loginForm.formState.errors.profileName ? (
                        <p className="text-xs text-rose-400">
                          {loginForm.formState.errors.profileName.message}
                        </p>
                      ) : (
                        <p className="text-xs text-zinc-500">
                          También puedes entrar con el correo asociado a tu cuenta.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="storefront-password">Contraseña</Label>
                      <Input
                        id="storefront-password"
                        type="password"
                        autoComplete="current-password"
                        className={fieldClassName}
                        placeholder="••••••••"
                        {...loginForm.register("password")}
                      />
                      {loginForm.formState.errors.password ? (
                        <p className="text-xs text-rose-400">
                          {loginForm.formState.errors.password.message}
                        </p>
                      ) : null}
                    </div>

                    <Button
                      type="submit"
                      className="h-12 w-full rounded-2xl bg-[#f2efe8] text-base font-semibold text-[#17141b] hover:bg-[#fff7eb]"
                      disabled={signIn.isPending}
                    >
                      {signIn.isPending ? "Ingresando..." : "Entrar"}
                    </Button>
                  </form>
                </div>
              </TabsContent>

              <TabsContent value="signup" className="mt-0">
                <div className="rounded-[28px] border border-white/8 bg-[#2f2b35] p-4 sm:p-5">
                  <div className="mb-5 flex items-start gap-3">
                    <div className="mt-0.5 flex size-11 items-center justify-center rounded-2xl bg-[#ff3b26]/12 text-[#ff8f82]">
                      <UserRoundPlus className="size-5" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-white">Crear cuenta cliente</p>
                      <p className="text-sm leading-6 text-zinc-400">
                        Guarda tus datos de compra, revisa pedidos y acelera futuros checkouts.
                      </p>
                    </div>
                  </div>

                  <form className="space-y-4" onSubmit={submitSignup}>
                    <div className="space-y-2">
                      <Label htmlFor="storefront-full-name">Nombre completo</Label>
                      <Input
                        id="storefront-full-name"
                        autoComplete="name"
                        className={fieldClassName}
                        placeholder="Tu nombre"
                        {...signupForm.register("fullName")}
                      />
                      {signupForm.formState.errors.fullName ? (
                        <p className="text-xs text-rose-400">
                          {signupForm.formState.errors.fullName.message}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="storefront-email">Correo</Label>
                      <Input
                        id="storefront-email"
                        type="email"
                        autoCapitalize="none"
                        autoComplete="email"
                        className={fieldClassName}
                        placeholder="tu@correo.cl"
                        {...signupForm.register("email")}
                      />
                      {signupForm.formState.errors.email ? (
                        <p className="text-xs text-rose-400">
                          {signupForm.formState.errors.email.message}
                        </p>
                      ) : null}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="storefront-signup-password">Contraseña</Label>
                        <Input
                          id="storefront-signup-password"
                          type="password"
                          autoComplete="new-password"
                          className={fieldClassName}
                          placeholder="Mínimo 6 caracteres"
                          {...signupForm.register("password")}
                        />
                        {signupForm.formState.errors.password ? (
                          <p className="text-xs text-rose-400">
                            {signupForm.formState.errors.password.message}
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="storefront-confirm-password">Confirmar</Label>
                        <Input
                          id="storefront-confirm-password"
                          type="password"
                          autoComplete="new-password"
                          className={fieldClassName}
                          placeholder="Repite tu contraseña"
                          {...signupForm.register("confirmPassword")}
                        />
                        {signupForm.formState.errors.confirmPassword ? (
                          <p className="text-xs text-rose-400">
                            {signupForm.formState.errors.confirmPassword.message}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#ff3b26]/12 bg-[#ff3b26]/7 px-4 py-3">
                      <p className="text-xs leading-6 text-zinc-300">
                        Esta cuenta se crea como cliente. Los permisos de caja y administración se
                        asignan solo de forma interna por la tienda.
                      </p>
                    </div>

                    <Button
                      type="submit"
                      className="h-12 w-full rounded-2xl bg-[#ff3b26] text-base font-semibold text-white hover:bg-[#ff513f]"
                      disabled={signUpCustomer.isPending}
                    >
                      {signUpCustomer.isPending ? "Creando cuenta..." : "Crear cuenta"}
                    </Button>
                  </form>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
