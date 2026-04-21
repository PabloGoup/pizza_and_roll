import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import {
  buildManualProductModifiers,
  PRODUCT_CHANGE_OPTIONS,
} from "@/features/sales/lib/charges";
import type { Product, ProductSelectionPayload } from "@/types/domain";

const CHANGE_QUANTITY_OPTIONS = [
  { value: "0", label: "No agregar" },
  { value: "1", label: "1 agregado / cambio" },
  { value: "2", label: "2 agregados / cambios" },
  { value: "3", label: "3 agregados / cambios" },
  { value: "4", label: "4 agregados / cambios" },
] as const;

const schema = z.object({
  quantity: z.coerce.number().min(1).max(20),
  variantId: z.string().optional(),
  notes: z.string().max(160).optional(),
  modifierIds: z.array(z.string()),
  change500: z.coerce.number().min(0).max(20),
  change1000: z.coerce.number().min(0).max(20),
  change1500: z.coerce.number().min(0).max(20),
});

type Values = z.input<typeof schema>;
type SubmitValues = z.output<typeof schema>;

function buildInitialChangeCounts(
  manualModifiers: ProductSelectionPayload["manualModifiers"] = [],
): Pick<SubmitValues, "change500" | "change1000" | "change1500"> {
  return PRODUCT_CHANGE_OPTIONS.reduce(
    (accumulator, option) => {
      const totalQuantity = manualModifiers.reduce((sum, modifier) => {
        const nameMatches = modifier.name.startsWith(option.label);

        if (!nameMatches || modifier.priceDelta <= 0) {
          return sum;
        }

        const quantityFromName = Number(/x(\d+)/i.exec(modifier.name)?.[1] ?? 0);
        const derivedQuantity =
          quantityFromName || Math.max(1, Math.round(modifier.priceDelta / option.unitPrice));

        return sum + derivedQuantity;
      }, 0);

      return {
        ...accumulator,
        [option.key]: totalQuantity,
      };
    },
    {
      change500: 0,
      change1000: 0,
      change1500: 0,
    },
  );
}

