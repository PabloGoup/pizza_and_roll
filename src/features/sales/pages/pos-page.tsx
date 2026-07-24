import { createColumnHelper } from "@tanstack/react-table";
import { Download, Minus, PackageX, Plus, Printer, ShoppingBasket, Star, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { AvailabilityDialog } from "@/features/availability/components/availability-dialog";
import { useStorefrontAvailability } from "@/features/availability/hooks/use-availability";
import {
  useProductCategories,
  useProducts,
  useToggleProductFavorite,
} from "@/features/products/hooks/use-products";
import { CancelOrderDialog } from "@/features/sales/components/cancel-order-dialog";
import { CheckoutPanel } from "@/features/sales/components/checkout-panel";
import { EditOrderDialog } from "@/features/sales/components/edit-order-dialog";
import { OrderPrintPreviewDialog } from "@/features/sales/components/order-print-preview-dialog";
import { ProductPickerDialog } from "@/features/sales/components/product-picker-dialog";
import {
  getQzErrorMessage,
  printKitchenOrderAutomatically,
} from "@/features/sales/lib/qz-print";
import {
  useCancelOrder,
  useCreateOrder,
  useCurrentSessionOrders,
  useUpdateOrder,
  useUpdateOrderStatus,
} from "@/features/sales/hooks/use-sales";
import { formatCurrency, orderStatusLabel, orderTypeLabel, paymentMethodLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { useAuthStore } from "@/stores/auth-store";
import { usePosStore } from "@/stores/pos-store";
import type { CheckoutPayload, Order, PosCartItem, Product } from "@/types/domain";

// FLUJO DE CAJA — PEDIDOS WHATSAPP:
// Las órdenes de WhatsApp se crean con cashier_id='Bot WhatsApp' (UUID fijo).
// NO generan cash_movement automáticamente.
// Proceso de cobro:
// 1. Cliente llega y menciona el número de orden (PR-XXXX)
// 2. Cajero filtra por canal WhatsApp y busca la orden
// 3. Cajero verifica identidad con customerNameSnapshot
// 4. Cajero registra el pago manualmente seleccionando la orden
// 5. La orden se marca como 'entregado' al confirmar el pago

const BADGE_CANAL: Record<string, { label: string; className: string; icon: string }> = {
  whatsapp: { label: "WhatsApp", className: "bg-green-100 text-green-800 border-green-200", icon: "💬" },
  web:      { label: "Web",      className: "bg-blue-100 text-blue-800 border-blue-200",   icon: "🌐" },
  pos:      { label: "Local",    className: "bg-gray-100 text-gray-700 border-gray-200",   icon: "🏪" },
};

const columnHelper = createColumnHelper<Order>();

function CurrentSalePanel({
  cart,
  total,
  isPending,
  onClear,
  onRemove,
  onUpdateQuantity,
  onSubmit,
  compact = false,
}: {
  cart: PosCartItem[];
  total: number;
  isPending: boolean;
  onClear: () => void;
  onRemove: (itemId: string) => void;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onSubmit: (values: CheckoutPayload) => Promise<unknown>;
  compact?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Carrito
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {cart.length
              ? `${cart.length} item${cart.length === 1 ? "" : "s"} listos para cobro`
              : "Aún no agregas productos"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Total
          </p>
          <p className="mt-1 text-2xl font-semibold">{formatCurrency(total)}</p>
        </div>
      </div>

      {cart.length ? (
        <div className="space-y-3">
          <div className={cn("space-y-3 overflow-y-auto pr-1", compact ? "max-h-[34vh]" : "max-h-[36vh]")}>
            {cart.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.variantName ?? item.categoryName}
                    </p>
                    {item.modifiers.length ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {item.modifiers.map((modifier) => modifier.name).join(", ")}
                      </p>
                    ) : null}
                    {item.notes ? (
                      <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label={`Quitar ${item.productName}`}
                    onClick={() => onRemove(item.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-11 rounded-xl"
                      aria-label={`Restar una unidad de ${item.productName}`}
                      onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-11 rounded-xl"
                      aria-label={`Sumar una unidad de ${item.productName}`}
                      onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  <span className="font-semibold">
                    {formatCurrency(
                      (item.unitPrice +
                        item.modifiers.reduce((sum, modifier) => sum + modifier.priceDelta, 0)) *
                        item.quantity,
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" className="w-full rounded-2xl" onClick={onClear}>
            Vaciar carrito
          </Button>
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-border/70 bg-muted/10 px-6 py-8 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-border/70 bg-background">
            <ShoppingBasket className="size-6 text-muted-foreground" />
          </div>
          <p className="mt-4 text-lg font-medium">Carrito vacío</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Agrega productos desde el catálogo para crear una venta.
          </p>
        </div>
      )}

      <Separator />
      <CheckoutPanel cart={cart} total={total} isPending={isPending} onSubmit={onSubmit} />
    </div>
  );
}

export function PosPage() {
  const currentUser = useAuthStore((state) => state.currentUser)!;
  const products = useProducts();
  const categories = useProductCategories();
  const orders = useCurrentSessionOrders();
  const availability = useStorefrontAvailability();
  const toggleFavorite = useToggleProductFavorite(currentUser);
  const createOrder = useCreateOrder(currentUser);
  const cancelOrder = useCancelOrder(currentUser);
  const updateOrder = useUpdateOrder(currentUser);
  const updateOrderStatus = useUpdateOrderStatus(currentUser);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [editTarget, setEditTarget] = useState<Order | null>(null);
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
  const [reprintingOrderId, setReprintingOrderId] = useState<string | null>(null);
  const [filtroCanal, setFiltroCanal] = useState<"todos" | "whatsapp" | "web" | "pos">("todos");
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  const {
    cart,
    search,
    selectedCategoryId,
    favoritesOnly,
    setSearch,
    setSelectedCategoryId,
    toggleFavoritesOnly,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  } = usePosStore();

  useEffect(() => {
    if (
      selectedCategoryId &&
      !(categories.data ?? []).some((category) => category.id === selectedCategoryId)
    ) {
      setSelectedCategoryId(null);
    }
  }, [categories.data, selectedCategoryId, setSelectedCategoryId]);

  const categoryMap = useMemo(
    () => new Map((categories.data ?? []).map((category) => [category.id, category])),
    [categories.data],
  );
  const availabilityByProductId = useMemo(
    () => new Map((availability.data ?? []).map((item) => [item.productId, item])),
    [availability.data],
  );

  const activeProducts = useMemo(
    () => (products.data ?? []).filter((product) => product.status === "activo"),
    [products.data],
  );

  const visibleCategories = useMemo(() => {
    const activeCategoryIds = new Set(activeProducts.map((product) => product.categoryId));

    return (categories.data ?? []).filter((category) => activeCategoryIds.has(category.id));
  }, [activeProducts, categories.data]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return [...activeProducts]
      .filter((product) => {
        const categoryName = categoryMap.get(product.categoryId)?.name ?? "";
        const matchesSearch =
          !normalizedSearch ||
          product.name.toLowerCase().includes(normalizedSearch) ||
          product.description.toLowerCase().includes(normalizedSearch) ||
          categoryName.toLowerCase().includes(normalizedSearch);
        const matchesCategory = !selectedCategoryId || product.categoryId === selectedCategoryId;
        const matchesFavorite = !favoritesOnly || product.isFavorite;

        return matchesSearch && matchesCategory && matchesFavorite;
      })
      .sort((left, right) => {
        const categoryDelta =
          (categoryMap.get(left.categoryId)?.sortOrder ?? 999) -
          (categoryMap.get(right.categoryId)?.sortOrder ?? 999);

        if (categoryDelta !== 0) {
          return categoryDelta;
        }

        const productDelta = left.sortOrder - right.sortOrder;

        if (productDelta !== 0) {
          return productDelta;
        }

        return left.name.localeCompare(right.name, "es");
      });
  }, [activeProducts, categoryMap, favoritesOnly, search, selectedCategoryId]);

  const groupedProducts = useMemo(() => {
    const sections = new Map<
      string,
      {
        id: string;
        name: string;
        products: Product[];
      }
    >();

    for (const product of filteredProducts) {
      const category = categoryMap.get(product.categoryId);

      if (!sections.has(product.categoryId)) {
        sections.set(product.categoryId, {
          id: product.categoryId,
          name: category?.name ?? "General",
          products: [],
        });
      }

      sections.get(product.categoryId)!.products.push(product);
    }

    return [...sections.values()];
  }, [categoryMap, filteredProducts]);

  const emptyDescription =
    favoritesOnly
      ? "No hay favoritos para esta búsqueda o categoría. Puedes cambiar categoría sin perder el filtro."
      : "Prueba ajustando búsqueda, categoría o favoritos.";

  const hasActiveFilter =
    Boolean(selectedCategoryId) || favoritesOnly || search.trim().length > 0;

  function handleCategorySelect(categoryId: string | null) {
    setSelectedCategoryId(categoryId);
  }

  const cartTotal = cart.reduce(
    (total, item) =>
      total +
      (item.unitPrice + item.modifiers.reduce((sum, modifier) => sum + modifier.priceDelta, 0)) *
        item.quantity,
    0,
  );

  const ordenesFiltradas = useMemo(
    () =>
      filtroCanal === "todos"
        ? (orders.data ?? [])
        : (orders.data ?? []).filter((o) => o.source === filtroCanal),
    [orders.data, filtroCanal],
  );

  function exportOrdersCsv() {
    downloadCsv(
      `ventas-${filtroCanal}-${new Date().toISOString().slice(0, 10)}`,
      ["Pedido", "Canal", "Tipo", "Estado", "Pago", "Total", "Cliente", "Fecha"],
      ordenesFiltradas.map((order) => [
        order.number,
        order.source ?? "pos",
        orderTypeLabel(order.type),
        orderStatusLabel(order.status),
        paymentMethodLabel(order.paymentMethod),
        order.total,
        order.customerNameSnapshot ?? order.customer?.fullName ?? "",
        order.createdAt,
      ]),
    );
  }

  async function reprintKitchenOrder(order: Order) {
    setReprintingOrderId(order.id);

    try {
      const printer = await printKitchenOrderAutomatically(order, { isReprint: true });
      toast.success(`Comanda ${order.number} reenviada automáticamente a ${printer}.`);
    } catch (printError) {
      setPreviewOrder(order);
      toast.warning(
        `${getQzErrorMessage(printError)} Se abrió la impresión manual como respaldo.`,
      );
    } finally {
      setReprintingOrderId(null);
    }
  }

  function printEditedKitchenOrder(order: Order) {
    void printKitchenOrderAutomatically(order, { isRevision: true })
      .then((printer) => {
        toast.success(`Comanda modificada enviada automáticamente a ${printer}.`);
      })
      .catch((printError: unknown) => {
        setPreviewOrder(order);
        toast.warning(
          `${getQzErrorMessage(printError)} Se abrió la impresión manual como respaldo.`,
        );
      });
  }

  async function handleCreateOrder(values: CheckoutPayload) {
    try {
      const createdOrder = await createOrder.mutateAsync({ cart, payload: values });
      clearCart();
      setMobileCartOpen(false);
      toast.success("Venta registrada correctamente.");

      try {
        const printer = await printKitchenOrderAutomatically(createdOrder);
        toast.success(`Comanda enviada automáticamente a ${printer}.`);
      } catch (printError) {
        setPreviewOrder(createdOrder);
        toast.warning(`${getQzErrorMessage(printError)} Se abrió la impresión manual como respaldo.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar la venta.");
      throw error;
    }
  }

  const orderColumns = [
    columnHelper.accessor("number", {
      header: "Pedido",
      cell: (info) => {
        const order = info.row.original;
        const canal = order.source ? BADGE_CANAL[order.source] : null;
        return (
          <div className="space-y-1">
            <p className="font-medium">{order.number}</p>
            <p className="text-xs text-muted-foreground">{orderTypeLabel(order.type)}</p>
            {canal && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${canal.className}`}
              >
                {canal.icon} {canal.label}
              </span>
            )}
            {order.source === "whatsapp" && (order.customerNameSnapshot || order.customerPhoneSnapshot) && (
              <div className="mt-1 text-xs text-green-800 space-y-0.5">
                {order.customerNameSnapshot && (
                  <p className="font-medium">👤 {order.customerNameSnapshot}</p>
                )}
                {order.customerPhoneSnapshot && (
                  <p>📞 {order.customerPhoneSnapshot}</p>
                )}
              </div>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor("cashierName", {
      header: "Cajero",
    }),
    columnHelper.accessor("paymentMethod", {
      header: "Pago",
      cell: (info) => paymentMethodLabel(info.getValue()),
    }),
    columnHelper.accessor("total", {
      header: "Total",
      cell: (info) => formatCurrency(info.getValue()),
    }),
    columnHelper.accessor("status", {
      header: "Estado",
      cell: (info) => (
        <StatusBadge
          label={orderStatusLabel(info.getValue())}
          tone={
            info.getValue() === "cancelado"
              ? "danger"
              : info.getValue() === "listo" || info.getValue() === "entregado"
                ? "success"
                : "warning"
          }
        />
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: (info) => (
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          {info.row.original.status !== "cancelado" ? (
            <Button
              variant="outline"
              size="xs"
              className="rounded-full"
              onClick={() => setEditTarget(info.row.original)}
            >
              Editar
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="xs"
            className="rounded-full"
            disabled={reprintingOrderId === info.row.original.id}
            onClick={() => {
              void reprintKitchenOrder(info.row.original);
            }}
          >
            <Printer className="size-3.5" />
            {reprintingOrderId === info.row.original.id ? "Imprimiendo..." : "Reimprimir"}
          </Button>

          {info.row.original.status === "pendiente" ? (
            <Button
              variant="outline"
              size="xs"
              className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
              disabled={updateOrderStatus.isPending}
              onClick={() =>
                updateOrderStatus.mutate({
                  orderId: info.row.original.id,
                  status: "listo",
                })
              }
            >
              Marcar terminado
            </Button>
          ) : null}

          {info.row.original.status === "listo" ? (
            <>
              <Button
                variant="outline"
                size="xs"
                className="rounded-full border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                disabled={updateOrderStatus.isPending}
                onClick={() =>
                  updateOrderStatus.mutate({
                    orderId: info.row.original.id,
                    status: "entregado",
                  })
                }
              >
                Marcar entregado
              </Button>
              <Button
                variant="outline"
                size="xs"
                className="rounded-full border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
                disabled={updateOrderStatus.isPending}
                onClick={() =>
                  updateOrderStatus.mutate({
                    orderId: info.row.original.id,
                    status: "pendiente",
                  })
                }
              >
                Volver a preparación
              </Button>
            </>
          ) : null}

          {info.row.original.status !== "cancelado" ? (
            <Button
              variant="outline"
              size="xs"
              className="rounded-full"
              onClick={() => setCancelTarget(info.row.original)}
            >
              Anular
            </Button>
          ) : null}
        </div>
      ),
    }),
  ];

  if (products.isLoading || categories.isLoading || orders.isLoading) {
    return <LoadingState label="Cargando POS..." />;
  }

  return (
    <div className="pos-bg space-y-4 pb-24 sm:space-y-6 sm:pb-0">
      <PageHeader
        title="Ventas / POS"
        description="Pantalla operativa de caja con búsqueda rápida, carrito y registro de ventas."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setAvailabilityOpen(true)}>
              <PackageX className="size-4" />
              Disponibilidad
            </Button>
          </div>
        }
      />
      <AvailabilityDialog open={availabilityOpen} onOpenChange={setAvailabilityOpen} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,420px)]">
        <section className="space-y-4">
          <Card className="overflow-hidden border-border/70">
            <CardHeader className="px-4 py-4 sm:px-6 sm:py-6">
              <CardTitle>Catálogo rápido</CardTitle>
              <CardDescription className="hidden sm:block">
                Busca por nombre, categoría o favoritos. Selecciona un producto para abrir su
                configuración y agregarlo al carrito.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-3 pb-4 sm:px-6 sm:pb-6">
              <div className="hidden rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950 sm:block">
                1. Elige un producto.
                {" "}
                2. Ajusta cantidad, variante u observaciones.
                {" "}
                3. Agrégalo al carrito.
                {" "}
                4. Completa el cobro y confirma la venta.
              </div>

              <div className="grid gap-4 md:grid-cols-[210px_minmax(0,1fr)]">
                <div className="pos-category-strip -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0">
                  <p className="hidden px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground md:block">
                    Categorías
                  </p>
                  <Button
                    variant={favoritesOnly ? "default" : "outline"}
                    className="h-11 shrink-0 justify-start rounded-xl md:w-full"
                    onClick={toggleFavoritesOnly}
                  >
                    <Star className="size-4" />
                    Favoritos
                  </Button>
                  {visibleCategories.map((category) => (
                    <Button
                      key={category.id}
                      variant={selectedCategoryId === category.id ? "default" : "outline"}
                      className="h-11 shrink-0 justify-start rounded-xl md:w-full"
                      onClick={() => handleCategorySelect(category.id)}
                    >
                      {category.name}
                    </Button>
                  ))}
                </div>

                <div className="space-y-4">
                  <Input
                    className="h-12 rounded-2xl text-base"
                    placeholder="Buscar pizza, roll, bebida..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />

                  {!hasActiveFilter ? (
                    <EmptyState
                      icon={ShoppingBasket}
                      title="Elige una categoría"
                      description="Selecciona una categoría a la izquierda, marca Favoritos o busca un producto para empezar."
                    />
                  ) : filteredProducts.length ? (
                    <div className="space-y-6">
                      {groupedProducts.map((group) => (
                    <div key={group.id} className="space-y-3">
                      {!selectedCategoryId ? (
                        <div className="flex items-end justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {group.name}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {group.products.length}
                              {" "}
                              producto{group.products.length === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>
                      ) : null}

                      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
                        {group.products.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            disabled={
                              product.isSoldOut ||
                              Boolean(availabilityByProductId.get(product.id)?.isSoldOut)
                            }
                            className="pos-product-card min-h-36 rounded-2xl border border-border/70 bg-muted/10 p-3 text-left transition-[transform,border-color,background-color] duration-150 ease-out active:scale-[0.98] hover:border-orange-400/40 hover:bg-orange-500/5 disabled:cursor-not-allowed disabled:opacity-55"
                            onClick={() => setSelectedProduct(product)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p
                                  className={cn(
                                    "line-clamp-1 text-sm font-semibold",
                                    product.isSoldOut && "line-through",
                                  )}
                                >
                                  {product.name}
                                </p>
                                <p className="mt-1 hidden line-clamp-2 text-xs text-muted-foreground sm:block">
                                  {product.description}
                                </p>
                              </div>
                              <span
                                role="button"
                                tabIndex={0}
                                aria-label={
                                  product.isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"
                                }
                                title={
                                  product.isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"
                                }
                                className="-m-1 shrink-0 rounded-full p-1 text-muted-foreground transition hover:text-orange-500"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (toggleFavorite.isPending) return;
                                  toggleFavorite.mutate(
                                    { productId: product.id, isFavorite: !product.isFavorite },
                                    {
                                      onError: (error) =>
                                        toast.error(
                                          error instanceof Error
                                            ? error.message
                                            : "No se pudo actualizar el favorito.",
                                        ),
                                    },
                                  );
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    toggleFavorite.mutate({
                                      productId: product.id,
                                      isFavorite: !product.isFavorite,
                                    });
                                  }
                                }}
                              >
                                <Star
                                  className={cn(
                                    "mt-0.5 size-4",
                                    product.isFavorite
                                      ? "fill-orange-500 text-orange-500"
                                      : "text-muted-foreground",
                                  )}
                                />
                              </span>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <span className="hidden truncate text-xs text-muted-foreground sm:block">
                                {categoryMap.get(product.categoryId)?.name ?? "General"}
                              </span>
                              <span className="shrink-0 text-sm font-semibold sm:text-base">
                                {formatCurrency(product.basePrice)}
                              </span>
                            </div>
                            <div className="mt-3">
                              <span className="inline-flex h-9 w-full items-center justify-center rounded-xl bg-black px-3 text-xs font-semibold text-white sm:w-auto">
                                {product.isSoldOut ||
                                availabilityByProductId.get(product.id)?.isSoldOut
                                  ? "Agotado"
                                  : availabilityByProductId.get(product.id)?.unavailableIngredients.length
                                    ? "Elegir cambio"
                                    : "Agregar"}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                  ) : (
                    <EmptyState
                      icon={ShoppingBasket}
                      title="Sin coincidencias"
                      description={emptyDescription}
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

        </section>

        <aside className="hidden xl:block">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Venta actual</CardTitle>
              <CardDescription>Agrega productos, revisa el total y confirma sin salir del flujo.</CardDescription>
            </CardHeader>
            <CardContent>
              <CurrentSalePanel
                cart={cart}
                total={cartTotal}
                isPending={createOrder.isPending}
                onClear={clearCart}
                onRemove={removeItem}
                onUpdateQuantity={updateQuantity}
                onSubmit={handleCreateOrder}
              />
            </CardContent>
          </Card>
        </aside>
      </div>

      <button
        type="button"
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex min-h-16 items-center justify-between gap-4 rounded-2xl bg-foreground px-5 text-left text-background shadow-2xl shadow-black/25 transition-transform duration-150 ease-out active:scale-[0.98] xl:hidden"
        onClick={() => setMobileCartOpen(true)}
        aria-label={`Abrir venta actual, ${cart.length} productos, total ${formatCurrency(cartTotal)}`}
      >
        <span className="flex items-center gap-3">
          <span className="relative flex size-10 items-center justify-center rounded-xl bg-background/15">
            <ShoppingBasket className="size-5" />
            {cart.length ? (
              <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
                {cart.length}
              </span>
            ) : null}
          </span>
          <span>
            <span className="block text-xs text-background/70">Venta actual</span>
            <span className="block text-sm font-semibold">
              {cart.length ? "Revisar y cobrar" : "Carrito vacío"}
            </span>
          </span>
        </span>
        <span className="text-lg font-semibold">{formatCurrency(cartTotal)}</span>
      </button>

      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[96dvh] gap-0 overflow-hidden rounded-t-[28px] pb-[env(safe-area-inset-bottom)] xl:hidden"
        >
          <SheetHeader className="flex-row items-center justify-between border-b border-border/70 px-4 py-3">
            <div>
              <SheetTitle className="text-lg">Venta actual</SheetTitle>
              <SheetDescription>Revisa el pedido y confirma el cobro.</SheetDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 rounded-full"
              onClick={() => setMobileCartOpen(false)}
              aria-label="Cerrar venta actual"
            >
              <X className="size-5" />
            </Button>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <CurrentSalePanel
              compact
              cart={cart}
              total={cartTotal}
              isPending={createOrder.isPending}
              onClear={clearCart}
              onRemove={removeItem}
              onUpdateQuantity={updateQuantity}
              onSubmit={handleCreateOrder}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Card className="border-border/70">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle>Ventas recientes</CardTitle>
          <CardDescription>
            Historial completo del turno con seguimiento, reimpresión y opción de anulación.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-3 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="pos-category-strip -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              {(["todos", "whatsapp", "web", "pos"] as const).map((canal) => (
                <Button
                  key={canal}
                  variant={filtroCanal === canal ? "default" : "outline"}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setFiltroCanal(canal)}
                >
                  {canal === "todos" && "Todos"}
                  {canal === "whatsapp" && "💬 WhatsApp"}
                  {canal === "web" && "🌐 Web"}
                  {canal === "pos" && "🏪 Local"}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full rounded-full sm:w-auto"
              onClick={exportOrdersCsv}
              disabled={!ordenesFiltradas.length}
            >
              <Download className="size-4" />
              Exportar CSV
            </Button>
          </div>

          <div className="space-y-3 md:hidden">
            {ordenesFiltradas.length ? (
              ordenesFiltradas.map((order) => {
                const canal = order.source ? BADGE_CANAL[order.source] : null;
                return (
                  <article key={order.id} className="rounded-2xl border border-border/70 bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{order.number}</p>
                          {canal ? (
                            <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", canal.className)}>
                              {canal.icon} {canal.label}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {orderTypeLabel(order.type)} · {paymentMethodLabel(order.paymentMethod)}
                        </p>
                      </div>
                      <StatusBadge
                        label={orderStatusLabel(order.status)}
                        tone={
                          order.status === "cancelado"
                            ? "danger"
                            : order.status === "listo" || order.status === "entregado"
                              ? "success"
                              : "warning"
                        }
                      />
                    </div>

                    {(order.customerNameSnapshot || order.customer?.fullName) ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {order.customerNameSnapshot ?? order.customer?.fullName}
                      </p>
                    ) : null}

                    <div className="mt-4 flex items-end justify-between gap-3 border-t border-border/70 pt-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-xl font-semibold">{formatCurrency(order.total)}</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {order.status !== "cancelado" ? (
                          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setEditTarget(order)}>
                            Editar
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-10 rounded-xl"
                          disabled={reprintingOrderId === order.id}
                          onClick={() => void reprintKitchenOrder(order)}
                          aria-label={`Reimprimir ${order.number}`}
                        >
                          <Printer className="size-4" />
                        </Button>
                        {order.status === "pendiente" ? (
                          <Button
                            size="sm"
                            className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                            disabled={updateOrderStatus.isPending}
                            onClick={() => updateOrderStatus.mutate({ orderId: order.id, status: "listo" })}
                          >
                            Terminado
                          </Button>
                        ) : null}
                        {order.status === "listo" ? (
                          <Button
                            size="sm"
                            className="rounded-xl"
                            disabled={updateOrderStatus.isPending}
                            onClick={() => updateOrderStatus.mutate({ orderId: order.id, status: "entregado" })}
                          >
                            Entregado
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <EmptyState
                icon={ShoppingBasket}
                title="Sin ventas registradas"
                description="Las ventas confirmadas aparecerán aquí."
              />
            )}
          </div>

          <div
            className="hidden overflow-x-auto pb-2 md:block"
            aria-label="Ventas recientes con desplazamiento horizontal"
          >
            <div className="min-w-[1120px]">
              <DataTable
                columns={orderColumns}
                data={ordenesFiltradas}
                emptyTitle="Sin ventas registradas"
                emptyDescription={
                  filtroCanal === "todos"
                    ? "Las ventas confirmadas aparecerán aquí."
                    : `No hay ventas del canal "${filtroCanal}" en este turno.`
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <ProductPickerDialog
        open={Boolean(selectedProduct)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedProduct(null);
          }
        }}
        product={selectedProduct}
        categoryName={
          categories.data?.find((category) => category.id === selectedProduct?.categoryId)?.name ??
          ""
        }
        availabilityWarning={
          selectedProduct?.isSoldOut
            ? "Este producto está agotado."
            : null
        }
        unavailableIngredients={
          selectedProduct
            ? availabilityByProductId.get(selectedProduct.id)?.unavailableIngredients ?? []
            : []
        }
        onConfirm={(selection) => {
          const product = products.data?.find((entry) => entry.id === selection.productId);

          if (!product) {
            return;
          }

          const variant = product.variants.find((entry) => entry.id === selection.variantId);
          const selectedProductModifiers = product.modifiers.filter((modifier) =>
            selection.modifierIds.includes(modifier.id),
          );
          const modifiers = [
            ...selectedProductModifiers.map((modifier) => ({
              id: modifier.id,
              name: modifier.name,
              priceDelta: modifier.priceDelta,
            })),
            ...selection.manualModifiers,
          ];

          addItem({
            id: crypto.randomUUID(),
            productId: product.id,
            productName: product.name,
            categoryName:
              categories.data?.find((category) => category.id === product.categoryId)?.name ??
              "General",
            quantity: selection.quantity,
            unitPrice: variant?.price ?? product.basePrice,
            notes: selection.notes ?? "",
            variantId: variant?.id,
            variantName: variant?.name,
            modifiers,
          });
        }}
      />

      <CancelOrderDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
          }
        }}
        order={cancelTarget}
        isPending={cancelOrder.isPending}
        onSubmit={async (values) => {
          if (!cancelTarget) {
            return;
          }

          try {
            await cancelOrder.mutateAsync({
              orderId: cancelTarget.id,
              reason: values.reason,
            });
            setCancelTarget(null);
            toast.success("Venta anulada.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "No se pudo anular la venta.");
          }
        }}
      />

      <EditOrderDialog
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
          }
        }}
        order={editTarget}
        products={activeProducts}
        categories={categories.data ?? []}
        isPending={updateOrder.isPending}
        onSubmit={async (values) => {
          if (!editTarget) {
            return;
          }

          try {
            const updatedOrder = await updateOrder.mutateAsync({
              orderId: editTarget.id,
              payload: values,
            });
            setEditTarget(null);
            toast.success("Venta actualizada correctamente.");
            printEditedKitchenOrder(updatedOrder);
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "No se pudo actualizar la venta.",
            );
          }
        }}
      />

      <OrderPrintPreviewDialog
        open={Boolean(previewOrder)}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewOrder(null);
          }
        }}
        order={previewOrder}
      />
    </div>
  );
}
