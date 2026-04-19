import { createColumnHelper, type HeaderContext } from "@tanstack/react-table";
import { ArrowUpDown, FolderTree, Plus, Star, Tag, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { LoadingState } from "@/components/common/loading-state";
import { MetricCard } from "@/components/common/metric-card";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/data-table/data-table";
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
import { CategoryManagerDialog } from "@/features/products/components/category-manager-dialog";
import { ProductFormDialog } from "@/features/products/components/product-form-dialog";
import {
  useDeleteCategory,
  useDeleteProduct,
  useProductCategories,
  useProducts,
  useSaveCategory,
  useSaveProduct,
} from "@/features/products/hooks/use-products";
import { formatCurrency } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import type { Product } from "@/types/domain";

const columnHelper = createColumnHelper<Product>();

function SortableHeader<TData, TValue>({
  column,
  label,
  align = "left",
}: HeaderContext<TData, TValue> & { label: string; align?: "left" | "right" }) {
  return (
    <Button
      variant="ghost"
      size="xs"
      className={align === "right" ? "ml-auto flex" : "-ml-2 flex"}
      onClick={column.getToggleSortingHandler()}
    >
      {label}
      <ArrowUpDown className="size-3.5" />
    </Button>
  );
}

export function ProductsPage() {
  const currentUser = useAuthStore((state) => state.currentUser)!;
  const products = useProducts();
  const categories = useProductCategories();
  const saveProduct = useSaveProduct(currentUser);
  const saveCategory = useSaveCategory(currentUser);
  const deleteCategory = useDeleteCategory(currentUser);
  const deleteProduct = useDeleteProduct(currentUser);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const rows = useMemo(() => {
    const categoryOrder = new Map((categories.data ?? []).map((category) => [category.id, category.sortOrder]));

    return [...(products.data ?? [])].sort((left, right) => {
      const categoryDelta =
        (categoryOrder.get(left.categoryId) ?? 999) - (categoryOrder.get(right.categoryId) ?? 999);

      if (categoryDelta !== 0) {
        return categoryDelta;
      }

      const productDelta = left.sortOrder - right.sortOrder;

      if (productDelta !== 0) {
        return productDelta;
      }

      return left.name.localeCompare(right.name, "es");
    });
  }, [categories.data, products.data]);
  const categoryRows = categories.data ?? [];
  const productCountByCategory = rows.reduce<Record<string, number>>((acc, product) => {
    acc[product.categoryId] = (acc[product.categoryId] ?? 0) + 1;
    return acc;
  }, {});
  const metrics = {
    total: rows.length,
    active: rows.filter((product) => product.status === "activo").length,
    favorites: rows.filter((product) => product.isFavorite).length,
    categories: categoryRows.length,
    averagePrice: rows.length
      ? Math.round(rows.reduce((total, product) => total + product.basePrice, 0) / rows.length)
      : 0,
  };

  const columns = [
    columnHelper.accessor("name", {
      header: (context) => <SortableHeader {...context} label="Producto" />,
      cell: (info) => (
        <div className="max-w-[18rem] min-w-[14rem] whitespace-normal">
          <p className="line-clamp-1 font-medium">{info.row.original.name}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {info.row.original.description}
          </p>
          {info.row.original.hasVariants || info.row.original.hasModifiers ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {info.row.original.hasVariants
                ? `${info.row.original.variants.length} variante${info.row.original.variants.length > 1 ? "s" : ""}`
                : null}
              {info.row.original.hasVariants && info.row.original.hasModifiers ? " · " : null}
              {info.row.original.hasModifiers
                ? `${info.row.original.modifiers.length} modificador${info.row.original.modifiers.length > 1 ? "es" : ""}`
                : null}
            </p>
          ) : null}
        </div>
      ),
    }),
    columnHelper.accessor(
      (row) =>
        categories.data?.find((category) => category.id === row.categoryId)?.name ?? "Sin categoría",
      {
        id: "category",
        header: (context) => <SortableHeader {...context} label="Categoría" />,
        cell: (info) => <div className="min-w-[8rem] text-sm">{info.getValue()}</div>,
      },
    ),
    columnHelper.accessor("sortOrder", {
      header: (context) => <SortableHeader {...context} label="Orden" align="right" />,
      cell: (info) => <div className="min-w-[4.5rem] text-right font-medium">{info.getValue()}</div>,
    }),
    columnHelper.accessor("basePrice", {
      header: (context) => <SortableHeader {...context} label="Precio" align="right" />,
      cell: (info) => (
        <div className="min-w-[6.5rem] text-right font-medium">{formatCurrency(info.getValue())}</div>
      ),
    }),
    columnHelper.accessor("cost", {
      header: (context) => <SortableHeader {...context} label="Costo" align="right" />,
      cell: (info) => (
        <div className="min-w-[6.5rem] text-right text-muted-foreground">
          {formatCurrency(info.getValue())}
        </div>
      ),
    }),
    columnHelper.accessor("isFavorite", {
      header: (context) => <SortableHeader {...context} label="Favorito POS" />,
      cell: (info) => (
        <div className="min-w-[7rem]">
          {info.getValue() ? (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <Star className="size-3.5 fill-current" />
              Favorito
            </span>
          ) : (
            <span className="text-muted-foreground">Normal</span>
          )}
        </div>
      ),
      sortingFn: (rowA, rowB, columnId) => {
        const a = rowA.getValue<boolean>(columnId) ? 1 : 0;
        const b = rowB.getValue<boolean>(columnId) ? 1 : 0;
        return a - b;
      },
    }),
    columnHelper.accessor("status", {
      header: (context) => <SortableHeader {...context} label="Estado" />,
      cell: (info) => (
        <div className="min-w-[6.5rem]">
          <StatusBadge
            label={info.getValue() === "activo" ? "Activo" : "Inactivo"}
            tone={info.getValue() === "activo" ? "success" : "warning"}
          />
        </div>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      enableSorting: false,
      cell: (info) => (
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <Button
            variant="outline"
            size="xs"
            className="rounded-full"
            onClick={() => {
              setSelectedProduct(info.row.original);
              setDialogOpen(true);
            }}
          >
            Editar
          </Button>
          <Button
            variant="outline"
            size="xs"
            className="rounded-full"
            onClick={() => setDeleteTarget(info.row.original)}
          >
            <Trash2 className="size-3.5" />
            Eliminar
          </Button>
        </div>
      ),
    }),
  ];

  if (products.isLoading || categories.isLoading) {
    return <LoadingState label="Cargando catálogo de productos..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productos"
        description="CRUD inicial del catálogo con categorías, variantes, modificadores y favoritos del POS."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setCategoryDialogOpen(true)}
            >
              <FolderTree className="size-4" />
              Categorías
            </Button>
            <Button
              className="rounded-full"
              disabled={!categoryRows.length}
              onClick={() => {
                setSelectedProduct(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="size-4" />
              Nuevo producto
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Catálogo"
          value={metrics.total.toString()}
          hint="Productos registrados"
          icon={<Tag className="size-4" />}
        />
        <MetricCard
          label="Activos"
          value={metrics.active.toString()}
          hint="Disponibles en venta"
          icon={<Tag className="size-4" />}
        />
        <MetricCard
          label="Favoritos"
          value={metrics.favorites.toString()}
          hint="Destacados en POS"
          icon={<Tag className="size-4" />}
        />
        <MetricCard
          label="Categorías"
          value={metrics.categories.toString()}
          hint="Secciones del catálogo"
          icon={<FolderTree className="size-4" />}
        />
        <MetricCard
          label="Precio promedio"
          value={formatCurrency(metrics.averagePrice)}
          hint="Referencia del catálogo"
          icon={<Tag className="size-4" />}
        />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        emptyTitle="Sin productos cargados"
        emptyDescription="Crea el primer producto para habilitar ventas en el POS."
      />

      <ProductFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={selectedProduct}
        categories={categoryRows}
        isPending={saveProduct.isPending}
        onSubmit={async (values) => {
          await saveProduct.mutateAsync(values);
        }}
      />

      <CategoryManagerDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        categories={categoryRows}
        productCountByCategory={productCountByCategory}
        isSaving={saveCategory.isPending}
        isDeleting={deleteCategory.isPending}
        onSave={async (values) => {
          await saveCategory.mutateAsync(values);
        }}
        onDelete={async (categoryId) => {
          await deleteCategory.mutateAsync(categoryId);
        }}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar producto</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción dejará el producto
              {" "}
              <strong>{deleteTarget?.name}</strong>
              {" "}
              como inactivo para que no siga apareciendo en ventas. Se conserva el historial de
              pedidos anteriores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProduct.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteProduct.isPending || !deleteTarget}
              onClick={async () => {
                if (!deleteTarget) {
                  return;
                }

                await deleteProduct.mutateAsync(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              {deleteProduct.isPending ? "Eliminando..." : "Eliminar producto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
