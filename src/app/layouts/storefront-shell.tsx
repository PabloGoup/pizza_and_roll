import {
  ArrowRight,
  Clock3,
  MapPin,
  MessageCircle,
  ShoppingBag,
  TimerReset,
} from "lucide-react";
import type { SVGProps } from "react";
import { Link, Outlet } from "react-router-dom";

import logo from "@/assets/logo.png";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.1" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.35" cy="6.65" r="1.15" fill="currentColor" />
    </svg>
  );
}

function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M13.5 20.25V12.9H16l.4-2.8h-2.9V8.3c0-.8.28-1.35 1.45-1.35h1.58V4.42c-.27-.03-1.2-.12-2.28-.12-2.25 0-3.8 1.37-3.8 3.9v1.9H8v2.8h2.36v7.35h3.14Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function StorefrontShell() {
  const instagramHref = "https://www.instagram.com/pizza_and_roll";
  const facebookHref = "https://www.facebook.com/pizza_and_roll";
  const whatsappHref =
    "https://wa.me/56940999386?text=Hola%2C%20quiero%20hacer%20un%20pedido%20en%20Poke%20%26%20Roll.";

  return (
    <div className="min-h-screen bg-[#38343c]">
      <main className="bg-[#38343c]">
        <Outlet />
      </main>

      <footer className="border-t border-white/10 bg-[#2b2830]">
        <div className="mx-auto max-w-[1540px] px-4 py-10 md:px-6">
          <div className="grid gap-8 rounded-[30px] border border-white/10 bg-[#242128] px-6 py-8 text-sm text-zinc-400 md:px-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_auto] xl:items-end">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex size-14 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#1a171d]">
                  <img src={logo} alt="Poke and Roll" className="size-full object-cover" />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-[0.2em] text-white uppercase">
                    Poke & Roll
                  </p>
                  <p className="text-xs text-zinc-500">Sushi & Poke conectado al POS</p>
                </div>
              </div>

              <p className="max-w-xl text-sm leading-7 text-zinc-400">
                Poke & Roll, Disfruta de nuestra deliciosa carta.
              </p>

              <div className="flex flex-wrap gap-3 text-sm">
                <a
                  href={instagramHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram de Poke & Roll"
                  title="Instagram"
                  className="inline-flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-200 transition-colors hover:bg-white/10"
                >
                  <InstagramIcon className="size-5" />
                  <span className="sr-only">Instagram</span>
                </a>
                <a
                  href={facebookHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook de Poke & Roll"
                  title="Facebook"
                  className="inline-flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-200 transition-colors hover:bg-white/10"
                >
                  <FacebookIcon className="size-5" />
                  <span className="sr-only">Facebook</span>
                </a>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="WhatsApp de Poke & Roll"
                  title="WhatsApp"
                  className="inline-flex size-11 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-100 transition-colors hover:bg-emerald-400/20"
                >
                  <MessageCircle className="size-4" />
                  <span className="sr-only">WhatsApp</span>
                </a>
              </div>
            </div>

            <div className="grid gap-3 text-sm text-zinc-300 md:grid-cols-2 xl:grid-cols-1">
              <div className="flex items-center gap-2">
                <ShoppingBag className="size-4 text-zinc-500" />
                <span>Mismo catálogo que caja</span>
              </div>
              <div className="flex items-center gap-2">
                <TimerReset className="size-4 text-zinc-500" />
                <span>Tiempos conectados a la operación</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-zinc-500" />
                <span>Retiro y despacho desde el mismo flujo</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock3 className="size-4 text-zinc-500" />
                <span>Seguimiento unificado del pedido</span>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 xl:items-end">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                Operación interna
              </p>
              <Link
                to="/app/ventas"
                className={cn(buttonVariants({ variant: "default" }), "rounded-full")}
              >
                Ir al POS
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-2 px-1 pt-4 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between">
            <p>Poke & Roll. Carta online y operación interna sincronizadas.</p>
            <p>Proyecto unificado sobre Supabase y POS propio.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
