import { useEffect, useState } from "react";
import {
  ArrowRight,
  Clock3,
  Flame,
  Heart,
  MapPin,
  Phone,
  Search,
  ShoppingBasket,
  Sparkles,
  Store,
  Tag,
  Truck,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductCategories, useProducts } from "@/features/products/hooks/use-products";
import {
  useDeliveryZones,
  useStorefrontPromotions,
  useStoreSettings,
} from "@/features/storefront/hooks/use-storefront";
import { cn } from "@/lib/utils";
import type { Product, Promotion } from "@/types/domain";
import brandLogo from "@/assets/logo.png";
import fondoSushi from "../../../../fondos/Fondo sushi.png";
import fondoDark from "../../../../fondos/Fondo2.png";
import fondoPremium from "../../../../fondos/premiun.png";
import fondoCeviches from "../../../../fondos/ceviches.png";
import fondoPromo from "../../../../fondos/promo.png";
import fondoBowls from "../../../../fondos/fondo3.png";

type StorefrontOrderMode = "retiro_local" | "despacho";

const BRAND_COLORS = {
  red: "#ff2b17",
  gold: "#ffb94a",
  cyan: "#1cc8ff",
  green: "#2ee86b",
  pink: "#ff2d88",
};

function formatCurrency(value: number) {
  return `$${Math.round(value).toLocaleString("es-CL")}`;
}

function formatMinutesRange(baseMinutes: number, offsetMinutes = 0) {
  const minimum = Math.max(0, baseMinutes + offsetMinutes);
  const maximum = minimum + 10;
  return `${minimum}-${maximum} min`;
}

function getDisplayPrice(product: Product) {
  const defaultVariant = product.variants.find((variant) => variant.isDefault);
  return defaultVariant?.price ?? product.variants[0]?.price ?? product.basePrice;
}

function getCategoryBackdrop(categoryName: string) {
  const normalized = categoryName.toLowerCase();

  if (
    normalized.includes("premium") ||
    normalized.includes("futomaki") ||
    normalized.includes("california") ||
    normalized.includes("avocado") ||
    normalized.includes("rolls calientes")
  ) {
    return fondoPremium;
  }

  if (normalized.includes("ceviche")) {
    return fondoCeviches;
  }

  if (normalized.includes("promo")) {
    return fondoPromo;
  }

  if (normalized.includes("poke")) {
    return fondoBowls;
  }

  return fondoDark;
}

function getCategoryAccent(categoryName: string) {
  const normalized = categoryName.toLowerCase();

  if (normalized.includes("premium")) return BRAND_COLORS.gold;
  if (normalized.includes("ceviche")) return BRAND_COLORS.cyan;
  if (normalized.includes("poke")) return BRAND_COLORS.pink;
  if (normalized.includes("promo")) return BRAND_COLORS.red;
  if (normalized.includes("avocado")) return BRAND_COLORS.green;
  return BRAND_COLORS.gold;
}

function getPromotionAccent(type: Promotion["type"]) {
  switch (type) {
    case "combo":
      return "bg-orange-100 text-orange-700";
    case "porcentaje":
      return "bg-emerald-100 text-emerald-700";
    case "monto_fijo":
      return "bg-sky-100 text-sky-700";
    case "horario":
      return "bg-amber-100 text-amber-700";
    case "cantidad":
      return "bg-violet-100 text-violet-700";
    case "combinada":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-muted text-foreground";
  }
}

function getPromotionLabel(promotion: Promotion) {
  switch (promotion.type) {
    case "porcentaje":
      return `${promotion.value}% de descuento`;
    case "monto_fijo":
      return `${formatCurrency(promotion.value)} de descuento`;
    case "combo":
      return "Combo activo";
    case "horario":
      return "Precio por horario";
    case "cantidad":
      return "Promo por cantidad";
    case "combinada":
      return "Promo combinada";
    default:
      return "Promoción";
  }
}

