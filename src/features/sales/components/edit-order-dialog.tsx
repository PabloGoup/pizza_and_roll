import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ProductPickerDialog } from "@/features/sales/components/product-picker-dialog";
import { formatCurrency } from "@/lib/format";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Order,
  PaymentMethod,
  PosCartItem,
  Product,
  ProductCategory,
  ProductSelectionPayload,
  UpdateOrderPayload,
} from "@/types/domain";

function getItemTotal(item: PosCartItem) {
  return (
    (item.unitPrice + item.modifiers.reduce((sum, modifier) => sum + modifier.priceDelta, 0)) *
    item.quantity
  );
}

function buildSinglePaymentBreakdown(paymentMethod: Exclude<PaymentMethod, "mixto">, total: number) {
  if (paymentMethod === "efectivo") {
    return { cash: total, card: 0, transfer: 0 };
  }

  if (paymentMethod === "tarjeta") {
    return { cash: 0, card: total, transfer: 0 };
  }

  return { cash: 0, card: 0, transfer: total };
}

export function EditOrderDialog({
  open,
  onOpenChange,
  order,
  products,
  categories,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  products: Product[];
  categories: ProductCategory[];
  onSubmit: (values: UpdateOrderPayload) => Promise<unknown>;
  isPending: boolean;
}) {
  const [draftItems, setDraftItems] = useState<PosCartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [cashAmount, setCashAmount] = useState("0");
  const [cardAmount, setCardAmount] = useState("0");
  const [transferAmount, setTransferAmount] = useState("0");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [productToAdd, setProductToAdd] = useState<Product | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const activeProducts = useMemo(
    () => products.filter((product) => product.status === "activo"),
    [products],
  );
  const selectableCategories = useMemo(() => {
    const categoryIdsWithProducts = new Set(activeProducts.map((product) => product.categoryId));

    return categories
      .filter((category) => categoryIdsWithProducts.has(category.id))
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "es"),
      );
  }, [activeProducts, categories]);
  const selectableProducts = useMemo(() => {
    return activeProducts
      .filter((product) => (selectedCategoryId ? product.categoryId === selectedCategoryId : false))
      .sort((left, right) => {
        const leftCategory = categoriesById.get(left.categoryId);
        const rightCategory = categoriesById.get(right.categoryId);

        return (
          (leftCategory?.sortOrder ?? 0) - (rightCategory?.sortOrder ?? 0) ||
          left.sortOrder - right.sortOrder ||
          left.name.localeCompare(right.name, "es")
        );
      });
  }, [activeProducts, categoriesById, selectedCategoryId]);

  useEffect(() => {
    if (!order) {
      return;
    }

    const mappedItems = order.items.map<PosCartItem>((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      categoryName: item.categoryName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      notes: item.notes ?? "",
      variantId: item.variantId,
      variantName: item.variantName,
      modifiers: item.modifiers,
    }));

    setDraftItems(mappedItems);
    setPaymentMethod(order.paymentMethod);
    setCashAmount(String(order.paymentBreakdown.cash ?? 0));
    setCardAmount(String(order.paymentBreakdown.card ?? 0));
    setTransferAmount(String(order.paymentBreakdown.transfer ?? 0));
    setSelectedCategoryId("");
    setSelectedProductId("");
    setEditingItemId(null);
    setProductToAdd(null);
  }, [order]);

  const extrasTotal = order?.extraCharges.reduce((total, charge) => total + charge.total, 0) ?? 0;
  const itemsSubtotal = draftItems.reduce((total, item) => total + getItemTotal(item), 0);
  const finalTotal =
    itemsSubtotal +
    (order?.deliveryFee ?? 0) +
    extrasTotal -
    (order?.discountAmount ?? 0) -
    (order?.promotionAmount ?? 0);

  const mixedTotal =
    Number(cashAmount || 0) + Number(cardAmount || 0) + Number(transferAmount || 0);
  const selectedCategory =
    selectableCategories.find((category) => category.id === selectedCategoryId) ?? null;
  const selectedProduct =
    selectableProducts.find((product) => product.id === selectedProductId) ?? null;
  const editingItem =
    (editingItemId ? draftItems.find((item) => item.id === editingItemId) : null) ?? null;
  const pickerInitialSelection: Partial<ProductSelectionPayload> | null =
    productToAdd && editingItem && editingItem.productId === productToAdd.id
      ? {
          productId: productToAdd.id,
          quantity: editingItem.quantity,
          notes: editingItem.notes,
          variantId: editingItem.variantId,
          modifierIds: editingItem.modifiers
            .filter((modifier) => productToAdd.modifiers.some((entry) => entry.id === modifier.id))
            .map((modifier) => modifier.id),
          manualModifiers: editingItem.modifiers.filter(
            (modifier) => !productToAdd.modifiers.some((entry) => entry.id === modifier.id),
          ),
        }
      : null;

  function updateDraftItem(itemId: string, updater: (item: PosCartItem) => PosCartItem) {
    setDraftItems((currentItems) =>
      currentItems.map((item) => (item.id === itemId ? updater(item) : item)),
    );
  }

  function openExistingItemConfigurator(item: PosCartItem) {
    const product = activeProducts.find((entry) => entry.id === item.productId);

    if (!product) {
      toast.error("No se pudo abrir el configurador del producto.");
      return;
    }

    setEditingItemId(item.id);
    setProductToAdd(product);
  }

  async function submit() {
    if (!order) {
      return;
    }

    if (!draftItems.length) {
      throw new Error("La venta debe mantener al menos un producto.");
    }

    const sanitizedItems = draftItems.map((item) => ({
      ...item,
      quantity: Math.max(1, Number(item.quantity || 1)),
      unitPrice: Math.max(0, Number(item.unitPrice || 0)),
      notes: item.notes ?? "",
    }));

    const paymentBreakdown =
      paymentMethod === "mixto"
        ? {
            cash: Number(cashAmount || 0),
            card: Number(cardAmount || 0),
            transfer: Number(transferAmount || 0),
          }
        : buildSinglePaymentBreakdown(paymentMethod, finalTotal);

    if (paymentMethod === "mixto" && mixedTotal !== finalTotal) {
      throw new Error("El pago mixto debe cuadrar exactamente con el total actualizado.");
    }

    await onSubmit({
      items: sanitizedItems,
      paymentMethod,
      paymentBreakdown,
    });

    onOpenChange(false);
  }

  if (!order) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-[960px] xl:max-w-[1120px]">
          <DialogHeader>
            <div className="border-b border-border/70 px-6 pt-6 pb-4">
              <DialogTitle>Editar venta {order.number}</DialogTitle>
              <DialogDescription>
                Ajusta productos, precios y cobro. Cada cambio quedará registrado en auditoría.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="max-h-[calc(92vh-96px)] space-y-4 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 rounded-2xl border border-border/70 bg-muted/10 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium">Agregar producto</p>
                  <p className="text-xs text-muted-foreground">
                    Elige categoría, luego producto, y después configura cantidad, cambios y
                    observaciones.
                  </p>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)_220px]">
                  <Select
                    value={selectedCategoryId || undefined}
                    onValueChange={(value) => {
                      setSelectedCategoryId(value ?? "");
                      setSelectedProductId("");
                    }}
                  >
                    <SelectTrigger className="h-11 min-w-0 rounded-2xl">
                      <SelectValue placeholder="Selecciona categoría">
                        {selectedCategory?.name ?? "Selecciona categoría"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {selectableCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={selectedProductId || undefined}
                    onValueChange={(value) => setSelectedProductId(value ?? "")}
                    disabled={!selectedCategoryId}
                  >
                    <SelectTrigger className="h-11 min-w-0 rounded-2xl">
                      <SelectValue
                        placeholder={
                          selectedCategoryId
                            ? "Selecciona un producto"
                            : "Primero elige una categoría"
                        }
                      >
                        {selectedProduct?.name ??
                          (selectedCategoryId
                            ? "Selecciona un producto"
                            : "Primero elige una categoría")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {selectableProducts.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    className="rounded-2xl"
                    disabled={!selectedProduct}
                    onClick={() => setProductToAdd(selectedProduct)}
                  >
                    <Plus className="size-4" />
                    Configurar producto
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Productos</span>
                    <span>{formatCurrency(itemsSubtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Despacho</span>
                    <span>{formatCurrency(order.deliveryFee)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Adicionales</span>
                    <span>{formatCurrency(extrasTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Descuento</span>
                    <span>-{formatCurrency(order.discountAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Promoción</span>
                    <span>-{formatCurrency(order.promotionAmount)}</span>
                  </div>
                </div>
                <div className="mt-3 border-t border-border/70 pt-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Total actualizado
                  </p>
                  <p className="mt-1 text-3xl font-semibold">{formatCurrency(finalTotal)}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {draftItems.length ? (
                draftItems.map((item) => (
                  <div
                    key={item.id}
                    className="space-y-3 rounded-2xl border border-border/70 bg-muted/10 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.variantName ?? item.categoryName}
                        </p>
                        {item.modifiers.length ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.modifiers.map((modifier) => modifier.name).join(", ")}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 self-start">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-2xl"
                          onClick={() => openExistingItemConfigurator(item)}
                        >
                          Editar cambios
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setDraftItems((currentItems) =>
                              currentItems.filter((currentItem) => currentItem.id !== item.id),
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Cantidad</Label>
                        <Input
                          type="number"
                          min={1}
                          className="h-11 rounded-2xl"
                          value={item.quantity}
                          onChange={(event) =>
                            updateDraftItem(item.id, (currentItem) => ({
                              ...currentItem,
                              quantity: Math.max(1, Number(event.target.value || 1)),
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Precio unitario</Label>
                        <Input
                          type="number"
                          min={0}
                          className="h-11 rounded-2xl"
                          value={item.unitPrice}
                          onChange={(event) =>
                            updateDraftItem(item.id, (currentItem) => ({
                              ...currentItem,
                              unitPrice: Math.max(0, Number(event.target.value || 0)),
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Observaciones</Label>
                      <Input
                        className="h-11 rounded-2xl"
                        value={item.notes}
                        onChange={(event) =>
                          updateDraftItem(item.id, (currentItem) => ({
                            ...currentItem,
                            notes: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-background px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">Total línea</span>
                        <span className="text-base font-semibold">
                          {formatCurrency(getItemTotal(item))}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                  No quedan productos en la venta. Agrega al menos uno para guardar cambios.
                </div>
              )}
            </div>

            <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/10 p-4 lg:grid-cols-[240px_minmax(0,1fr)]">
              <div className="space-y-2">
                <Label>Medio de pago</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
                >
                  <SelectTrigger className="h-11 rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="mixto">Mixto</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === "mixto" ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Efectivo</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-11 rounded-2xl"
                      value={cashAmount}
                      onChange={(event) => setCashAmount(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tarjeta</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-11 rounded-2xl"
                      value={cardAmount}
                      onChange={(event) => setCardAmount(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Transferencia</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-11 rounded-2xl"
                      value={transferAmount}
                      onChange={(event) => setTransferAmount(event.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm text-muted-foreground">
                  El total actualizado se asignará completo a {paymentMethod}.
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-border/70 pt-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm text-muted-foreground lg:max-w-[70%]">
                {paymentMethod === "mixto"
                  ? `Pago mixto actual: ${formatCurrency(mixedTotal)} de ${formatCurrency(finalTotal)}`
                  : "Los cambios quedarán registrados en ventas, caja y auditoría."}
              </div>
              <Button
                type="button"
                className="rounded-2xl lg:min-w-[220px]"
                disabled={isPending || !draftItems.length}
                onClick={() => {
                  void submit().catch((error) => {
                    toast.error(
                      error instanceof Error ? error.message : "No se pudo editar la venta.",
                    );
                  });
                }}
              >
                {isPending ? "Guardando cambios..." : "Guardar edición"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ProductPickerDialog
        open={Boolean(productToAdd)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setProductToAdd(null);
            setEditingItemId(null);
          }
        }}
        product={productToAdd}
        initialSelection={pickerInitialSelection}
        submitLabel={editingItemId ? "Aplicar cambios" : "Agregar al carrito"}
        onConfirm={(selection) => {
          const product = activeProducts.find((entry) => entry.id === selection.productId);

          if (!product) {
            return;
          }

          const variant = product.variants.find((entry) => entry.id === selection.variantId);
          const selectedProductModifiers = product.modifiers.filter((modifier) =>
            selection.modifierIds.includes(modifier.id),
          );

          const nextDraftItem: PosCartItem = {
            id: editingItemId ?? crypto.randomUUID(),
            productId: product.id,
            productName: product.name,
            categoryName: categoryNameById.get(product.categoryId) ?? "General",
            quantity: selection.quantity,
            unitPrice: variant?.price ?? product.basePrice,
            notes: selection.notes ?? "",
            variantId: variant?.id,
            variantName: variant?.name,
            modifiers: [
              ...selectedProductModifiers.map((modifier) => ({
                id: modifier.id,
                name: modifier.name,
                priceDelta: modifier.priceDelta,
              })),
              ...selection.manualModifiers,
            ],
          };

          setDraftItems((currentItems) =>
            editingItemId
              ? currentItems.map((item) => (item.id === editingItemId ? nextDraftItem : item))
              : [...currentItems, nextDraftItem],
          );
          setProductToAdd(null);
          setEditingItemId(null);
          setSelectedProductId("");
        }}
      />
    </>
  );
}