export function ProductPickerDialog({
  open,
  onOpenChange,
  product,
  onConfirm,
  initialSelection,
  submitLabel = "Agregar al carrito",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onConfirm: (values: ProductSelectionPayload) => void;
  initialSelection?: Partial<ProductSelectionPayload> | null;
  submitLabel?: string;
}) {
  const defaultVariantId =
    product?.variants.find((variant) => variant.isDefault)?.id ??
    product?.variants[0]?.id ??
    undefined;
  const initialChangeCounts = buildInitialChangeCounts(initialSelection?.manualModifiers);

  const { control, register, handleSubmit, reset } = useForm<
    Values,
    unknown,
    SubmitValues
  >({
    resolver: zodResolver(schema),
    values: {
      quantity: initialSelection?.quantity ?? 1,
      variantId: initialSelection?.variantId ?? defaultVariantId,
      notes: initialSelection?.notes ?? "",
      modifierIds: initialSelection?.modifierIds ?? [],
      change500: initialChangeCounts.change500,
      change1000: initialChangeCounts.change1000,
      change1500: initialChangeCounts.change1500,
    },
  });

  const selectedModifiers = useWatch({ control, name: "modifierIds" }) ?? [];
  const change500 = Number(useWatch({ control, name: "change500" }) ?? 0);
  const change1000 = Number(useWatch({ control, name: "change1000" }) ?? 0);
  const change1500 = Number(useWatch({ control, name: "change1500" }) ?? 0);
  const selectedManualModifiers = buildManualProductModifiers({
    change500,
    change1000,
    change1500,
  });

  const submit = handleSubmit((values) => {
    if (!product) {
      return;
    }

    onConfirm({
      productId: product.id,
      quantity: values.quantity,
      notes: values.notes,
      variantId: values.variantId,
      modifierIds: values.modifierIds,
      manualModifiers: buildManualProductModifiers({
        change500: values.change500,
        change1000: values.change1000,
        change1500: values.change1500,
      }),
    });
    reset();
    onOpenChange(false);
  });

  if (!product) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-[960px]">
        <div className="flex max-h-[92vh] flex-col">
          <DialogHeader className="border-b border-border/70 px-4 py-4 pr-12 sm:px-6">
            <DialogTitle className="text-lg sm:text-xl">{product.name}</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              {product.description}
            </DialogDescription>
          </DialogHeader>

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                <div className="space-y-4">
                  {product.variants.length ? (
                    <div className="space-y-2 rounded-2xl border border-border/70 p-4">
                      <Label>Variante</Label>
                      <Controller
                        control={control}
                        name="variantId"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className="h-11 w-full rounded-2xl">
                              <SelectValue placeholder="Selecciona una variante" />
                            </SelectTrigger>
                            <SelectContent>
                              {product.variants.map((variant) => (
                                <SelectItem key={variant.id} value={variant.id}>
                                  {variant.name} · ${variant.price.toLocaleString("es-CL")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  ) : null}

                  {product.modifiers.length ? (
                    <div className="space-y-3 rounded-2xl border border-border/70 p-4">
                      <div>
                        <Label>Modificadores del producto</Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Selecciona aquí cambios directos disponibles para este producto.
                        </p>
                      </div>
                      <div className="space-y-3">
                        {product.modifiers.map((modifier) => (
                          <div key={modifier.id} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <Controller
                                control={control}
                                name="modifierIds"
                                render={({ field }) => (
                                  <Checkbox
                                    checked={field.value.includes(modifier.id)}
                                    onCheckedChange={(checked) => {
                                      const nextValue = checked
                                        ? [...field.value, modifier.id]
                                        : field.value.filter((item: string) => item !== modifier.id);
                                      field.onChange(nextValue);
                                    }}
                                  />
                                )}
                              />
                              <span className="text-sm">{modifier.name}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {modifier.priceDelta > 0
                                ? `+${modifier.priceDelta.toLocaleString("es-CL")}`
                                : "Sin costo"}
                            </span>
                          </div>
                        ))}
                      </div>
                      {selectedModifiers.length ? (
                        <p className="text-xs text-muted-foreground">
                          {selectedModifiers.length} modificador(es) aplicado(s)
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="space-y-2 rounded-2xl border border-border/70 p-4">
                    <Label htmlFor="quantity">Cantidad</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min={1}
                      max={20}
                      className="h-11 rounded-2xl"
                      {...register("quantity")}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-3 rounded-2xl border border-border/70 p-4">
                    <div>
                      <Label>Cambios y agregados cobrados</Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Elige desde aquí los cambios cobrados de sushi. En escritorio se muestran
                        en una columna ancha y en móvil se apilan para que no se corten.
                      </p>
                    </div>
                    <div className="grid gap-3 xl:grid-cols-2">
                      {PRODUCT_CHANGE_OPTIONS.map((option) => (
                        <div
                          key={option.key}
                          className="grid gap-3 rounded-2xl border border-border/70 bg-muted/10 p-3"
                        >
                          <div className="space-y-1">
                            <Label className="text-sm leading-5">{option.label}</Label>
                            <p className="text-xs text-muted-foreground">
                              {option.description}
                            </p>
                          </div>
                          <Controller
                            control={control}
                            name={option.key}
                            render={({ field }) => (
                              <Select
                                value={String(field.value ?? 0)}
                                onValueChange={(value) => field.onChange(Number(value))}
                              >
                                <SelectTrigger className="h-11 w-full rounded-2xl">
                                  <SelectValue placeholder="Selecciona una opción" />
                                </SelectTrigger>
                                <SelectContent>
                                  {CHANGE_QUANTITY_OPTIONS.map((quantityOption) => (
                                    <SelectItem key={quantityOption.value} value={quantityOption.value}>
                                      {quantityOption.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                          <p className="text-xs font-medium text-muted-foreground">
                            {`Se cobra +$${option.unitPrice.toLocaleString("es-CL")} por cada unidad.`}
                          </p>
                        </div>
                      ))}
                    </div>
                    {selectedManualModifiers.length ? (
                      <div className="space-y-1 rounded-2xl bg-muted/10 p-3 text-xs text-muted-foreground">
                        {selectedManualModifiers.map((modifier) => (
                          <p key={modifier.id}>
                            {modifier.name} · +${modifier.priceDelta.toLocaleString("es-CL")}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2 rounded-2xl border border-border/70 p-4">
                    <Label htmlFor="notes">Observaciones del pedido</Label>
                    <p className="text-xs text-muted-foreground">
                      Especifica aquí las indicaciones para que el pedido salga claro: cambios,
                      salsas, cortes, retiro o cualquier detalle importante.
                    </p>
                    <Textarea
                      id="notes"
                      className="min-h-32 rounded-2xl"
                      placeholder="Ej. cambiar por pollo, sin cebollín, salsa aparte, bien especificado"
                      {...register("notes")}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-border/70 bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
              <Button type="submit" className="h-11 w-full rounded-2xl">
                {submitLabel}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
