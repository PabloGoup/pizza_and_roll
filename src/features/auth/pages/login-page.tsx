import { CreditCard, ShieldCheck, Store } from "lucide-react";
import { Navigate } from "react-router-dom";

import { AppLogo } from "@/components/common/app-logo";
import { LoginForm } from "@/features/auth/components/login-form";
import { useAuthStore } from "@/stores/auth-store";

export function LoginPage() {
  const currentUser = useAuthStore((state) => state.currentUser);

  if (currentUser) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.24),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(217,119,6,0.14),_transparent_30%),#120b09] px-4 py-8 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl gap-8 lg:grid-cols-[1.1fr_500px]">
        <section className="flex flex-col justify-between rounded-[32px] border border-white/10 bg-white/5 p-8 backdrop-blur md:p-10">
          <div className="space-y-10">
            <AppLogo />
            <div className="max-w-xl space-y-5">
              <span className="inline-flex rounded-full border border-orange-300/20 bg-orange-200/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-orange-100">
                Fase 1 operativa
              </span>
              <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
                POS + caja + administración listos para operación real.
              </h1>
              <p className="text-base leading-7 text-orange-50/80">
                Base escalable para pizzería o sushi: venta rápida, control por roles,
                caja diaria, auditoría y catálogo con Supabase listo para conectar.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Ventas rápidas",
                description: "Búsqueda, carrito y cobro adaptado a caja.",
                icon: CreditCard,
              },
              {
                title: "Permisos claros",
                description: "Administrador y cajero con accesos separados.",
                icon: ShieldCheck,
              },
              {
                title: "Diseño operativo",
                description: "Flujo limpio para local, retiro y despacho.",
                icon: Store,
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-3xl border border-white/10 bg-black/15 p-5"
              >
                <item.icon className="mb-4 size-5 text-orange-200" />
                <p className="font-medium">{item.title}</p>
                <p className="mt-2 text-sm text-orange-50/70">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-center justify-center">
          <div className="w-full max-w-md">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
