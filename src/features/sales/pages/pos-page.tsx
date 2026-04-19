import { createColumnHelper } from "@tanstack/react-table";
import { Eye, Minus, Plus, ShoppingBasket, Star, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { useProductCategories, useProducts } from "@/features/products/hooks/use-products";
import { CancelOrderDialog } from "@/features/sales/components/cancel-order-dialog";
import { CheckoutPanel } from "@/features/sales/components/checkout-panel";
import { OrderPrintPreviewDialog } from "@/features/sales/components/order-print-preview-dialog";
import {
  openPrintWindow,
  printOrderToWindow,
} from "@/features/sales/lib/order-print";
import { ProductPickerDialog } from "@/features/sales/components/product-picker-dialog";
import {
  useCancelOrder,
  useCreateOrder,
  useOrders,
  useUpdateOrderStatus,
} from "@/features/sales/hooks/use-sales";
import { formatCurrency, orderStatusLabel, orderTypeLabel, paymentMethodLabel } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { usePosStore } from "@/stores/pos-store";
import type { Order, Product } from "@/types/domain";

const columnHelper = createColumnHelper<Order>();

export function PosPage() {
  const currentUser = useAuthStore((state) => state.currentUser)!;
  const products = useProducts();
  const categories = useProductCategories();
  const orders = useOrders();
  const createOrder = useCreateOrder(currentUser);
  const cancelOrder = useCancelOrder(currentUser);
  const updateOrderStatus = useUpdateOrderStatus(currentUser);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);

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

  const filteredProductsWithoutFavorites = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return activeProducts.filter((product) => {
      const categoryName = categoryMap.get(product.categoryId)?.name ?? "";
      const matchesSearch =
        !normalizedSearch ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.description.toLowerCase().includes(normalizedSearch) ||
        categoryName.toLowerCase().includes(normalizedSearch);
      const matchesCategory = !selectedCategoryId || product.categoryId === selectedCategoryId;

      return matchesSearch && matchesCategory;
    });
  }, [activeProducts, categoryMap, search, selectedCategoryId]);

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
    favoritesOnly && filteredProductsWithoutFavorites.length
      ? "No hay favoritos en esta categoría o búsqueda. Se desactivará Favoritos si eliges otra categoría."
      : "Prueba ajustando búsqueda, categoría o favoritos.";

  function handleCategorySelect(categoryId: string | null) {
    if (!favoritesOnly) {
      setSelectedCategoryId(categoryId);
      return;
    }

    const normalizedSearch = search.trim().toLowerCase();
    const hasMatchesWithoutFavorites = activeProducts.some((product) => {
      if (categoryId && product.categoryId !== categoryId) {
        return false;
      }

      const categoryName = categoryMap.get(product.categoryId)?.name ?? "";
      return (
        !normalizedSearch ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.description.toLowerCase().includes(normalizedSearch) ||
        categoryName.toLowerCase().includes(normalizedSearch)
      );
    });

    const hasMatchesWithFavorites = activeProducts.some((product) => {
      if (!product.isFavorite) {
        return false;
      }

      if (categoryId && product.categoryId !== categoryId) {
        return false;
      }

      const categoryName = categoryMap.get(product.categoryId)?.name ?? "";
      return (
        !normalizedSearch ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.description.toLowerCase().includes(normalizedSearch) ||
        categoryName.toLowerCase().includes(normalizedSearch)
      );
    });

    setSelectedCategoryId(categoryId);

    if (hasMatchesWithoutFavorites && !hasMatchesWithFavorites) {
      toggleFavoritesOnly();
      toast.info("Se desactivó Favoritos para mostrar los productos de esa categoría.");
    }
  }

  const cartTotal = cart.reduce(
    (total, item) =>
      total +
      (item.unitPrice + item.modifiers.reduce((sum, modifier) => sum + modifier.priceDelta, 0)) *
        item.quantity,
    0,
  );

  const orderColumns = [
    columnHelper.accessor("number", {
      header: "Pedido",
      cell: (info) => (
        <div>
          <p className="font-medium">{info.row.original.number}</p>
          <p className="text-xs text-muted-foreground">
            {orderTypeLabel(info.row.original.type)}
          </p>
        </div>
      ),
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
          <Button
            variant="ghost"
            size="xs"
            className="rounded-full"
            onClick={() => setPreviewOrder(info.row.original)}
          >
            <Eye className="size-3.5" />
            Vista previa
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
    <div className="space-y-6">
      <PageHeader
        title="Ventas / POS"
        description="Pantalla operativa de caja con búsqueda rápida, carrito y registro de ventas."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,420px)]">
        <section className="space-y-4">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Catálogo rápido</CardTitle>
              <CardDescription>
                Busca por nombre, categoría o favoritos. Selecciona un producto para abrir su
                configuración y agregarlo al carrito.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950">
                1. Elige un producto.
                {" "}
                2. Ajusta cantidad, variante u observaciones.
                {" "}
                3. Agrégalo al carrito.
                {" "}
                4. Completa el cobro y confirma la venta.
              </div>

              <div className="flex flex-col gap-3 md:flex-row">
                <Input
                  className="h-11 rounded-2xl"
                  placeholder="Buscar pizza, roll, bebida..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <Button
                  variant={favoritesOnly ? "default" : "outline"}
                  className="rounded-2xl"
                  onClick={toggleFavoritesOnly}
                >
                  <Star className="size-4" />
                  Favoritos
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant={!selectedCategoryId ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => handleCategorySelect(null)}
                >
                  Todas
                </Button>
                {visibleCategories.map((category) => (
                  <Button
                    key={category.id}
                    variant={selectedCategoryId === category.id ? "default" : "outline"}
                    className="rounded-full"
                    onClick={() => handleCategorySelect(category.id)}
                  >
                    {category.name}
                  </Button>
                ))}
              </div>

              {filteredProducts.length ? (
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

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {group.products.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            className="rounded-2xl border border-border/70 bg-muted/10 p-3 text-left transition hover:border-orange-400/40 hover:bg-orange-500/5"
                            onClick={() => setSelectedProduct(product)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-1 text-sm font-semibold">{product.name}</p>
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {product.description}
                                </p>
                              </div>
                              {product.isFavorite ? (
                                <Star className="mt-0.5 size-3.5 shrink-0 text-orange-500" />
                              ) : null}
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <span className="truncate text-xs text-muted-foreground">
                                {categoryMap.get(product.categoryId)?.name ?? "General"}
                              </span>
                              <span className="shrink-0 text-base font-semibold">
                                {formatCurrency(product.basePrice)}
                              </span>
                            </div>
                            <div className="mt-3">
                              <span className="inline-flex h-8 items-center justify-center rounded-xl bg-black px-3 text-xs font-semibold text-white">
                                Agregar
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
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Ventas recientes</CardTitle>
              <CardDescription>Historial del turno con opción de anulación.</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={orderColumns}
                data={orders.data ?? []}
                emptyTitle="Sin ventas registradas"
                emptyDescription="Las ventas confirmadas aparecerán aquí."
              />
            </CardContent>
          </Card>
        </section>

        <aside>
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Venta actual</CardTitle>
              <CardDescription>Agrega productos, revisa el total y confirma sin salir del flujo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Carrito
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {cart.length
                      ? `${cart.length} item${cart.length === 1 ? "" : "s"} listos para cobro`
                      : "Aun no agregas productos"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Total
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{formatCurrency(cartTotal)}</p>
                </div>
              </div>

              {cart.length ? (
                <div className="space-y-3">
                  <div className="max-h-[36vh] space-y-3 overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
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
                        <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          >
                            <Minus className="size-4" />
                          </Button>
                          <span className="w-8 text-center text-sm font-semibold">
                            {item.quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
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

                  <Button variant="outline" className="w-full rounded-2xl" onClick={clearCart}>
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

              <CheckoutPanel
                cart={cart}
                total={cartTotal}
                isPending={createOrder.isPending}
                onSubmit={async (values) => {
                  const printWindow = openPrintWindow();
                  const createdOrder = await createOrder.mutateAsync({ cart, payload: values });

                  if (printWindow) {
                    printOrderToWindow(printWindow, createdOrder, "ticket");
                  } else {
                    toast.error("El navegador bloqueó la impresión automática del ticket.");
                  }

                  clearCart();
                }}
              />
            </CardContent>
          </Card>
        </aside>
      </div>

      <ProductPickerDialog
        open={Boolean(selectedProduct)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedProduct(null);
          }
        }}
        product={selectedProduct}
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

          await cancelOrder.mutateAsync({
            orderId: cancelTarget.id,
            reason: values.reason,
          });
          setCancelTarget(null);
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
