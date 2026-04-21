import { Minus, Plus, ReceiptText, ShoppingBasket, Sparkles, Trash2, Truck } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { getStorefrontCartItemTotal } from "@/features/storefront/lib/storefront-cart";
import type { StorefrontCustomerProfile } from "@/features/storefront/services/storefront-order-service";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DeliveryZone, PaymentMethod, PosCartItem } from "@/types/domain";

type StorefrontOrderMode = "retiro_local" | "despacho";

type CheckoutValues = {
  fullName: string;
  phone: string;
  addressLabel: string;
  addressStreet: string;
  addressDistrict: string;
  addressReference: string;
  notes: string;
  paymentMethod: PaymentMethod;
};

export function StorefrontCheckoutSheet({
  open,
  onOpenChange,
  orderMode,
  onOrderModeChange,
  cart,
  subtotal,
  deliveryZones,
  customerDraft,
  onCustomerDraftChange,
  onIncreaseQuantity,
  onDecreaseQuantity,
  onRemoveItem,
  onSubmitOrder,
  onOpenRecommendedProduct,
  customerProfile,
  isProfileLoading,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderMode: StorefrontOrderMode;
  onOrderModeChange: (mode: StorefrontOrderMode) => void;
  cart: PosCartItem[];
  subtotal: number;
  deliveryZones: DeliveryZone[];
  customerDraft: {
    fullName: string;
    phone: string;
    addressLabel: string;
    addressStreet: string;
    addressDistrict: string;
    addressReference: string;
    notes: string;
  };
  onCustomerDraftChange: (draft: Partial<{
    fullName: string;
    phone: string;
    addressLabel: string;
    addressStreet: string;
    addressDistrict: string;
    addressReference: string;
    notes: string;
  }>) => void;
  onIncreaseQuantity: (itemId: string) => void;
  onDecreaseQuantity: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onSubmitOrder: (values: {
    customerName: string;
    customerPhone: string;
    addressLabel?: string;
    addressStreet?: string;
    addressDistrict?: string;
    addressReference?: string;
    notes?: string;
    paymentMethod: PaymentMethod;
    deliveryFee: number;
  }) => Promise<void>;
  onOpenRecommendedProduct: (productId: string) => void;
  customerProfile: StorefrontCustomerProfile | null | undefined;
  isProfileLoading: boolean;
  isSubmitting: boolean;
}) {
  const form = useForm<CheckoutValues>({
    defaultValues: {
      fullName: customerDraft.fullName,
      phone: customerDraft.phone,
      addressLabel: customerDraft.addressLabel,
      addressStreet: customerDraft.addressStreet,
      addressDistrict: customerDraft.addressDistrict,
      addressReference: customerDraft.addressReference,
      notes: customerDraft.notes,
      paymentMethod: "transferencia",
    },
  });

  useEffect(() => {
    form.reset({
      fullName: customerDraft.fullName,
      phone: customerDraft.phone,
      addressLabel: customerDraft.addressLabel,
      addressStreet: customerDraft.addressStreet,
      addressDistrict: customerDraft.addressDistrict,
      addressReference: customerDraft.addressReference,
      notes: customerDraft.notes,
      paymentMethod: form.getValues("paymentMethod"),
    });
  }, [
    customerDraft.addressDistrict,
    customerDraft.addressLabel,
    customerDraft.addressReference,
    customerDraft.addressStreet,
    customerDraft.fullName,
    customerDraft.notes,
    customerDraft.phone,
    form,
  ]);

  const watchValues = useWatch({ control: form.control });
  const paymentMethod = watchValues.paymentMethod;

  useEffect(() => {
    onCustomerDraftChange({
      fullName: watchValues.fullName ?? "",
      phone: watchValues.phone ?? "",
      addressLabel: watchValues.addressLabel ?? "",
      addressStreet: watchValues.addressStreet ?? "",
      addressDistrict: watchValues.addressDistrict ?? "",
      addressReference: watchValues.addressReference ?? "",
      notes: watchValues.notes ?? "",
    });
  }, [
    onCustomerDraftChange,
    watchValues.addressDistrict,
    watchValues.addressLabel,
    watchValues.addressReference,
    watchValues.addressStreet,
    watchValues.fullName,
    watchValues.notes,
    watchValues.phone,
  ]);

  useEffect(() => {
    if (!customerProfile?.customer) {
      return;
    }

    const defaultAddress = customerProfile.addresses.find((address) => address.isDefault) ?? customerProfile.addresses[0];

    if (!form.getValues("fullName")) {
      form.setValue("fullName", customerProfile.customer.fullName);
    }

    if (!form.getValues("phone")) {
      form.setValue("phone", customerProfile.customer.phone);
    }

    if (defaultAddress) {
      if (!form.getValues("addressLabel")) {
        form.setValue("addressLabel", defaultAddress.label);
      }

      if (!form.getValues("addressStreet")) {
        form.setValue("addressStreet", defaultAddress.street);
      }

      if (!form.getValues("addressDistrict")) {
        form.setValue("addressDistrict", defaultAddress.district);
      }

      if (!form.getValues("addressReference")) {
        form.setValue("addressReference", defaultAddress.reference ?? "");
      }
    }
  }, [customerProfile, form]);

  const selectedZone = useMemo(
    () =>
      deliveryZones.find(
        (zone) =>
          zone.district.toLowerCase() === (watchValues.addressDistrict ?? "").trim().toLowerCase(),
      ) ?? null,
    [deliveryZones, watchValues.addressDistrict],
  );

  const deliveryFee = orderMode === "despacho" ? selectedZone?.fee ?? 0 : 0;
  const finalTotal = subtotal + deliveryFee;

  const submit = form.handleSubmit(async (values) => {
    await onSubmitOrder({
      customerName: values.fullName,
      customerPhone: values.phone,
      addressLabel: orderMode === "despacho" ? values.addressLabel : undefined,
      addressStreet: orderMode === "despacho" ? values.addressStreet : undefined,
      addressDistrict: orderMode === "despacho" ? values.addressDistrict : undefined,
      addressReference: orderMode === "despacho" ? values.addressReference : undefined,
      notes: values.notes,
      paymentMethod: values.paymentMethod,
      deliveryFee,
    });
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-[560px] overflow-y-auto border-white/10 bg-[#1f1d23] p-0 text-white sm:max-w-[560px]"
      >
        <SheetHeader className="border-b border-white/10 px-5 py-5">
          <SheetTitle className="text-xl font-semibold text-white">
            Carrito y checkout
          </SheetTitle>
          <SheetDescription className="text-zinc-400">
            Personaliza, identifica al cliente y convierte el pedido en una venta web dentro del mismo flujo.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onOrderModeChange("retiro_local")}
              className={cn(
                "rounded-[22px] border px-4 py-3 text-left transition-all",
                orderMode === "retiro_local"
                  ? "border-transparent text-white shadow-[0_16px_36px_rgba(255,43,23,0.2)]"
                  : "border-white/10 bg-white/5 text-zinc-300",
              )}
              style={orderMode === "retiro_local" ? { backgroundColor: "#ff2b17" } : undefined}
            >
              <p className="text-sm font-semibold">Retiro</p>
              <p className="mt-1 text-xs text-inherit/80">Listo para pasar a cocina y retiro local.</p>
            </button>
            <button
              type="button"
              onClick={() => onOrderModeChange("despacho")}
              className={cn(
                "rounded-[22px] border px-4 py-3 text-left transition-all",
                orderMode === "despacho"
                  ? "border-transparent text-white shadow-[0_16px_36px_rgba(255,43,23,0.2)]"
                  : "border-white/10 bg-white/5 text-zinc-300",
              )}
              style={orderMode === "despacho" ? { backgroundColor: "#ff2b17" } : undefined}
            >
              <p className="text-sm font-semibold">Despacho</p>
              <p className="mt-1 text-xs text-inherit/80">Usa la zona configurada y guarda dirección.</p>
            </button>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Resumen del pedido</p>
                <p className="text-xs text-zinc-400">{cart.length} producto(s) en el carrito</p>
              </div>
              <Badge className="rounded-full border-0 bg-[#ff2b17] px-3 py-1 text-white">
                {formatCurrency(finalTotal)}
              </Badge>
            </div>

            {cart.length ? (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[24px] border border-white/8 bg-[#2c2831] p-4 shadow-[0_10px_28px_rgba(0,0,0,0.16)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="rounded-full border-0 bg-[#ff2b17] px-2.5 py-1 text-[11px] text-white">
                            {item.categoryName}
                          </Badge>
                          <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-medium text-zinc-200">
                            {formatCurrency(item.unitPrice)}
                          </span>
                        </div>
                        <p className="mt-2 text-base font-semibold text-white">{item.productName}</p>
                        {item.variantName ? (
                          <p className="mt-1 text-xs text-zinc-400">Variante: {item.variantName}</p>
                        ) : null}
                        {item.modifiers.length ? (
                          <p className="mt-1 text-xs text-zinc-400">
                            {item.modifiers.map((modifier) => modifier.name).join(" · ")}
                          </p>
                        ) : null}
                        {item.notes ? (
                          <p className="mt-1 text-xs text-zinc-500">{item.notes}</p>
                        ) : null}
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-semibold text-white">
                          {formatCurrency(getStorefrontCartItemTotal(item))}
                        </p>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.id)}
                          className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-rose-300"
                        >
                          <Trash2 className="size-3.5" />
                          Quitar
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/8 pt-3">
                      <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 p-1">
                        <button
                          type="button"
                          onClick={() => onDecreaseQuantity(item.id)}
                          className="inline-flex size-8 items-center justify-center rounded-full text-zinc-200 transition-colors hover:bg-white/10"
                        >
                          <Minus className="size-4" />
                        </button>
                        <span className="min-w-8 text-center text-sm font-semibold text-white">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onIncreaseQuantity(item.id)}
                          className="inline-flex size-8 items-center justify-center rounded-full text-zinc-200 transition-colors hover:bg-white/10"
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>

                      <span className="text-xs text-zinc-400">Cantidad editable desde la tienda</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/4 p-6 text-center">
                <ShoppingBasket className="mx-auto size-8 text-zinc-500" />
                <p className="mt-3 text-sm font-medium text-white">Tu carrito todavía está vacío</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Agrega productos desde la carta y vuelve aquí para cerrar la venta online.
                </p>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-[28px] border border-white/8 bg-[#2a272f] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Datos del cliente</p>
                <p className="text-xs text-zinc-400">
                  El teléfono funciona como identidad pública para historial y recomendaciones.
                </p>
              </div>
              {isProfileLoading ? (
                <span className="text-xs text-zinc-400">Buscando historial...</span>
              ) : customerProfile?.customer ? (
                <Badge className="rounded-full border-0 bg-emerald-500/15 px-3 py-1 text-emerald-200">
                  Perfil encontrado
                </Badge>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="storefront-fullname" className="text-xs font-medium text-zinc-300">
                  Nombre
                </label>
                <Input
                  id="storefront-fullname"
                  className="h-11 rounded-2xl border-white/10 bg-[#1f1d23] text-white placeholder:text-zinc-500"
                  placeholder="Nombre del cliente"
                  {...form.register("fullName")}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="storefront-phone" className="text-xs font-medium text-zinc-300">
                  Teléfono
                </label>
                <Input
                  id="storefront-phone"
                  className="h-11 rounded-2xl border-white/10 bg-[#1f1d23] text-white placeholder:text-zinc-500"
                  placeholder="+56 9 ..."
                  {...form.register("phone")}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {(["transferencia", "efectivo", "tarjeta"] as PaymentMethod[]).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => form.setValue("paymentMethod", method)}
                  className={cn(
                    "rounded-full border px-4 py-1 text-xs font-medium transition-colors",
                    paymentMethod === method
                      ? "border-transparent text-white"
                      : "border-white/10 bg-white/5 text-zinc-300",
                  )}
                  style={paymentMethod === method ? { backgroundColor: "#ff2b17" } : undefined}
                >
                  {method === "transferencia"
                    ? "Transferencia"
                    : method === "efectivo"
                      ? "Efectivo"
                      : "Tarjeta"}
                </button>
              ))}
            </div>

            {orderMode === "despacho" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="storefront-address-label" className="text-xs font-medium text-zinc-300">
                    Etiqueta
                  </label>
                  <Input
                    id="storefront-address-label"
                    className="h-11 rounded-2xl border-white/10 bg-[#1f1d23] text-white placeholder:text-zinc-500"
                    placeholder="Casa / Oficina"
                    {...form.register("addressLabel")}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="storefront-address-district" className="text-xs font-medium text-zinc-300">
                    Comuna
                  </label>
                  <Input
                    id="storefront-address-district"
                    list="storefront-delivery-zones"
                    className="h-11 rounded-2xl border-white/10 bg-[#1f1d23] text-white placeholder:text-zinc-500"
                    placeholder="Selecciona o escribe una comuna"
                    {...form.register("addressDistrict")}
                  />
                  <datalist id="storefront-delivery-zones">
                    {deliveryZones.map((zone) => (
                      <option key={zone.id} value={zone.district}>
                        {zone.name}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="storefront-address-street" className="text-xs font-medium text-zinc-300">
                    Dirección
                  </label>
                  <Input
                    id="storefront-address-street"
                    className="h-11 rounded-2xl border-white/10 bg-[#1f1d23] text-white placeholder:text-zinc-500"
                    placeholder="Calle, número y detalle"
                    {...form.register("addressStreet")}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="storefront-address-reference" className="text-xs font-medium text-zinc-300">
                    Referencia
                  </label>
                  <Textarea
                    id="storefront-address-reference"
                    className="min-h-[88px] rounded-[20px] border-white/10 bg-[#1f1d23] text-white placeholder:text-zinc-500"
                    placeholder="Ej: portón negro, depto 42, al lado de..."
                    {...form.register("addressReference")}
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <label htmlFor="storefront-notes" className="text-xs font-medium text-zinc-300">
                Notas del pedido
              </label>
              <Textarea
                id="storefront-notes"
                className="min-h-[88px] rounded-[20px] border-white/10 bg-[#1f1d23] text-white placeholder:text-zinc-500"
                placeholder="Indicaciones de retiro, salsa, timbre o comentario general."
                {...form.register("notes")}
              />
            </div>
          </section>

          {customerProfile?.customer ? (
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="rounded-[28px] border border-white/8 bg-[#2a272f] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <ReceiptText className="size-4 text-[#ff2b17]" />
                  Historial reciente
                </div>
                <div className="mt-3 space-y-3">
                  {customerProfile.recentOrders.length ? (
                    customerProfile.recentOrders.map((order) => (
                      <div key={order.id} className="rounded-[20px] bg-white/5 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-white">{order.number}</p>
                          <span className="text-xs text-zinc-400">{formatCurrency(order.total)}</span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">{formatDateTime(order.createdAt)}</p>
                        <p className="mt-2 text-xs leading-5 text-zinc-300">
                          {order.itemsSummary.join(" · ")}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-400">Todavía no hay compras anteriores registradas.</p>
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/8 bg-[#2a272f] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Sparkles className="size-4 text-[#ff2b17]" />
                  Recomendaciones
                </div>
                <div className="mt-3 space-y-2">
                  {customerProfile.recommendedProducts.length ? (
                    customerProfile.recommendedProducts.map((product) => (
                      <button
                        key={product.productId}
                        type="button"
                        onClick={() => onOpenRecommendedProduct(product.productId)}
                        className="flex w-full items-center justify-between gap-3 rounded-[18px] bg-white/5 px-3 py-3 text-left transition-colors hover:bg-white/8"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{product.productName}</p>
                          <p className="text-xs text-zinc-400">
                            {product.categoryName} · {product.orderCount} compra(s)
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-medium text-zinc-200">
                          {formatCurrency(product.unitPrice)}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-400">
                      Las recomendaciones aparecerán cuando el cliente acumule compras.
                    </p>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          <section className="rounded-[28px] border border-white/8 bg-[#2a272f] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Totales</p>
                <p className="text-xs text-zinc-400">
                  El pedido entra a ventas con origen web y queda listo para seguimiento operativo.
                </p>
              </div>
              {orderMode === "despacho" ? (
                <Badge className="rounded-full border-0 bg-emerald-500/15 px-3 py-1 text-emerald-200">
                  <Truck className="size-3.5" />
                  {selectedZone ? selectedZone.name : "Sin zona detectada"}
                </Badge>
              ) : null}
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between text-zinc-300">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-300">
                <span>Despacho</span>
                <span>{formatCurrency(deliveryFee)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-white/8 pt-3 text-base font-semibold text-white">
                <span>Total</span>
                <span>{formatCurrency(finalTotal)}</span>
              </div>
            </div>

            <Button
              type="button"
              onClick={() => void submit()}
              disabled={isSubmitting || !cart.length}
              className="mt-4 h-12 w-full rounded-full bg-[#ff2b17] text-white hover:bg-[#ff2b17]/90"
            >
              {isSubmitting ? "Registrando pedido..." : "Pasar a venta"}
            </Button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
