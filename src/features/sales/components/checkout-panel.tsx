import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CheckoutPayload, PosCartItem } from "@/types/domain";
import { formatCurrency } from "@/lib/format";
import {
  buildOrderExtraCharges,
  DISPATCH_FEE_OPTIONS,
  ORDER_EXTRA_OPTIONS,
  sumExtraCharges,
} from "@/features/sales/lib/charges";

const schema = z.object({
  type: z.enum(["consumo_local", "retiro_local", "despacho"]),
  paymentMethod: z.enum(["efectivo", "tarjeta", "transferencia", "mixto"]),
  discountAmount: z.coerce.number().min(0),
  promotionAmount: z.coerce.number().min(0),
  deliveryFee: z.coerce.number().min(0),
  extraSauce: z.coerce.number().min(0).max(20),
  ginger: z.coerce.number().min(0).max(20),
  wasabi: z.coerce.number().min(0).max(20),
  chopsticksHelp: z.coerce.number().min(0).max(20),
  cash: z.coerce.number().min(0),
  card: z.coerce.number().min(0),
  transfer: z.coerce.number().min(0),
  notes: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  addressLabel: z.string().optional(),
  addressStreet: z.string().optional(),
  addressDistrict: z.string().optional(),
  addressReference: z.string().optional(),
});

type Values = z.input<typeof schema>;
type SubmitValues = z.output<typeof schema>;

