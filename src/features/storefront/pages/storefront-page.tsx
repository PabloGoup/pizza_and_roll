import { useState, type ComponentType } from "react";
import {
  ArrowRight,
  Clock3,
  Flame,
  Heart,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Search,
  ShoppingBasket,
  Sparkles,
  Store,
  Tag,
  Truck,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductCategories, useProducts } from "@/features/products/hooks/use-products";
import { ProductPickerDialog } from "@/features/sales/components/product-picker-dialog";
import { StorefrontCheckoutSheet } from "@/features/storefront/components/storefront-checkout-sheet";
import {
  useCreateStorefrontOrder,
  useStorefrontCustomerProfile,
} from "@/features/storefront/hooks/use-storefront-order";
import {
  useDeliveryZones,
  useStoreSettings,
  useStorefrontPromotions,
} from "@/features/storefront/hooks/use-storefront";
import {
  buildStorefrontCartItem,
  getStorefrontCartSubtotal,
} from "@/features/storefront/lib/storefront-cart";
import { cn } from "@/lib/utils";
import type { Product, Promotion } from "@/types/domain";
import { useStorefrontCartStore } from "@/stores/storefront-cart-store";
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

const STORE_THEME = {
  shell: "#1f1d23",
  header: "#232128",
  panel: "#2a272f",
  panelAlt: "#312d36",
  card: "#2d2a32",
  cardSoft: "#38343d",
  border: "rgba(255,255,255,0.08)",
  textMuted: "#9d98a4",
  accent: "#ff2b17",
  successBg: "rgba(52, 211, 153, 0.18)",
  successText: "#91f1c1",
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

function getProductMeta(product: Product) {
  const details: string[] = [];

  if (product.variants.length) {
    details.push(
      `${product.variants.length} variante${product.variants.length === 1 ? "" : "s"}`,
    );
  }

  if (product.modifiers.length) {
    details.push(
      `${product.modifiers.length} cambio${product.modifiers.length === 1 ? "" : "s"}`,
    );
  }

  if (product.tags.length) {
    details.push(product.tags.slice(0, 2).map((tag) => `#${tag}`).join(" "));
  }

  return details.join(" · ");
}

function CategoryFilterChip({
  label,
  active,
  onClick,
  dotColor,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
        active ? "text-white shadow-sm" : "text-zinc-200 shadow-sm",
      )}
      style={{
        backgroundColor: active ? dotColor ?? STORE_THEME.accent : STORE_THEME.panelAlt,
      }}
    >
      <span className="inline-flex items-center gap-2">
        {dotColor ? (
          <span
            className="inline-flex h-2 w-2 rounded-full"
            style={{ backgroundColor: active ? "rgba(255,255,255,0.95)" : dotColor }}
          />
        ) : null}
        {label}
      </span>
    </button>
  );
}