function slugifyCategoryName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function ProductCard({
  product,
  categoryName,
  orderMode,
}: {
  product: Product;
  categoryName: string;
  orderMode: StorefrontOrderMode;
}) {
  const price = getDisplayPrice(product);
  const accent = getCategoryAccent(categoryName);

  return (
    <Card className="group h-full overflow-hidden rounded-[28px] border-white/8 bg-[#302c34] text-white shadow-sm shadow-black/10 transition-transform hover:-translate-y-0.5">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-30"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.88)), url("${getCategoryBackdrop(categoryName)}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="flex items-start gap-4">
          <div
            className="relative z-10 flex size-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[#18161b] text-lg font-semibold text-white shadow-sm"
            style={{ boxShadow: `0 0 0 1px ${accent}22 inset` }}
          >
            {product.name.slice(0, 1).toUpperCase()}
          </div>

          <div className="relative z-10 min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className="rounded-full border-0 px-2.5 py-1 text-[11px] text-black"
                style={{ backgroundColor: accent }}
              >
                {categoryName}
              </Badge>
              {product.isFavorite ? (
                <Badge
                  variant="outline"
                  className="rounded-full border-orange-300/40 bg-orange-400/10 px-2.5 py-1 text-[11px] text-orange-200"
                >
                  <Heart className="size-3 fill-current" />
                  Favorito
                </Badge>
              ) : null}
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-semibold leading-tight text-balance">{product.name}</h3>
              <p className="line-clamp-3 text-sm leading-6 text-zinc-300">
                {product.description}
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap gap-2 text-xs text-zinc-300">
          {product.variants.length ? (
            <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1">
              {product.variants.length} variante{product.variants.length === 1 ? "" : "s"}
            </span>
          ) : null}
          {product.modifiers.length ? (
            <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1">
              {product.modifiers.length} cambio{product.modifiers.length === 1 ? "" : "s"}
            </span>
          ) : null}
          {product.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-full border border-white/8 bg-white/5 px-3 py-1">
              #{tag}
            </span>
          ))}
        </div>

        <div className="relative z-10 mt-auto space-y-4 border-t border-white/10 pt-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Desde</p>
              <p className="text-2xl font-semibold">{formatCurrency(price)}</p>
            </div>

            <div className="text-right text-xs text-zinc-400">
              <p>{orderMode === "despacho" ? "Disponible para despacho" : "Disponible para retiro"}</p>
              <p>Sin imagen, con detalle completo</p>
            </div>
          </div>

          <button
            type="button"
            className="inline-flex w-full items-center justify-between rounded-full border border-white/10 bg-white/6 px-4 py-3 text-sm font-medium transition-colors hover:bg-white/12"
          >
            Ver opciones
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function PromotionCard({ promotion }: { promotion: Promotion }) {
  return (
    <Card className="rounded-[28px] border-white/8 bg-[#302c34] text-white shadow-sm shadow-black/10">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Badge
              className={cn(
                "rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold",
                getPromotionAccent(promotion.type),
              )}
            >
              <Sparkles className="size-3" />
              {getPromotionLabel(promotion)}
            </Badge>
            <div>
              <h3 className="text-lg font-semibold">{promotion.name}</h3>
              <p className="text-sm leading-6 text-zinc-300">
                {promotion.description ?? "Promoción publicada en el mismo núcleo del POS."}
              </p>
            </div>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <Tag className="size-4 text-zinc-200" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StorefrontSkeleton() {
  return (
    <div className="mx-auto max-w-[1540px] space-y-6 px-4 pt-5 pb-8 md:px-6 md:pt-6 md:pb-10">
      <Skeleton className="h-52 rounded-[32px]" />
      <div className="grid gap-6 xl:grid-cols-[290px_minmax(0,1fr)]">
        <Skeleton className="h-[720px] rounded-[30px]" />
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-[28px]" />
          <Skeleton className="h-20 rounded-[28px]" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <Skeleton key={index} className="h-72 rounded-[28px]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StorefrontPage() {
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [orderMode, setOrderMode] = useState<StorefrontOrderMode>("retiro_local");
  const [searchParams] = useSearchParams();

  const productsQuery = useProducts();
  const categoriesQuery = useProductCategories();
  const settingsQuery = useStoreSettings();
  const deliveryZonesQuery = useDeliveryZones();
  const promotionsQuery = useStorefrontPromotions();

  const products = productsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const settings = settingsQuery.data;
  const deliveryZones = deliveryZonesQuery.data ?? [];
  const promotions = promotionsQuery.data ?? [];
  const promotionsRollsCategory = categories.find(
    (category) => slugifyCategoryName(category.name) === "promociones-rolls",
  );

  const normalizedSearch = search.trim().toLowerCase();
  const isPromotionsHeaderActive =
    !favoritesOnly &&
    !!promotionsRollsCategory &&
    selectedCategoryId === promotionsRollsCategory.id;
  const isCartaHeaderActive = !isPromotionsHeaderActive;

  useEffect(() => {
    const requestedCategory = searchParams.get("category");

    if (!requestedCategory) {
      return;
    }

    if (requestedCategory === "all") {
      setSelectedCategoryId("all");
      setFavoritesOnly(false);
      return;
    }

    const matchedCategory = categories.find(
      (category) => slugifyCategoryName(category.name) === requestedCategory,
    );

    if (!matchedCategory) {
      return;
    }

    setSelectedCategoryId(matchedCategory.id);
    setFavoritesOnly(false);
  }, [categories, searchParams]);

  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      selectedCategoryId === "all" || product.categoryId === selectedCategoryId;
    const matchesFavorite = !favoritesOnly || product.isFavorite;
    const matchesSearch =
      normalizedSearch.length === 0 ||
      `${product.name} ${product.description} ${(product.tags ?? []).join(" ")}`.toLowerCase().includes(
        normalizedSearch,
      );

    return matchesCategory && matchesFavorite && matchesSearch;
  });

  const groupedProducts = categories
    .map((category) => ({
      category,
      products: filteredProducts.filter((product) => product.categoryId === category.id),
    }))
    .filter((group) => group.products.length > 0);

  const featuredPromotions = promotions.slice(0, 3);
  const supportPhone = settings?.supportPhone?.trim() || "+56940999386";
  const whatsappPhone = supportPhone.replace(/\D/g, "");
  const whatsappHref = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent("Hola, quiero consultar si llegan a mi zona de reparto.")}`;
  const pickupAddress = "Recoleta 5758";
  const pickupMapHref = "https://www.google.com/maps/search/?api=1&query=Recoleta+5758";
  const pickupMapEmbed = "https://www.google.com/maps?q=Recoleta+5758&output=embed";
  const activeCategoryName =
    selectedCategoryId === "all"
      ? "Toda la carta"
      : categories.find((category) => category.id === selectedCategoryId)?.name ?? "Categoría";
  const activeEta =
    orderMode === "despacho"
      ? formatMinutesRange(settings?.deliveryBaseMinutes ?? 35)
      : formatMinutesRange(settings?.pickupBaseMinutes ?? 20);

  const hasCatalogError =
    productsQuery.isError ||
    categoriesQuery.isError ||
    settingsQuery.isError ||
    deliveryZonesQuery.isError ||
    promotionsQuery.isError;

  if (
    productsQuery.isLoading ||
    categoriesQuery.isLoading ||
    settingsQuery.isLoading ||
    deliveryZonesQuery.isLoading ||
    promotionsQuery.isLoading
  ) {
    return <StorefrontSkeleton />;
  }

  if (hasCatalogError || !settings) {
    return (
      <div className="mx-auto max-w-[1540px] px-4 py-10 md:px-6">
        <EmptyState
          icon={Store}
          title="No se pudo cargar la tienda pública"
          description="La conexión con Supabase respondió con error. Revisa políticas públicas, variables del proyecto y datos base del catálogo."
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#242129] text-white">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/8 bg-[#26232b] shadow-[0_16px_50px_rgba(0,0,0,0.35)]">
        <div className="mx-auto flex max-w-[1540px] flex-col gap-4 px-4 py-4 md:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-[190px] items-center overflow-hidden">
              <img src={brandLogo} alt="Poke and Roll" className="h-16 w-auto object-contain" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/?category=all"
              className={cn(
                "inline-flex items-center rounded-full px-8 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5",
                isCartaHeaderActive
                  ? "bg-[#ff2b17] text-white"
                  : "text-zinc-200 hover:bg-white/5 hover:text-white",
              )}
            >
              Carta
            </Link>
            <Link
              to="/?category=promociones-rolls"
              className={cn(
                "inline-flex items-center rounded-full px-4 py-3 text-sm font-medium transition-colors",
                isPromotionsHeaderActive
                  ? "bg-[#ff2b17] text-white"
                  : "text-zinc-200 hover:bg-white/5 hover:text-white",
              )}
            >
              Promociones
            </Link>
            <span className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-zinc-200">
              <MapPin className="size-4" />
              Santiago
            </span>
            {settings.supportPhone ? (
              <a
                href={`tel:${settings.supportPhone}`}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                <Phone className="size-4" />
                {settings.supportPhone}
              </a>
            ) : null}
            <Link
              to="/app/ventas"
              className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              POS
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1540px] space-y-6 px-4 pt-32 pb-8 md:px-6 md:pt-34 md:pb-10">
      <section
        className="overflow-hidden rounded-[34px] border border-white/8 bg-[#2f2b32] text-white shadow-xl shadow-black/20"
        style={{
          backgroundImage: `linear-gradient(135deg, rgba(35,31,39,0.92), rgba(31,28,36,0.85)), url("${fondoSushi}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="border-b border-white/10 px-6 py-6 md:px-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="rounded-full border-0 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-950">
                  Carta online conectada al POS
                </Badge>
                <Badge
                  className={cn(
                    "rounded-full border-0 px-3 py-1 text-[11px] font-semibold",
                    settings.isStoreOpen
                      ? "bg-emerald-400/15 text-emerald-200"
                      : "bg-rose-400/15 text-rose-200",
                  )}
                >
                  {settings.isStoreOpen ? "Abierto ahora" : "Cerrado"}
                </Badge>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="flex size-16 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#18161b]/80 shadow-lg shadow-black/30">
                    <img src={brandLogo} alt="Poke and Roll" className="size-full object-cover" />
                  </div>
                  <div className="text-sm uppercase tracking-[0.28em] text-zinc-300">
                    Sushi & Poke
                  </div>
                </div>
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">
                 Poke & Roll Disfruta de nuestra deliciosa carta.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-zinc-300 md:text-lg">
                  Pide con una carta clara, selecciona tus producto, modifícalos y come a tu gusto.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[440px]">
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-200">
                  <Clock3 className="size-4" />
                  ETA actual
                </div>
                <p className="text-2xl font-semibold">{activeEta}</p>
                <p className="text-sm text-zinc-400">
                  {orderMode === "despacho" ? "Despacho estimado" : "Retiro estimado"}
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-200">
                  <Flame className="size-4" />
                  Promos
                </div>
                <p className="text-2xl font-semibold">{promotions.length}</p>
                <p className="text-sm text-zinc-400">Promociones públicas activas</p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-200">
                  <MapPin className="size-4" />
                  Zonas
                </div>
                <p className="text-2xl font-semibold">{deliveryZones.length}</p>
                <p className="text-sm text-zinc-400">Comunas con despacho configurado</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-6 py-5 md:px-8 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setOrderMode("retiro_local")}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors",
                orderMode === "retiro_local"
                  ? "border-white bg-white text-zinc-950"
                  : "border-white/15 bg-white/5 text-white hover:bg-white/10",
              )}
            >
              <Store className="size-4" />
              Retiro en tienda
            </button>
            <button
              type="button"
              onClick={() => setOrderMode("despacho")}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors",
                orderMode === "despacho"
                  ? "border-white bg-white text-zinc-950"
                  : "border-white/15 bg-white/5 text-white hover:bg-white/10",
              )}
            >
              <Truck className="size-4" />
              Despacho
            </button>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-300">
              <Sparkles className="size-4" />
              {activeCategoryName}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 xl:justify-end">
            {settings.supportPhone ? (
              <a
                href={`tel:${settings.supportPhone}`}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white",
                )}
              >
                <Phone className="size-4" />
                {settings.supportPhone}
              </a>
            ) : null}
            <Link
              to="/app/ventas"
              className={cn(buttonVariants({ variant: "secondary" }), "rounded-full")}
            >
              Ver operación interna
            </Link>
          </div>
        </div>
      </section>

      <section className="grid items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-5 self-start">
          <Card
            className="rounded-[30px] border-white/8 bg-[#2f2b32] text-white shadow-lg shadow-black/10"
            style={{
              backgroundImage: `linear-gradient(180deg, rgba(45,40,50,0.96), rgba(34,31,39,0.98)), url("${fondoDark}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <CardContent className="space-y-5 p-5">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Carta</p>
                <h2 className="mt-2 text-2xl font-semibold">Explora la tienda</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  Navega por categorías, favoritos y búsqueda rápida sin depender de imágenes.
                </p>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Busca un roll, poke o promo"
                  className="h-12 rounded-full border-white/10 bg-white text-zinc-950 pl-11 placeholder:text-zinc-500"
                />
              </div>

              <button
                type="button"
                onClick={() => setFavoritesOnly((current) => !current)}
                className={cn(
                  "flex w-full items-center justify-between rounded-[22px] border px-4 py-3 text-left transition-colors",
                  favoritesOnly
                    ? "border-orange-300 bg-orange-50 text-orange-700"
                    : "border-white/10 bg-white/5 text-white hover:bg-white/10",
                )}
              >
                <span className="inline-flex items-center gap-2 font-medium">
                  <Heart className={cn("size-4", favoritesOnly && "fill-current")} />
                  Mis favoritos
                </span>
                <span className="text-sm">
                  {products.filter((product) => product.isFavorite).length}
                </span>
              </button>
                
                
              <div className="space-y-2">
             

                {categories.map((category) => {
                  const count = products.filter((product) => product.categoryId === category.id).length;

                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(category.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-[22px] border px-4 py-3 text-left text-sm transition-colors",
                        selectedCategoryId === category.id
                          ? "border-transparent bg-white text-zinc-950"
                          : "border-white/10 bg-[#25222a] text-white hover:bg-[#2a2630]",
                      )}
                    >
                      <span className="inline-flex items-center gap-3">
                        <span
                          className="inline-flex size-2.5 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        {category.name}
                      </span>
                      <span>{count}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <button
                  type="button"
                  onClick={() => setSelectedCategoryId("all")}
                  className={cn(
                    "flex w-full items-center justify-between rounded-[22px] border px-4 py-3 text-left text-sm transition-colors",
                    selectedCategoryId === "all"
                      ? "border-white bg-white text-zinc-950"
                      : "border-white/10 bg-white/5 text-white hover:bg-white/10",
                  )}
                >
                  <span>Toda la carta</span>
                  <span>{products.length}</span>
                </button>
        </aside>

        <div className="space-y-6">
          {featuredPromotions.length ? (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <Flame className="size-5 text-orange-400" />
                <div>
                  <h2 className="text-xl font-semibold text-white">Promociones destacadas</h2>
                  <p className="text-sm text-zinc-300">
                    Promociones activas publicadas desde el mismo catálogo operativo.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {featuredPromotions.map((promotion) => (
                  <PromotionCard key={promotion.id} promotion={promotion} />
                ))}
              </div>
            </section>
          ) : null}

          <Card className="overflow-hidden rounded-[30px] border-white/8 bg-[#2f2b32] text-white shadow-xl shadow-black/10">
            <CardContent className="space-y-5 p-5 md:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">Carta pública</h2>
                  <p className="text-sm text-zinc-300">
                    Categorías a la vista, fichas claras y lectura rápida del producto.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(category.id)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm transition-colors",
                        selectedCategoryId === category.id
                          ? "border-transparent bg-[#ff2b17] text-white"
                          : "border-white/10 bg-[#25222a] text-white hover:bg-[#2a2630]",
                      )}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </div>

              {groupedProducts.length ? (
                <div className="space-y-8">
                  {groupedProducts.map(({ category, products: categoryProducts }) => (
                    <section key={category.id} className="space-y-4">
                      <div
                        className="flex items-end justify-between gap-4 overflow-hidden rounded-[26px] border border-white/8 bg-[#29252d] p-5"
                        style={{
                          backgroundImage: `linear-gradient(90deg, rgba(43,39,48,0.95), rgba(37,33,42,0.88)), url("${getCategoryBackdrop(category.name)}")`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      >
                        <div>
                          <div className="mb-2 flex items-center gap-3">
                            <span
                              className="inline-flex size-3 rounded-full"
                              style={{ backgroundColor: category.color }}
                            />
                            <h3 className="text-xl font-semibold">{category.name}</h3>
                          </div>
                          <p className="text-sm text-zinc-300">
                            {categoryProducts.length} producto
                            {categoryProducts.length === 1 ? "" : "s"} disponible
                            {favoritesOnly ? "s en favoritos" : "s"}.
                          </p>
                        </div>

                        <div className="hidden rounded-full bg-white/10 px-4 py-2 text-sm text-zinc-200 md:block">
                          {orderMode === "despacho" ? "Modo despacho" : "Modo retiro"}
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {categoryProducts.map((product) => (
                          <ProductCard
                            key={product.id}
                            product={product}
                            categoryName={category.name}
                            orderMode={orderMode}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={ShoppingBasket}
                  title="No hay productos para este filtro"
                  description="Prueba otra categoría, limpia la búsqueda o desactiva favoritos para volver a ver el catálogo activo."
                />
              )}
            </CardContent>
          </Card>

          <section>
            <Card
              className="rounded-[30px] border-zinc-800 bg-zinc-950/95 text-white"
              style={{
                backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.82), rgba(0,0,0,0.9)), url("${fondoCeviches}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl  p-3">
                    <MapPin className="size-5 " />
                  </div>
                  <div>
                    <p className="font-medium">Zona de retiro</p>
                    <p className="text-sm text-zinc-300">
                      Retiro en local disponible en {pickupAddress}.
                    </p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-[24px] border border-white/10 bg-white/5">
                  <iframe
                    title="Mapa de retiro Recoleta 5758"
                    src={pickupMapEmbed}
                    className="h-[280px] w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">Dirección de retiro</p>
                  <p className="mt-1 text-sm text-zinc-300">{pickupAddress}</p>
                  <p className="mt-3 text-sm font-semibold text-white">Zona de reparto</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-300">
                    Para confirmar si llegamos a tu sector, consúltanos por WhatsApp antes de
                    finalizar el pedido online.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <a
                    href={pickupMapHref}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "h-12 rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10",
                    )}
                  >
                    Ver mapa
                  </a>
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "h-12 rounded-full border-emerald-400/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20",
                    )}
                  >
                    Consultar reparto por WhatsApp
                  </a>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </section>
      </div>
    </div>
  );
}