export function CheckoutPanel({
  cart,
  total,
  onSubmit,
  isPending,
}: {
  cart: PosCartItem[];
  total: number;
  onSubmit: (values: CheckoutPayload) => Promise<unknown>;
  isPending: boolean;
}) {
  const { register, control, handleSubmit, watch, reset } = useForm<
    Values,
    unknown,
    SubmitValues
  >({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "consumo_local",
      paymentMethod: "efectivo",
      discountAmount: 0,
      promotionAmount: 0,
      deliveryFee: 0,
      extraSauce: 0,
      ginger: 0,
      wasabi: 0,
      chopsticksHelp: 0,
      cash: total,
      card: 0,
      transfer: 0,
      notes: "",
      customerName: "",
      customerPhone: "",
      addressLabel: "Casa",
      addressStreet: "",
      addressDistrict: "",
      addressReference: "",
    },
  });

  const orderType = watch("type");
  const paymentMethod = watch("paymentMethod");
  const discountAmount = Number(watch("discountAmount") ?? 0);
  const promotionAmount = Number(watch("promotionAmount") ?? 0);
  const deliveryFee = Number(watch("deliveryFee") ?? 0);
  const extraSauce = Number(watch("extraSauce") ?? 0);
  const ginger = Number(watch("ginger") ?? 0);
  const wasabi = Number(watch("wasabi") ?? 0);
  const chopsticksHelp = Number(watch("chopsticksHelp") ?? 0);

  const extraCharges = buildOrderExtraCharges({
    extraSauce,
    ginger,
    wasabi,
    chopsticksHelp,
  });
  const extrasTotal = sumExtraCharges(extraCharges);
  const effectiveDeliveryFee = orderType === "despacho" ? deliveryFee : 0;
  const finalTotal = total + effectiveDeliveryFee + extrasTotal - discountAmount - promotionAmount;

  const submit = handleSubmit(async (values) => {
    const extraCharges = buildOrderExtraCharges({
      extraSauce: values.extraSauce,
      ginger: values.ginger,
      wasabi: values.wasabi,
      chopsticksHelp: values.chopsticksHelp,
    });
    const extrasTotal = sumExtraCharges(extraCharges);
    const effectiveDeliveryFee = values.type === "despacho" ? values.deliveryFee : 0;
    const orderTotal =
      total + effectiveDeliveryFee + extrasTotal - values.discountAmount - values.promotionAmount;

    if (orderTotal < 0) {
      throw new Error("El total final no puede ser negativo.");
    }

    const breakdown =
      values.paymentMethod === "efectivo"
        ? { cash: orderTotal, card: 0, transfer: 0 }
        : values.paymentMethod === "tarjeta"
          ? { cash: 0, card: orderTotal, transfer: 0 }
          : values.paymentMethod === "transferencia"
            ? { cash: 0, card: 0, transfer: orderTotal }
            : { cash: values.cash, card: values.card, transfer: values.transfer };

    if (values.paymentMethod === "mixto") {
      const mixedTotal = breakdown.cash + breakdown.card + breakdown.transfer;

      if (mixedTotal !== orderTotal) {
        throw new Error("El pago mixto debe cuadrar con el total final.");
      }
    }

    await onSubmit({
      type: values.type,
      paymentMethod: values.paymentMethod,
      paymentBreakdown: breakdown,
      discountAmount: values.discountAmount,
      promotionAmount: values.promotionAmount,
      deliveryFee: effectiveDeliveryFee,
      extraCharges,
      notes: values.notes,
      customerName: values.customerName,
      customerPhone: values.customerPhone,
      addressLabel: values.addressLabel,
      addressStreet: values.addressStreet,
      addressDistrict: values.addressDistrict,
      addressReference: values.addressReference,
    });

    reset({
      type: "consumo_local",
      paymentMethod: "efectivo",
      discountAmount: 0,
      promotionAmount: 0,
      deliveryFee: 0,
      extraSauce: 0,
      ginger: 0,
      wasabi: 0,
      chopsticksHelp: 0,
      cash: total,
      card: 0,
      transfer: 0,
      notes: "",
      customerName: "",
      customerPhone: "",
      addressLabel: "Casa",
      addressStreet: "",
      addressDistrict: "",
      addressReference: "",
    });
  });

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Cobro
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Define el tipo de pedido y cierra la venta.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Items
          </p>
          <p className="mt-1 text-lg font-semibold">{cart.length}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Tipo de pedido</Label>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-11 w-full rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consumo_local">Consumo en local</SelectItem>
                  <SelectItem value="retiro_local">Retiro en local</SelectItem>
                  <SelectItem value="despacho">Despacho</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-2">
          <Label>Medio de pago</Label>
          <Controller
            control={control}
            name="paymentMethod"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-11 w-full rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="mixto">Mixto</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      {orderType !== "consumo_local" ? (
        <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/10 p-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customerName">Cliente</Label>
            <Input id="customerName" className="h-11 rounded-2xl" {...register("customerName")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerPhone">Teléfono</Label>
            <Input id="customerPhone" className="h-11 rounded-2xl" {...register("customerPhone")} />
          </div>
        </div>
      ) : null}

      {orderType === "despacho" ? (
        <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/10 p-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Tarifa despacho</Label>
            <Controller
              control={control}
              name="deliveryFee"
              render={({ field }) => (
                <Select
                  value={String(field.value)}
                  onValueChange={(value) => field.onChange(Number(value))}
                >
                  <SelectTrigger className="h-11 w-full rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPATCH_FEE_OPTIONS.map((amount) => (
                      <SelectItem key={amount} value={String(amount)}>
                        {formatCurrency(amount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="addressLabel">Etiqueta</Label>
            <Input id="addressLabel" className="h-11 rounded-2xl" {...register("addressLabel")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="addressDistrict">Comuna</Label>
            <Input id="addressDistrict" className="h-11 rounded-2xl" {...register("addressDistrict")} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="addressStreet">Dirección</Label>
            <Input id="addressStreet" className="h-11 rounded-2xl" {...register("addressStreet")} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="addressReference">Referencia</Label>
            <Input id="addressReference" className="h-11 rounded-2xl" {...register("addressReference")} />
          </div>
        </div>
      ) : null}

      <details className="rounded-2xl border border-border/70 bg-muted/10">
        <summary className="cursor-pointer list-none px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Extras y descuentos</p>
              <p className="text-xs text-muted-foreground">
                Salsas y ajustes manuales del pedido.
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Ajustes
              </p>
              <p className="text-sm font-semibold">
                {formatCurrency(extrasTotal - discountAmount - promotionAmount)}
              </p>
            </div>
          </div>
        </summary>

        <div className="border-t border-border/70 px-4 py-3">
          <div className="grid grid-cols-2 gap-3">
            {ORDER_EXTRA_OPTIONS.map((option) => (
              <div key={option.key} className="space-y-2">
                <Label htmlFor={option.key} className="text-sm leading-tight">
                  {option.label}
                  {" "}
                  ({formatCurrency(option.unitPrice)})
                </Label>
                <Input
                  id={option.key}
                  type="number"
                  min={0}
                  max={20}
                  className="h-10 rounded-2xl"
                  {...register(option.key)}
                />
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="discountAmount">Descuento</Label>
              <Input
                id="discountAmount"
                type="number"
                min={0}
                className="h-11 rounded-2xl"
                {...register("discountAmount")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promotionAmount">Promoción manual</Label>
              <Input
                id="promotionAmount"
                type="number"
                min={0}
                className="h-11 rounded-2xl"
                {...register("promotionAmount")}
              />
            </div>
          </div>
        </div>
      </details>

      {paymentMethod === "mixto" ? (
        <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/10 p-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="cash">Efectivo</Label>
            <Input id="cash" type="number" min={0} className="h-11 rounded-2xl" {...register("cash")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="card">Tarjeta</Label>
            <Input id="card" type="number" min={0} className="h-11 rounded-2xl" {...register("card")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transfer">Transferencia</Label>
            <Input id="transfer" type="number" min={0} className="h-11 rounded-2xl" {...register("transfer")} />
          </div>
        </div>
      ) : null}

      <details className="rounded-2xl border border-border/70 bg-muted/10">
        <summary className="cursor-pointer list-none px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Observaciones</p>
              <p className="text-xs text-muted-foreground">Notas internas del pedido.</p>
            </div>
            <p className="text-xs text-muted-foreground">Opcional</p>
          </div>
        </summary>
        <div className="border-t border-border/70 px-4 py-3">
          <Textarea
            id="notes"
            className="min-h-16 rounded-2xl"
            placeholder="Notas del pedido"
            {...register("notes")}
          />
        </div>
      </details>

      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
        <div className="grid gap-2 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Productos</span>
            <span>{formatCurrency(total)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Despacho</span>
            <span>{formatCurrency(effectiveDeliveryFee)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Adicionales</span>
            <span>{formatCurrency(extrasTotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Descuento</span>
            <span>-{formatCurrency(discountAmount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Promoción</span>
            <span>-{formatCurrency(promotionAmount)}</span>
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3 border-t border-border/70 pt-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Total a cobrar
            </p>
            <p className="mt-1 text-3xl font-semibold">{formatCurrency(finalTotal)}</p>
          </div>
          <p className="text-right text-xs text-muted-foreground">
            Confirma cuando el carrito y el medio de pago estén correctos.
          </p>
        </div>
      </div>

      <Button
        type="submit"
        className="h-12 w-full rounded-2xl text-sm font-semibold"
        disabled={isPending || !cart.length}
      >
        {isPending ? "Registrando venta..." : "Confirmar venta"}
      </Button>
    </form>
  );
}
