import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { productsService } from "@/features/products/services/products-service";
import type { AppUser, CategoryFormData, ProductFormData } from "@/types/domain";

const productKeys = {
  all: ["products"] as const,
  categories: ["products", "categories"] as const,
};

export function useProducts() {
  return useQuery({
    queryKey: productKeys.all,
    queryFn: productsService.listProducts,
  });
}

export function useProductCategories() {
  return useQuery({
    queryKey: productKeys.categories,
    queryFn: productsService.listCategories,
  });
}

export function useSaveProduct(actor: AppUser) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ProductFormData) => productsService.saveProduct(payload, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: productKeys.all });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useSaveCategory(actor: AppUser) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CategoryFormData) => productsService.saveCategory(payload, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: productKeys.categories });
      await queryClient.invalidateQueries({ queryKey: productKeys.all });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useDeleteCategory(actor: AppUser) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (categoryId: string) => productsService.deleteCategory(categoryId, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: productKeys.categories });
      await queryClient.invalidateQueries({ queryKey: productKeys.all });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useDeleteProduct(actor: AppUser) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) => productsService.deleteProduct(productId, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: productKeys.all });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}