function ProductCard({
  product,
  categoryName,
  onSelect,
}: {
  product: Product;
  categoryName: string;
  onSelect: (product: Product) => void;
}) {
  const price = getDisplayPrice(product);
  const meta = getProductMeta(product);

  return (
    <Card
      className="group cursor-pointer overflow-hidden rounded-[22px] border text-white transition-all duration-200 ease-out active:scale-[0.985] active:shadow-[0_10px_24px_rgba(0,0,0,0.28)] md:hover:-translate-y-1 md:hover:scale-[1.015] md:hover:shadow-[0_18px_38px_rgba(0,0,0,0.32)]"
      style={{ backgroundColor: STORE_THEME.card, borderColor: STORE_THEME.border }}
      onClick={() => onSelect(product)}
    >
      <CardContent className="relative p-0">
        <div
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ backgroundColor: STORE_THEME.accent }}
        />

   

        <div className="flex items-start gap-3 p-3 sm:p-3.5">
          <div
            className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border text-base font-semibold text-white shadow-sm transition-transform duration-200 group-active:scale-95 sm:group-hover:-rotate-2 md:group-hover:scale-105 sm:h-16 sm:w-16"
            style={{
              borderColor: STORE_THEME.border,
              backgroundImage: `linear-gradient(180deg, rgba(16,16,20,0.18), rgba(16,16,20,0.8)), url("${product.imageUrl || fondoSushi}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {product.name.slice(0, 1).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="secondary"
                className="rounded-full border-0 px-2.5 py-1 text-[10px] font-semibold text-black"
                style={{ backgroundColor: BRAND_COLORS.red }}
              >
                {categoryName}
              </Badge>
              <span className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-semibold text-white">
                {formatCurrency(price)}
              </span>
              {product.isFavorite ? (
                <Badge className="rounded-full border-0 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-600">
                  <Heart className="size-3 fill-current" />
                  Favorito
                </Badge>
              ) : null}
            </div>

            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm font-semibold leading-tight text-balance sm:text-[15px]">
                  {product.name}
                </h3>
                <p className="line-clamp-2 text-xs leading-4 text-zinc-300 sm:line-clamp-1">
                  {product.description || "Producto disponible para personalizar en el pedido."}
                </p>
              </div>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(product);
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-medium text-white transition-all duration-200 group-active:scale-95 sm:group-hover:translate-x-0.5 sm:group-hover:shadow-[0_8px_20px_rgba(255,43,23,0.28)] sm:px-3"
                style={{ backgroundColor: STORE_THEME.accent }}
                aria-label={`Agregar ${product.name} al carrito`}
              >
                <Plus className="size-3.5" />
                Agregar
                <ArrowRight className="size-3.5 transition-transform sm:group-hover:translate-x-0.5" />
              </button>
            </div>

            {meta ? <p className="text-[10px] leading-4 text-zinc-400">{meta}</p> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PromotionCard({ promotion }: { promotion: Promotion }) {
  return (
    <Card
      className="min-w-[280px] overflow-hidden rounded-[28px] border text-white shadow-[0_14px_40px_rgba(0,0,0,0.24)]"
      style={{ backgroundColor: STORE_THEME.card, borderColor: STORE_THEME.border }}
    >
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
              <p className="mt-1 text-sm leading-6 text-zinc-300">
                {promotion.description ?? "Promoción publicada desde el mismo POS."}
              </p>
            </div>
          </div>

          <div
            className="rounded-2xl p-3 text-zinc-200"
            style={{ backgroundColor: STORE_THEME.panelAlt }}
          >
            <Tag className="size-4" />
          </div>
        </div>

        <div
          className="rounded-[22px] px-4 py-3 text-sm text-zinc-200"
          style={{ backgroundColor: "rgba(255, 43, 23, 0.14)" }}
        >
          Ideal para destacar combos, descuentos y horarios sin romper el flujo de compra móvil.
        </div>
      </CardContent>
    </Card>
  );
}

function StoreMetricCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  helper: string;
}) {
  const Icon = icon;

  return (
    <div className="min-w-[220px] rounded-[24px] border border-white/10 bg-white/8 p-3.5 text-white backdrop-blur md:min-w-0 md:rounded-[26px] md:p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white/80">
        <Icon className="size-4" />
        {label}
      </div>
      <p className="text-xl font-semibold md:text-2xl">{value}</p>
      <p className="mt-1 text-xs leading-5 text-white/70 md:text-sm md:leading-6">{helper}</p>
    </div>
  );
}

function StorefrontSkeleton() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: STORE_THEME.shell }}>
      <div className="mx-auto max-w-[1540px] space-y-5 px-4 py-4 md:px-6">
        <Skeleton className="h-16 rounded-[24px]" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Skeleton className="h-[380px] rounded-[32px]" />
          <Skeleton className="h-[320px] rounded-[32px]" />
        </div>
        <Skeleton className="h-32 rounded-[30px]" />
        <div className="space-y-4">
          <Skeleton className="h-20 rounded-[28px]" />
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <Skeleton key={index} className="h-56 rounded-[28px]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StorefrontPage() {
  const [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [orderMode, setOrderMode] = useState<StorefrontOrderMode>("retiro_local");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const cart = useStorefrontCartStore((state) => state.cart);
  const addItem = useStorefrontCartStore((state) => state.addItem);
  const updateQuantity = useStorefrontCartStore((state) => state.updateQuantity);
  const removeItem = useStorefrontCartStore((state) => state.removeItem);
  const clearCart = useStorefrontCartStore((state) => state.clearCart);
  const customerDraft = useStorefrontCartStore((state) => state.customerDraft);
  const setCustomerDraft = useStorefrontCartStore((state) => state.setCustomerDraft);

  const productsQuery = useProducts();
  const categoriesQuery = useProductCategories();
  const settingsQuery = useStoreSettings();
  const deliveryZonesQuery = useDeliveryZones();
  const promotionsQuery = useStorefrontPromotions();
  const createStorefrontOrder = useCreateStorefrontOrder();

  const products = productsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const settings = settingsQuery.data;
  const deliveryZones = deliveryZonesQuery.data ?? [];
  const promotions = promotionsQuery.data ?? [];
  const customerProfileQuery = useStorefrontCustomerProfile(customerDraft.phone);
  const promotionsRollsCategory = categories.find(
    (category) => slugifyCategoryName(category.name) === "promociones-rolls",
  );
  const requestedCategory = searchParams.get("category") ?? "all";
  const selectedCategoryId =
    requestedCategory === "all"
      ? "all"
      : categories.find((category) => slugifyCategoryName(category.name) === requestedCategory)?.id ??
        "all";

  const normalizedSearch = search.trim().toLowerCase();
  const isPromotionsHeaderActive =
    !favoritesOnly &&
    !!promotionsRollsCategory &&
    selectedCategoryId === promotionsRollsCategory.id;
  const isCartaHeaderActive = !isPromotionsHeaderActive;

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

  const categoryCounts = categories.reduce<Record<string, number>>((accumulator, category) => {
    accumulator[category.id] = products.filter((product) => product.categoryId === category.id).length;
    return accumulator;
  }, {});

  const favoriteProductsCount = products.filter((product) => product.isFavorite).length;
  const featuredPromotions = promotions.slice(0, 4);
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
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
  const visibleProductsCount = filteredProducts.length;
  const cartSubtotal = getStorefrontCartSubtotal(cart);
  const cartItemsCount = cart.reduce((total, item) => total + item.quantity, 0);

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

  async function submitStorefrontOrder(values: {
    customerName: string;
    customerPhone: string;
    addressLabel?: string;
    addressStreet?: string;
    addressDistrict?: string;
    addressReference?: string;
    notes?: string;
    paymentMethod: "efectivo" | "tarjeta" | "transferencia" | "mixto";
    deliveryFee: number;
  }) {
    const normalizedPhone = values.customerPhone.replace(/\D/g, "");

    if (!cart.length) {
      throw new Error("Agrega al menos un producto antes de cerrar el pedido.");
    }

    if (!values.customerName.trim() || normalizedPhone.length < 8) {
      throw new Error("Ingresa nombre y teléfono válidos para registrar el cliente.");
    }

    if (
      orderMode === "despacho" &&
      (!values.addressStreet?.trim() || !values.addressDistrict?.trim())
    ) {
      throw new Error("Para despacho debes completar dirección y comuna.");
    }

    if (
      orderMode === "despacho" &&
      !deliveryZones.some(
        (zone) =>
          zone.district.toLowerCase() === values.addressDistrict?.trim().toLowerCase(),
      )
    ) {
      throw new Error("La comuna seleccionada no tiene cobertura configurada para despacho.");
    }

    const orderTotal = cartSubtotal + values.deliveryFee;
    const paymentBreakdown =
      values.paymentMethod === "efectivo"
        ? { cash: orderTotal, card: 0, transfer: 0 }
        : values.paymentMethod === "tarjeta"
          ? { cash: 0, card: orderTotal, transfer: 0 }
          : { cash: 0, card: 0, transfer: orderTotal };

    const createdOrder = await createStorefrontOrder.mutateAsync({
      cart,
      payload: {
        type: orderMode,
        paymentMethod: values.paymentMethod,
        paymentBreakdown,
        discountAmount: 0,
        promotionAmount: 0,
        deliveryFee: values.deliveryFee,
        extraCharges: [],
        notes: values.notes,
        customerName: values.customerName.trim(),
        customerPhone: normalizedPhone,
        addressLabel: values.addressLabel?.trim(),
        addressStreet: values.addressStreet?.trim(),
        addressDistrict: values.addressDistrict?.trim(),
        addressReference: values.addressReference?.trim(),
      },
    });

    setCustomerDraft({
      fullName: values.customerName.trim(),
      phone: normalizedPhone,
      addressLabel: values.addressLabel?.trim() ?? customerDraft.addressLabel,
      addressStreet: values.addressStreet?.trim() ?? customerDraft.addressStreet,
      addressDistrict: values.addressDistrict?.trim() ?? customerDraft.addressDistrict,
      addressReference: values.addressReference?.trim() ?? customerDraft.addressReference,
      notes: values.notes?.trim() ?? "",
    });
    clearCart();
    setIsCartOpen(false);
    toast.success(`Pedido ${createdOrder.number} registrado correctamente.`);
  }

  function openProductConfigurator(product: Product) {
    setSelectedProduct(product);
  }

  function openRecommendedProduct(productId: string) {
    const product = products.find((entry) => entry.id === productId);

    if (!product) {
      toast.error("La recomendación ya no está disponible en la carta.");
      return;
    }

    setSelectedProduct(product);
    setIsCartOpen(false);
  }

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: STORE_THEME.shell }}>
      <header
        className="z-50 border-b backdrop-blur-xl md:sticky md:top-0"
        style={{ backgroundColor: "rgba(35, 33, 40, 0.92)", borderColor: STORE_THEME.border }}
      >
        <div className="mx-auto max-w-[1540px] px-4 py-3 md:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[18px] p-0 shadow-sm"
              >
                <img src={brandLogo} alt="Poke and Roll" className="h-full w-full object-contain" />
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-[0.16em] text-white uppercase">
                  {"Poke & Roll"}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs mt-1" style={{ color: STORE_THEME.textMuted }}>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    Santiago
                  </span>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 font-medium",
                      !settings.isStoreOpen && "bg-rose-400/15 text-rose-200",
                    )}
                    style={
                      settings.isStoreOpen
                        ? { backgroundColor: STORE_THEME.successBg, color: STORE_THEME.successText }
                        : undefined
                    }
                  >
                    {settings.isStoreOpen ? "Abierto ahora" : "Cerrado"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCartOpen(true)}
                className="relative inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-white transition-colors hover:bg-white/10"
                style={{ backgroundColor: STORE_THEME.panelAlt }}
              >
                <ShoppingBasket className="size-4" />
                <span className="ml-2 hidden sm:inline">Carrito</span>
                {cartItemsCount ? (
                  <span
                    className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: STORE_THEME.accent }}
                  >
                    {cartItemsCount}
                  </span>
                ) : null}
              </button>

              <div className="hidden items-center gap-2 md:flex">
              <Link
                to="/?category=all"
                className={cn(
                  "inline-flex items-center rounded-full px-4 py-2.5 text-sm font-semibold transition-colors",
                  isCartaHeaderActive
                    ? "text-white"
                    : "text-zinc-200 hover:text-white",
                )}
                style={{ backgroundColor: isCartaHeaderActive ? STORE_THEME.accent : STORE_THEME.panel }}
              >
                Carta
              </Link>
              <Link
                to="/?category=promociones-rolls"
                className={cn(
                  "inline-flex items-center rounded-full px-4 py-2.5 text-sm font-semibold transition-colors",
                  isPromotionsHeaderActive
                    ? "text-white"
                    : "text-zinc-200 hover:text-white",
                )}
                style={{
                  backgroundColor: isPromotionsHeaderActive ? STORE_THEME.accent : STORE_THEME.panel,
                }}
              >
                Promociones
              </Link>
              {settings.supportPhone ? (
                <a
                  href={`tel:${settings.supportPhone}`}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:text-white"
                  style={{ backgroundColor: STORE_THEME.panel }}
                >
                  <Phone className="size-4" />
                  {settings.supportPhone}
                </a>
              ) : null}
              <Link
                to="/app/ventas"
                className="inline-flex items-center rounded-full px-4 py-2.5 text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: STORE_THEME.panelAlt }}
              >
                POS
              </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1540px] space-y-5 px-4 py-4 pb-28 md:px-6 md:pb-10">
        <section className="space-y-4">
          <Card
            className="overflow-hidden rounded-[34px] border-0 text-white shadow-[0_24px_80px_rgba(17,24,39,0.18)]"
            style={{
              backgroundImage: `linear-gradient(135deg, rgba(28,26,33,0.9), rgba(24,22,29,0.94)), url("${fondoSushi}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <CardContent className="space-y-4 p-4 md:space-y-4 md:p-4">
              <div className="md:hidden">
                <div className="space-y-3">
                  <div
                    className="inline-flex w-full rounded-full p-1"
                    style={{ backgroundColor: "rgba(49, 45, 54, 0.9)" }}
                  >
                    <button
                      type="button"
                      onClick={() => setOrderMode("retiro_local")}
                      className={cn(
                        "inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium transition-colors",
                        orderMode === "retiro_local"
                          ? "text-white"
                          : "text-zinc-200 hover:bg-white/5",
                      )}
                      style={{
                        backgroundColor:
                          orderMode === "retiro_local" ? STORE_THEME.accent : "transparent",
                      }}
                    >
                      <Store className="size-4" />
                      Retiro
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderMode("despacho")}
                      className={cn(
                        "inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium transition-colors",
                        orderMode === "despacho"
                          ? "text-white"
                          : "text-zinc-200 hover:bg-white/5",
                      )}
                      style={{
                        backgroundColor:
                          orderMode === "despacho" ? STORE_THEME.accent : "transparent",
                      }}
                    >
                      <Truck className="size-4" />
                      Despacho
                    </button>
                  </div>

                  
                </div>
              </div>

              <div className="hidden md:block">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="rounded-full border-0 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-950">
                    Carta online
                  </Badge>
                  <Badge className="rounded-full border-0 bg-[#ff2b17] px-3 py-1 text-[11px] font-semibold text-white">
                    Delivery
                  </Badge>
                </div>

                <div className="mt-4 max-w-3xl space-y-3">
                  <p className="text-sm font-medium tracking-[0.18em] text-white/70 uppercase">
                    Sushi & poke
                  </p>
               
                  <p className="max-w-2xl text-base leading-7 text-white/75">
                    Consulta por cobertura de despacho y tiempos de espera.
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-3">
                  <StoreMetricCard
                    icon={Clock3}
                    label="ETA"
                    value={activeEta}
                    helper={
                      orderMode === "despacho" ? "Tiempo estimado de despacho" : "Tiempo estimado de retiro"
                    }
                  />
                  <StoreMetricCard
                    icon={Flame}
                    label="Promos activas"
                    value={promotions.length}
                    helper="Descuentos y combos visibles desde la tienda."
                  />
                  <StoreMetricCard
                    icon={MapPin}
                    label="Cobertura"
                    value={deliveryZones.length}
                    helper="Comunas configuradas para despacho."
                  />
                </div>

                <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="inline-flex w-full rounded-full bg-white/10 p-1 md:w-auto">
                    <button
                      type="button"
                      onClick={() => setOrderMode("retiro_local")}
                      className={cn(
                        "inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium transition-colors md:flex-none",
                        orderMode === "retiro_local"
                          ? "bg-white text-zinc-950"
                          : "text-white hover:bg-white/10",
                      )}
                    >
                      <Store className="size-4" />
                      Retiro
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderMode("despacho")}
                      className={cn(
                        "inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium transition-colors md:flex-none",
                        orderMode === "despacho"
                          ? "bg-[#ff2b17] text-white"
                          : "text-white hover:bg-white/10",
                      )}
                    >
                      <Truck className="size-4" />
                      Despacho
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      to="/?category=all"
                      className="inline-flex items-center rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-white/90"
                    >
                      Ver carta
                    </Link>
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/15"
                    >
                      <MessageCircle className="size-4" />
                      Consultar reparto
                    </a>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
        {featuredPromotions.length ? (
          <section id="promos" className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-[#ff2b17]">
                  <Flame className="size-4" />
                  Promociones destacadas
                </div>
                <h2 className="mt-1 text-2xl font-semibold text-white">
                  Ofertas Imperdibles
                </h2>
              </div>

              <Link
                to="/?category=promociones-rolls"
                className="hidden rounded-full px-4 py-2.5 text-sm font-medium text-zinc-100 shadow-sm md:inline-flex"
                style={{ backgroundColor: STORE_THEME.panelAlt }}
              >
                Ver promos
              </Link>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-2 lg:overflow-visible xl:grid-cols-4">
              {featuredPromotions.map((promotion) => (
                <PromotionCard key={promotion.id} promotion={promotion} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-3 md:hidden">
          <Card
            className="overflow-hidden rounded-[30px] border text-white shadow-[0_12px_30px_rgba(0,0,0,0.16)]"
            style={{ backgroundColor: STORE_THEME.panel, borderColor: STORE_THEME.border }}
          >
            <CardContent className="space-y-4 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar en la tienda"
                  className="h-12 rounded-full border-white/10 bg-[#242129] pl-11 text-white placeholder:text-zinc-500"
                />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => {
                    setSearchParams({ category: "all" });
                    setFavoritesOnly(false);
                  }}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                    selectedCategoryId === "all" && !favoritesOnly
                      ? "text-white"
                      : "text-zinc-200",
                  )}
                  style={{
                    backgroundColor:
                      selectedCategoryId === "all" && !favoritesOnly
                        ? STORE_THEME.accent
                        : STORE_THEME.panelAlt,
                  }}
                >
                  Todo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFavoritesOnly((current) => !current);
                    setSearchParams({ category: "all" });
                  }}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                    favoritesOnly ? "text-white" : "text-zinc-200",
                  )}
                  style={{
                    backgroundColor: favoritesOnly ? STORE_THEME.accent : STORE_THEME.panelAlt,
                  }}
                >
                  Favoritos
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setSearchParams({ category: slugifyCategoryName(category.name) });
                      setFavoritesOnly(false);
                    }}
                    className={cn(
                      "shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                      selectedCategoryId === category.id
                        ? "text-white"
                        : "text-zinc-200",
                    )}
                    style={
                      selectedCategoryId === category.id
                        ? { backgroundColor: STORE_THEME.accent }
                        : { backgroundColor: STORE_THEME.panelAlt }
                    }
                  >
                    {category.name}
                  </button>
                ))}
              </div>

              <div
                className="flex items-center justify-between gap-3 border-t pt-1 text-sm text-zinc-400"
                style={{ borderColor: STORE_THEME.border }}
              >
                <span>{visibleProductsCount} resultados</span>
                <span>{orderMode === "despacho" ? "Despacho" : "Retiro"}</span>
              </div>
            </CardContent>
          </Card>
        </section>
        

        <section className="hidden md:sticky md:top-[73px] md:z-40 md:block">
          <Card
            className="overflow-hidden rounded-[30px] border shadow-[0_20px_60px_rgba(0,0,0,0.2)] backdrop-blur"
            style={{ backgroundColor: "rgba(42, 39, 47, 0.96)", borderColor: STORE_THEME.border }}
          >
            <CardContent className="space-y-4 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Busca rolls, poke, ceviches o promos"
                  className="h-12 rounded-full border-white/10 bg-[#1f1d23] pl-11 text-white placeholder:text-zinc-500"
                />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                <CategoryFilterChip
                  label={`Toda la carta · ${products.length}`}
                  active={selectedCategoryId === "all" && !favoritesOnly}
                  onClick={() => {
                    setSearchParams({ category: "all" });
                    setFavoritesOnly(false);
                  }}
                />

                <CategoryFilterChip
                  label={`Favoritos · ${favoriteProductsCount}`}
                  active={favoritesOnly}
                  onClick={() => {
                    setFavoritesOnly((current) => !current);
                    setSearchParams({ category: "all" });
                  }}
                />

                {categories.map((category) => (
                  <CategoryFilterChip
                    key={category.id}
                    label={`${category.name} · ${categoryCounts[category.id] ?? 0}`}
                    active={selectedCategoryId === category.id}
                    dotColor={category.color}
                    onClick={() => {
                      setSearchParams({ category: slugifyCategoryName(category.name) });
                      setFavoritesOnly(false);
                    }}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-3 py-1 shadow-sm"
                    style={{ backgroundColor: STORE_THEME.panelAlt }}
                  >
                    {visibleProductsCount} resultados
                  </span>
                  <span
                    className="rounded-full px-3 py-1 shadow-sm"
                    style={{ backgroundColor: STORE_THEME.panelAlt }}
                  >
                    {orderMode === "despacho" ? "Despacho activo" : "Retiro activo"}
                  </span>
                </div>
                <span className="font-medium text-zinc-200">{activeCategoryName}</span>
              </div>
            </CardContent>
          </Card>
        </section>

      

        <section id="carta" className="space-y-6">
          {groupedProducts.length ? (
            groupedProducts.map(({ category, products: categoryProducts }) => (
              <section key={category.id} className="space-y-4">
                <div
                  className="overflow-hidden rounded-[30px] border p-5 text-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
                  style={{
                    borderColor: STORE_THEME.border,
                    backgroundImage: `linear-gradient(135deg, rgba(30,28,35,0.84), rgba(30,28,35,0.9)), url("${getCategoryBackdrop(category.name)}")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <div className="mb-2 flex items-center gap-3">
                        <span
                          className="inline-flex size-3 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        <h3 className="text-xl font-semibold md:text-2xl">{category.name}</h3>
                      </div>
                      <p className="text-sm leading-6 text-white/75">
                        {categoryProducts.length} producto
                        {categoryProducts.length === 1 ? "" : "s"} disponible
                        {favoritesOnly ? "s en favoritos" : "s"} para revisar rápido desde móvil.
                      </p>
                    </div>

                    <div className="inline-flex items-center rounded-full bg-white/10 px-4 py-2 text-sm text-white/90 backdrop-blur">
                      {orderMode === "despacho" ? "Entrega estimada" : "Retiro estimado"} · {activeEta}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {categoryProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      categoryName={category.name}
                      onSelect={openProductConfigurator}
                    />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <Card
              className="rounded-[30px] border shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
              style={{ backgroundColor: STORE_THEME.panel, borderColor: STORE_THEME.border }}
            >
              <CardContent className="p-6">
                <EmptyState
                  icon={ShoppingBasket}
                  title="No hay productos para este filtro"
                  description="Prueba otra categoría, limpia la búsqueda o desactiva favoritos para volver a ver el catálogo activo."
                />
              </CardContent>
            </Card>
          )}
        </section>

        <section>
          <Card
            className="overflow-hidden rounded-[34px] border shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
            style={{ backgroundColor: STORE_THEME.panel, borderColor: STORE_THEME.border }}
          >
            <CardContent className="grid gap-5 p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:p-6">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium tracking-[0.18em] text-zinc-400 uppercase">
                    Punto de retiro y cobertura
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    Punto de retiro al cierre del flujo
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-zinc-300">
                    La información de retiro queda al final, después de revisar carta y promociones,
                    para que no interrumpa la compra en móvil.
                  </p>
                </div>

                <div className="rounded-[28px] p-4" style={{ backgroundColor: STORE_THEME.cardSoft }}>
                  <p className="text-sm font-semibold text-white">Dirección de retiro</p>
                  <p className="mt-1 text-sm text-zinc-300">{pickupAddress}</p>
                  <p className="mt-4 text-sm font-semibold text-white">
                    {orderMode === "despacho" ? "Modo despacho activo" : "Modo retiro activo"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-zinc-300">
                    ETA actual: <span className="font-semibold text-white">{activeEta}</span>
                  </p>
                  <p className="mt-4 text-sm font-semibold text-white">Zona de reparto</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-300">
                    Si quieres confirmar cobertura antes de cerrar el pedido, usa el botón de
                    WhatsApp. En móvil queda accesible también desde la barra inferior.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <a
                    href={pickupMapHref}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "h-12 rounded-full border-white/10 bg-transparent text-white hover:bg-white/5",
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
                    Consultar reparto
                  </a>
                </div>
              </div>

              <div
                className="overflow-hidden rounded-[30px] border"
                style={{ backgroundColor: "#25222a", borderColor: STORE_THEME.border }}
              >
                <iframe
                  title="Mapa de retiro Recoleta 5758"
                  src={pickupMapEmbed}
                  className="h-[260px] w-full border-0 lg:h-full lg:min-h-[420px]"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      {cartItemsCount ? (
        <div className="fixed inset-x-0 bottom-[76px] z-50 px-3 md:hidden">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="mx-auto flex w-full max-w-[1540px] items-center justify-between gap-3 rounded-[22px] border px-4 py-3 text-left text-white shadow-[0_20px_50px_rgba(0,0,0,0.28)] backdrop-blur"
            style={{
              backgroundColor: "rgba(42, 39, 47, 0.96)",
              borderColor: STORE_THEME.border,
            }}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">Ver carrito</p>
              <p className="truncate text-xs text-zinc-400">
                {cartItemsCount} item(s) · {formatCurrency(cartSubtotal)}
              </p>
            </div>
            <span
              className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: STORE_THEME.accent }}
            >
              Abrir
            </span>
          </button>
        </div>
      ) : null}

      <div
        className="fixed inset-x-0 bottom-0 z-50 border-t p-3 backdrop-blur md:hidden"
        style={{ backgroundColor: "rgba(31, 29, 35, 0.96)", borderColor: STORE_THEME.border }}
      >
        <div className="mx-auto flex max-w-[1540px] items-center gap-2">
          <Link
            to="/?category=promociones-rolls"
            className="inline-flex min-w-0 flex-1 items-center justify-center rounded-full px-3 py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: STORE_THEME.panelAlt }}
          >
            Promos
          </Link>
          <Link
            to="/?category=all"
            className="inline-flex min-w-0 flex-1 items-center justify-center rounded-full px-3 py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: STORE_THEME.accent }}
          >
            Carta
          </Link>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-emerald-500 px-3 py-3 text-sm font-semibold text-white"
          >
            <MessageCircle className="size-4" />
            WhatsApp
          </a>
        </div>
      </div>

      <ProductPickerDialog
        open={Boolean(selectedProduct)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedProduct(null);
          }
        }}
        product={selectedProduct}
        submitLabel="Agregar al carrito"
        onConfirm={(selection) => {
          const product = products.find((entry) => entry.id === selection.productId);

          if (!product) {
            return;
          }

          addItem(
            buildStorefrontCartItem(
              product,
              categoryNameById.get(product.categoryId) ?? "General",
              selection,
            ),
          );
          setSelectedProduct(null);
          toast.success(`${product.name} se agregó al carrito.`);
        }}
      />

      <StorefrontCheckoutSheet
        open={isCartOpen}
        onOpenChange={setIsCartOpen}
        orderMode={orderMode}
        onOrderModeChange={setOrderMode}
        cart={cart}
        subtotal={cartSubtotal}
        deliveryZones={deliveryZones}
        customerDraft={customerDraft}
        onCustomerDraftChange={setCustomerDraft}
        onIncreaseQuantity={(itemId) => {
          const item = cart.find((entry) => entry.id === itemId);
          if (!item) {
            return;
          }

          updateQuantity(itemId, item.quantity + 1);
        }}
        onDecreaseQuantity={(itemId) => {
          const item = cart.find((entry) => entry.id === itemId);
          if (!item) {
            return;
          }

          updateQuantity(itemId, item.quantity - 1);
        }}
        onRemoveItem={removeItem}
        onSubmitOrder={submitStorefrontOrder}
        onOpenRecommendedProduct={openRecommendedProduct}
        customerProfile={customerProfileQuery.data}
        isProfileLoading={customerProfileQuery.isLoading}
        isSubmitting={createStorefrontOrder.isPending}
      />
    </div>
  );
}
