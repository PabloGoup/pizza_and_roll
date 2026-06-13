import { AlertTriangle, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useOperationalAvailability,
  useSetIngredientAvailability,
  useSetProductAvailability,
} from "@/features/availability/hooks/use-availability";

export function AvailabilityDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const availability = useOperationalAvailability(open);
  const setProduct = useSetProductAvailability();
  const setIngredient = useSetIngredientAvailability();
  const normalized = search.trim().toLowerCase();
  const products = useMemo(
    () =>
      (availability.data?.products ?? []).filter((item) =>
        `${item.name} ${item.categoryName}`.toLowerCase().includes(normalized),
      ),
    [availability.data?.products, normalized],
  );
  const ingredients = useMemo(
    () =>
      (availability.data?.ingredients ?? []).filter((item) =>
        item.name.toLowerCase().includes(normalized),
      ),
    [availability.data?.ingredients, normalized],
  );

  async function toggleProduct(id: string, isSoldOut: boolean) {
    try {
      await setProduct.mutateAsync({ id, isSoldOut });
      toast.success(isSoldOut ? "Producto marcado como agotado." : "Producto repuesto.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar.");
    }
  }

  async function toggleIngredient(id: string, isSoldOut: boolean) {
    try {
      await setIngredient.mutateAsync({ id, isSoldOut });
      toast.success(isSoldOut ? "Ingrediente marcado como agotado." : "Ingrediente repuesto.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Disponibilidad operativa</DialogTitle>
          <DialogDescription>
            Los cambios se reflejan en caja, tienda web y WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar producto o ingrediente"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Tabs defaultValue="products" className="min-h-0">
          <TabsList>
            <TabsTrigger value="products">Productos</TabsTrigger>
            <TabsTrigger value="ingredients">Ingredientes</TabsTrigger>
          </TabsList>
          <TabsContent value="products" className="max-h-[56vh] space-y-2 overflow-y-auto pr-1">
            {products.map((product) => (
              <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div>
                  <p className={product.isSoldOut ? "font-medium line-through text-muted-foreground" : "font-medium"}>
                    {product.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{product.categoryName}</p>
                </div>
                <Button
                  variant={product.isSoldOut ? "outline" : "destructive"}
                  size="sm"
                  disabled={setProduct.isPending}
                  onClick={() => toggleProduct(product.id, !product.isSoldOut)}
                >
                  {product.isSoldOut ? "Reponer" : "Agotar"}
                </Button>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="ingredients" className="max-h-[56vh] space-y-2 overflow-y-auto pr-1">
            {ingredients.map((ingredient) => (
              <div key={ingredient.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={ingredient.isSoldOut ? "font-medium line-through text-muted-foreground" : "font-medium"}>
                      {ingredient.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{ingredient.unit}</p>
                  </div>
                  <Button
                    variant={ingredient.isSoldOut ? "outline" : "destructive"}
                    size="sm"
                    disabled={setIngredient.isPending}
                    onClick={() => toggleIngredient(ingredient.id, !ingredient.isSoldOut)}
                  >
                    {ingredient.isSoldOut ? "Reponer" : "Agotar"}
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ingredient.affectedProducts.length ? (
                    ingredient.affectedProducts.map((product) => (
                      <Badge key={product.id} variant="secondary">{product.name}</Badge>
                    ))
                  ) : (
                    <p className="flex items-center gap-1 text-xs text-amber-700">
                      <AlertTriangle className="size-3.5" />
                      Sin productos vinculados en recetas.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
        {availability.isLoading ? <p className="text-sm text-muted-foreground">Cargando...</p> : null}
        {availability.isError ? <p className="text-sm text-destructive">No se pudo cargar la disponibilidad.</p> : null}
      </DialogContent>
    </Dialog>
  );
}
