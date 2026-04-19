import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { Product, ProductCategory, ProductFormData } from "@/types/domain";

const schema = z.object({
  categoryId: z.string().min(1, "Selecciona una categoría."),
  sortOrder: z.coerce.number().int().min(0, "Orden inválido."),
  name: z.string().min(3, "Ingresa un nombre válido."),
  description: z.string().min(5, "Ingresa una descripción."),
  basePrice: z.coerce.number().min(0, "Precio inválido."),
  cost: z.coerce.number().min(0, "Costo inválido."),
  status: z.enum(["activo", "inactivo"]),
  isFavorite: z.boolean(),
  tags: z.string().optional(),
  variants: z.string().optional(),
  modifiers: z.string().optional(),
});

type SubmitValues = z.output<typeof schema>;

function parseVariants(raw?: string) {
  return (raw ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [name, price, cost] = line.split("|");
      return {
        id: `${name.toLowerCase().replaceAll(" ", "-")}-${index}`,
        name: name.trim(),
        sku: `${name.toUpperCase().replaceAll(" ", "-")}-${index + 1}`,
        price: Number(price ?? 0),
        cost: Number(cost ?? 0),
        isDefault: index === 0,
      };
    });
}

function parseModifiers(raw?: string) {
  return (raw ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [name, priceDelta] = line.split("|");
      return {
        id: `${name.toLowerCase().replaceAll(" ", "-")}-${index}`,
        name: name.trim(),
        priceDelta: Number(priceDelta ?? 0),
      };
    });
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  categories,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  categories: ProductCategory[];
  onSubmit: (values: ProductFormData) => Promise<unknown>;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
  } = useForm<z.input<typeof schema>, unknown, SubmitValues>({
    resolver: zodResolver(schema),
    values: {
      categoryId: product?.categoryId ?? categories[0]?.id ?? "",
      sortOrder: product?.sortOrder ?? 0,
      name: product?.name ?? "",
      description: product?.description ?? "",
      basePrice: product?.basePrice ?? 0,
      cost: product?.cost ?? 0,
      status: product?.status ?? "activo",
      isFavorite: product?.isFavorite ?? false,
      tags: product?.tags.join(", ") ?? "",
      variants:
        product?.variants.map((variant) => `${variant.name}|${variant.price}|${variant.cost}`).join("\n") ??
        "",
      modifiers:
        product?.modifiers.map((modifier) => `${modifier.name}|${modifier.priceDelta}`).join("\n") ??
        "",
    },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      id: product?.id,
      categoryId: values.categoryId,
      sortOrder: values.sortOrder,
      name: values.name,
      description: values.description,
      basePrice: values.basePrice,
      cost: values.cost,
      status: values.status,
      isFavorite: values.isFavorite,
      tags:
        values.tags
          ?.split(",")
          .map((tag: string) => tag.trim())
          .filter(Boolean) ?? [],
      variants: parseVariants(values.variants),
      modifiers: parseModifiers(values.modifiers),
    });
    reset();
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          <DialogDescription>
            Catálogo preparado para productos simples, variantes y modificadores.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <div className="space-y-2">
            <Label>Categoría</Label>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-11 w-full rounded-2xl">
                    <SelectValue placeholder="Selecciona categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sortOrder">Orden en catálogo</Label>
            <Input id="sortOrder" type="number" min={0} className="h-11 rounded-2xl" {...register("sortOrder")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" className="h-11 rounded-2xl" {...register("name")} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea id="description" className="min-h-24 rounded-2xl" {...register("description")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="basePrice">Precio</Label>
            <Input id="basePrice" type="number" className="h-11 rounded-2xl" {...register("basePrice")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cost">Costo</Label>
            <Input id="cost" type="number" className="h-11 rounded-2xl" {...register("cost")} />
          </div>

          <div className="space-y-2">
            <Label>Estado</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-11 w-full rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="inactivo">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-border/70 px-4 py-3">
            <Controller
              control={control}
              name="isFavorite"
              render={({ field }) => (
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
            <div>
              <p className="text-sm font-medium">Marcar como favorito</p>
              <p className="text-xs text-muted-foreground">Aparece destacado en el POS.</p>
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="tags">Tags</Label>
            <Input id="tags" className="h-11 rounded-2xl" placeholder="pizza, premium, combo" {...register("tags")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="variants">Variantes</Label>
            <Textarea
              id="variants"
              className="min-h-32 rounded-2xl"
              placeholder={"Mediana|11990|5100\nFamiliar|15990|6700"}
              {...register("variants")}
            />
            <p className="text-xs text-muted-foreground">Formato: nombre|precio|costo, una por línea.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="modifiers">Modificadores</Label>
            <Textarea
              id="modifiers"
              className="min-h-32 rounded-2xl"
              placeholder={"Extra queso|1500\nSin cebolla|0"}
              {...register("modifiers")}
            />
            <p className="text-xs text-muted-foreground">Formato: nombre|delta precio, una por línea.</p>
          </div>

          <div className="md:col-span-2">
            <Button type="submit" className="h-11 w-full rounded-2xl" disabled={isPending}>
              {isPending ? "Guardando..." : product ? "Guardar cambios" : "Crear producto"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
