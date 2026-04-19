import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import type { CategoryFormData, ProductCategory } from "@/types/domain";

const schema = z.object({
  name: z.string().min(2, "Ingresa un nombre válido."),
  color: z.string().min(4, "Ingresa un color válido."),
  sortOrder: z.coerce.number().int().min(0, "Orden inválido."),
});

type SubmitValues = z.output<typeof schema>;

export function CategoryManagerDialog({
  open,
  onOpenChange,
  categories,
  productCountByCategory,
  isSaving,
  isDeleting,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ProductCategory[];
  productCountByCategory: Record<string, number>;
  isSaving: boolean;
  isDeleting: boolean;
  onSave: (values: CategoryFormData) => Promise<unknown>;
  onDelete: (categoryId: string) => Promise<unknown>;
}) {
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(null);

  const defaultSortOrder = useMemo(
    () => (categories.length ? Math.max(...categories.map((category) => category.sortOrder)) + 1 : 1),
    [categories],
  );

  const { register, handleSubmit, reset } = useForm<
    z.input<typeof schema>,
    unknown,
    SubmitValues
  >({
    resolver: zodResolver(schema),
    values: {
      name: selectedCategory?.name ?? "",
      color: selectedCategory?.color ?? "#f97316",
      sortOrder: selectedCategory?.sortOrder ?? defaultSortOrder,
    },
  });

  useEffect(() => {
    if (!open) {
      setSelectedCategory(null);
      setDeleteTarget(null);
      reset({
        name: "",
        color: "#f97316",
        sortOrder: defaultSortOrder,
      });
    }
  }, [defaultSortOrder, open, reset]);

  const submit = handleSubmit(async (values) => {
    await onSave({
      id: selectedCategory?.id,
      name: values.name,
      color: values.color,
      sortOrder: values.sortOrder,
    });

    setSelectedCategory(null);
    reset({
      name: "",
      color: "#f97316",
      sortOrder: defaultSortOrder,
    });
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gestionar categorías</DialogTitle>
            <DialogDescription>
              Solo el administrador puede crear, editar y eliminar categorías. Las categorías con
              productos asociados no se pueden eliminar.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <form className="space-y-4 rounded-3xl border border-border/70 p-5" onSubmit={submit}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-medium">
                    {selectedCategory ? "Editar categoría" : "Nueva categoría"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Define el nombre, color y orden del catálogo.
                  </p>
                </div>
                {selectedCategory ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="rounded-full"
                    onClick={() => {
                      setSelectedCategory(null);
                      reset({
                        name: "",
                        color: "#f97316",
                        sortOrder: defaultSortOrder,
                      });
                    }}
                  >
                    <Plus className="size-3.5" />
                    Nueva
                  </Button>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="category-name">Nombre</Label>
                <Input id="category-name" className="h-11 rounded-2xl" {...register("name")} />
              </div>

              <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-2">
                  <Label htmlFor="category-color">Color</Label>
                  <Input
                    id="category-color"
                    className="h-11 rounded-2xl"
                    placeholder="#f97316"
                    {...register("color")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category-order">Orden</Label>
                  <Input
                    id="category-order"
                    type="number"
                    className="h-11 rounded-2xl"
                    {...register("sortOrder")}
                  />
                </div>
              </div>

              <Button type="submit" className="h-11 w-full rounded-2xl" disabled={isSaving}>
                {isSaving
                  ? "Guardando..."
                  : selectedCategory
                    ? "Guardar categoría"
                    : "Crear categoría"}
              </Button>
            </form>

            <div className="rounded-3xl border border-border/70 p-5">
              <div className="mb-4">
                <h3 className="font-medium">Categorías actuales</h3>
                <p className="text-sm text-muted-foreground">
                  Puedes editar cualquier categoría. Eliminar solo está disponible cuando no tenga
                  productos asociados.
                </p>
              </div>

              <div className="space-y-3">
                {categories.map((category) => {
                  const productCount = productCountByCategory[category.id] ?? 0;

                  return (
                    <div
                      key={category.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/20 p-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <span
                            className="size-3 rounded-full border border-border/50"
                            style={{ backgroundColor: category.color }}
                          />
                          <p className="font-medium">{category.name}</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Orden {category.sortOrder} · {productCount} producto
                          {productCount === 1 ? "" : "s"}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="rounded-full"
                          onClick={() => setSelectedCategory(category)}
                        >
                          <Pencil className="size-3.5" />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="rounded-full"
                          disabled={productCount > 0 || isDeleting}
                          onClick={() => setDeleteTarget(category)}
                        >
                          <Trash2 className="size-3.5" />
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar categoría</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la categoría
              {" "}
              <strong>{deleteTarget?.name}</strong>
              {" "}
              solo si no tiene productos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting || !deleteTarget}
              onClick={async () => {
                if (!deleteTarget) {
                  return;
                }

                await onDelete(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              {isDeleting ? "Eliminando..." : "Eliminar categoría"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
