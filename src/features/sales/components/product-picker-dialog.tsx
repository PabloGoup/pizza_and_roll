import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
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
import { buildManualProductModifiers, PRODUCT_CHANGE_OPTIONS } from "@/features/sales/lib/charges";
import type { Product, ProductSelectionPayload } from "@/types/domain";

const schema = z.object({
  quantity: z.coerce.number().min(1).max(20),
  variantId: z.string().optional(),
  notes: z.string().max(160).optional(),
  modifierIds: z.array(z.string()),
  change500: z.coerce.number().min(0).max(20),
  change1000: z.coerce.number().min(0).max(20),
  change1500: z.coerce.number().min(0).max(20),
  change2000: z.coerce.number().min(0).max(20),
});

type Values = z.input<typeof schema>;
type SubmitValues = z.output<typeof schema>;

export function ProductPickerDialog({
  open,
  onOpenChange,
  product,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onConfirm: (values: ProductSelectionPayload) => void;
}) {
  const defaultVariantId =
    product?.variants.find((variant) => variant.isDefault)?.id ??
    product?.variants[0]?.id ??
    undefined;

  const { control, register, handleSubmit, reset, watch } = useForm<
    Values,
    unknown,
    SubmitValues
  >({
    resolver: zodResolver(schema),
    values: {
      quantity: 1,
      variantId: defaultVariantId,
      notes: "",
      modifierIds: [],
      change500: 0,
      change1000: 0,
      change1500: 0,
      change2000: 0,
    },
  });

  const selectedModifiers = watch("modifierIds");
  const change500 = Number(watch("change500") ?? 0);
  const change1000 = Number(watch("change1000") ?? 0);
  const change1500 = Number(watch("change1500") ?? 0);
  const change2000 = Number(watch("change2000") ?? 0);
  const selectedManualModifiers = buildManualProductModifiers({
    change500,
    change1000,
    change1500,
    change2000,
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
        change2000: values.change2000,
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>{product.description}</DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          {product.variants.length ? (
            <div className="space-y-2">
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
              <Label>Modificadores</Label>
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

          <div className="space-y-3 rounded-2xl border border-border/70 p-4">
            <div>
              <Label>Cambios cobrados</Label>
              <p className="text-xs text-muted-foreground">
                Puedes sumar cambios cobrados ilimitados por producto.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {PRODUCT_CHANGE_OPTIONS.map((option) => (
                <div key={option.key} className="space-y-2">
                  <Label htmlFor={option.key}>{`+$${option.unitPrice.toLocaleString("es-CL")}`}</Label>
                  <Input
                    id={option.key}
                    type="number"
                    min={0}
                    max={20}
                    className="h-11 rounded-2xl"
                    {...register(option.key)}
                  />
                </div>
              ))}
            </div>
            {selectedManualModifiers.length ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                {selectedManualModifiers.map((modifier) => (
                  <p key={modifier.id}>
                    {modifier.name} · +${modifier.priceDelta.toLocaleString("es-CL")}
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-[120px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="quantity">Cantidad</Label>
              <Input id="quantity" type="number" min={1} max={20} className="h-11 rounded-2xl" {...register("quantity")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Observaciones</Label>
              <Textarea id="notes" className="min-h-24 rounded-2xl" placeholder="Ej. sin cebollín, salsa aparte" {...register("notes")} />
            </div>
          </div>

          <Button type="submit" className="h-11 w-full rounded-2xl">Agregar al carrito</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
