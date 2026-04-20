import { ArrowRight, Clock3, ShieldCheck, ShoppingBasket, Store, Truck } from "lucide-react";
import { Link } from "react-router-dom";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const pillars = [
  {
    title: "Mismo catálogo del POS",
    description:
      "La tienda online usará los mismos productos, variantes, modificadores y promociones del backoffice.",
    icon: ShoppingBasket,
  },
  {
    title: "Tiempo estimado real",
    description:
      "Los tiempos de espera se calcularán según la carga actual, el tipo de pedido y la preparación en cocina.",
    icon: Clock3,
  },
  {
    title: "Pedido centralizado",
    description:
      "Cada compra entrará directo a pedidos, caja, auditoría y despacho sin duplicar procesos.",
    icon: ShieldCheck,
  },
] as const;

const roadmap = [
  "Catálogo público con categorías, favoritos y promos.",
  "Checkout con retiro local o despacho.",
  "Tiempo de espera visible antes de pagar.",
  "Seguimiento de pedido en línea.",
  "Ingreso automático del pedido al POS.",
] as const;

export function StorefrontPage() {
  return (
    <div className="mx-auto max-w-[1540px] px-4 py-8 md:px-6 md:py-10">
      <section className="grid gap-8 rounded-[32px] border border-border/70 bg-card/85 px-6 py-8 shadow-xl shadow-black/5 backdrop-blur md:px-10 md:py-12 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="space-y-6">
          <div className="inline-flex rounded-full border border-orange-300/70 bg-orange-100/70 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-orange-700">
            Etapa 2 en preparación
          </div>

          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">
              La tienda online vivirá dentro de este mismo sistema.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Vamos a montar una experiencia pública para vender productos sin separar catálogo,
              pedidos, caja ni auditoría. Todo entrará al mismo núcleo operativo que ya usa el POS.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/app/productos"
              className={cn(buttonVariants({ size: "lg" }), "rounded-full")}
            >
              Ajustar catálogo primero
              <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/app/ventas"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-full")}
            >
              Revisar flujo actual del POS
            </Link>
          </div>
        </div>

        <Card className="border-border/70 bg-background/75">
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-muted p-3">
                <Store className="size-5" />
              </div>
              <div>
                <p className="font-medium">Estructura inicial</p>
                <p className="text-sm text-muted-foreground">
                  Tienda pública y backoffice en el mismo proyecto.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-2xl bg-muted/30 px-4 py-3">
                <p className="font-medium text-foreground">Tienda pública</p>
                <p>Cliente navega catálogo, arma pedido y ve tiempo estimado.</p>
              </div>
              <div className="rounded-2xl bg-muted/30 px-4 py-3">
                <p className="font-medium text-foreground">POS interno</p>
                <p>Recibe el pedido, actualiza estado y mantiene caja/auditoría sincronizadas.</p>
              </div>
              <div className="rounded-2xl bg-muted/30 px-4 py-3">
                <p className="font-medium text-foreground">Despacho / retiro</p>
                <p>Se resuelve sobre las mismas tablas de pedidos y dirección.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {pillars.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <Card key={pillar.title} className="border-border/70">
              <CardContent className="space-y-4 p-6">
                <div className="inline-flex rounded-2xl bg-muted p-3">
                  <Icon className="size-5" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold">{pillar.title}</h2>
                  <p className="text-sm leading-6 text-muted-foreground">{pillar.description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
        <Card className="border-border/70">
          <CardContent className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-muted p-3">
                <Truck className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Qué sigue después de este paso</h2>
                <p className="text-sm text-muted-foreground">
                  Dejamos la estructura lista para empezar sin duplicar trabajo.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {roadmap.map((item, index) => (
                <div
                  key={item}
                  className="flex items-start gap-4 rounded-2xl bg-muted/20 px-4 py-3"
                >
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                    {index + 1}
                  </div>
                  <p className="text-sm text-muted-foreground">{item}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-[linear-gradient(180deg,_rgba(249,115,22,0.10),_transparent)]">
          <CardContent className="space-y-5 p-6">
            <div className="space-y-2">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-orange-700">
                Base ya resuelta
              </p>
              <h2 className="text-2xl font-semibold">Mismo backend, otro canal de venta</h2>
            </div>

            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Lo correcto era separar rutas primero. Desde ahora la tienda pública vive en la raíz
                y el backoffice queda bajo <span className="font-medium text-foreground">`/app`</span>.
              </p>
              <p>
                Eso nos permite construir la venta online encima del mismo Supabase, mismas tablas y
                misma auditoría, sin duplicar catálogo ni pedidos.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
