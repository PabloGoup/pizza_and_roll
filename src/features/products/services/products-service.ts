import { createAuditLog } from "@/lib/supabase/audit";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import type {
  AppUser,
  CategoryFormData,
  Product,
  ProductCategory,
  ProductFormData,
} from "@/types/domain";

type ProductRow = Database["public"]["Tables"]["products"]["Row"] & {
  product_variants?: Database["public"]["Tables"]["product_variants"]["Row"][];
  product_modifier_groups?: Array<
    Database["public"]["Tables"]["product_modifier_groups"]["Row"] & {
      product_modifiers?: Database["public"]["Tables"]["product_modifiers"]["Row"][];
    }
  >;
};

function mapProduct(row: ProductRow): Product {
  const variants = (row.product_variants ?? []).map((variant) => ({
    id: variant.id,
    name: variant.name,
    sku: variant.sku ?? "",
    price: variant.price,
    cost: variant.cost,
    isDefault: variant.is_default,
  }));

  const modifiers = (row.product_modifier_groups ?? []).flatMap((group) =>
    (group.product_modifiers ?? []).map((modifier) => ({
      id: modifier.id,
      name: modifier.name,
      priceDelta: modifier.price_delta,
      defaultIncluded: modifier.default_included,
    })),
  );

  return {
    id: row.id,
    categoryId: row.category_id,
    sortOrder: row.sort_order,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    basePrice: row.base_price,
    cost: row.cost,
    isFavorite: row.is_favorite,
    status: row.status,
    hasVariants: variants.length > 0,
    hasModifiers: modifiers.length > 0,
    variants,
    modifiers,
    tags: row.tags ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function fetchProducts() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("*, product_variants(*), product_modifier_groups(*, product_modifiers(*))")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error("No se pudo cargar el catálogo de productos.");
  }

  return (data as unknown as ProductRow[]).map(mapProduct);
}

async function fetchProductById(productId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("*, product_variants(*), product_modifier_groups(*, product_modifiers(*))")
    .eq("id", productId)
    .single();

  if (error) {
    throw new Error("No se pudo cargar el producto guardado.");
  }

  return mapProduct(data as unknown as ProductRow);
}

async function fetchCategoryById(categoryId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("product_categories")
    .select("*")
    .eq("id", categoryId)
    .single();

  if (error) {
    throw new Error("No se pudo cargar la categoría.");
  }

  return {
    id: data.id,
    name: data.name,
    color: data.color,
    sortOrder: data.sort_order,
  } satisfies ProductCategory;
}

export const productsService = {
  async listCategories() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("product_categories")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      throw new Error("No se pudieron cargar las categorías.");
    }

    return data.map(
      (row): ProductCategory => ({
        id: row.id,
        name: row.name,
        color: row.color,
        sortOrder: row.sort_order,
      }),
    );
  },

  async listProducts() {
    return fetchProducts();
  },

  async saveCategory(payload: CategoryFormData, actor: AppUser) {
    const supabase = getSupabaseClient();
    const existing = payload.id ? await fetchCategoryById(payload.id).catch(() => null) : null;

    const { data, error } = await supabase
      .from("product_categories")
      .upsert({
        id: payload.id,
        name: payload.name,
        color: payload.color,
        sort_order: payload.sortOrder,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error("No se pudo guardar la categoría.");
    }

    const savedCategory = {
      id: data.id,
      name: data.name,
      color: data.color,
      sortOrder: data.sort_order,
    } satisfies ProductCategory;

    await createAuditLog({
      module: "productos",
      action: payload.id ? "actualizar_categoria" : "crear_categoria",
      detail: `${payload.id ? "Actualización" : "Creación"} de la categoría ${savedCategory.name}`,
      actor,
      previousValue: existing,
      newValue: savedCategory,
    });

    return savedCategory;
  },

  async deleteCategory(categoryId: string, actor: AppUser) {
    const supabase = getSupabaseClient();
    const existing = await fetchCategoryById(categoryId);

    const { count, error: countError } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId);

    if (countError) {
      throw new Error("No se pudo validar la categoría antes de eliminar.");
    }

    if ((count ?? 0) > 0) {
      throw new Error("No puedes eliminar una categoría que todavía tiene productos asociados.");
    }

    const { error } = await supabase.from("product_categories").delete().eq("id", categoryId);

    if (error) {
      throw new Error("No se pudo eliminar la categoría.");
    }

    await createAuditLog({
      module: "productos",
      action: "eliminar_categoria",
      detail: `Eliminación de la categoría ${existing.name}`,
      actor,
      previousValue: existing,
      newValue: null,
    });
  },

  async saveProduct(payload: ProductFormData, actor: AppUser) {
    const supabase = getSupabaseClient();
    const existing = payload.id ? await fetchProductById(payload.id).catch(() => null) : null;

    const { data: productRow, error: productError } = await supabase
      .from("products")
      .upsert({
        id: payload.id,
        category_id: payload.categoryId,
        sort_order: payload.sortOrder,
        name: payload.name,
        description: payload.description,
        base_price: payload.basePrice,
        cost: payload.cost,
        is_favorite: payload.isFavorite,
        status: payload.status,
        tags: payload.tags,
      })
      .select("id")
      .single();

    if (productError) {
      throw new Error("No se pudo guardar el producto.");
    }

    const productId = productRow.id;

    const { data: existingVariants, error: existingVariantsError } = await supabase
      .from("product_variants")
      .select("*")
      .eq("product_id", productId);

    if (existingVariantsError) {
      throw new Error("No se pudieron leer las variantes del producto.");
    }

    if (payload.variants.length) {
      for (const [index, variant] of payload.variants.entries()) {
        const existingVariant = existingVariants.find(
          (entry) =>
            (variant.id && entry.id === variant.id) ||
            entry.name.toLowerCase() === variant.name.toLowerCase(),
        );

        if (existingVariant) {
          const { error: variantUpdateError } = await supabase
            .from("product_variants")
            .update({
              name: variant.name,
              sku: variant.sku || null,
              price: variant.price,
              cost: variant.cost,
              is_default: variant.isDefault ?? index === 0,
            })
            .eq("id", existingVariant.id);

          if (variantUpdateError) {
            throw new Error("No se pudieron guardar las variantes del producto.");
          }
        } else {
          const { error: variantInsertError } = await supabase
            .from("product_variants")
            .insert({
              id: variant.id || undefined,
              product_id: productId,
              name: variant.name,
              sku: variant.sku || null,
              price: variant.price,
              cost: variant.cost,
              is_default: variant.isDefault ?? index === 0,
            });

          if (variantInsertError) {
            throw new Error("No se pudieron guardar las variantes del producto.");
          }
        }
      }
    }

    const { data: existingGroups, error: groupsError } = await supabase
      .from("product_modifier_groups")
      .select("id")
      .eq("product_id", productId);

    if (groupsError) {
      throw new Error("No se pudieron leer los grupos de modificadores.");
    }

    const groupIds = existingGroups.map((group) => group.id);
    const { data: existingModifiers, error: existingModifiersError } = groupIds.length
      ? await supabase
          .from("product_modifiers")
          .select("*")
          .in("modifier_group_id", groupIds)
      : { data: [], error: null };

    if (existingModifiersError) {
      throw new Error("No se pudieron leer los modificadores del producto.");
    }

    if (payload.modifiers.length) {
      let modifierGroupId = existingGroups[0]?.id;

      if (modifierGroupId) {
        const { error: modifierGroupUpdateError } = await supabase
          .from("product_modifier_groups")
          .update({
            name: "Configuraciones",
            min_select: 0,
            max_select: payload.modifiers.length,
          })
          .eq("id", modifierGroupId);

        if (modifierGroupUpdateError) {
          throw new Error("No se pudo actualizar el grupo de modificadores.");
        }
      } else {
        const { data: modifierGroup, error: modifierGroupError } = await supabase
          .from("product_modifier_groups")
          .insert({
            product_id: productId,
            name: "Configuraciones",
            min_select: 0,
            max_select: payload.modifiers.length,
          })
          .select("id")
          .single();

        if (modifierGroupError) {
          throw new Error("No se pudo crear el grupo de modificadores.");
        }

        modifierGroupId = modifierGroup.id;
      }

      for (const modifier of payload.modifiers) {
        const existingModifier = (existingModifiers ?? []).find(
          (entry) =>
            (modifier.id && entry.id === modifier.id) ||
            entry.name.toLowerCase() === modifier.name.toLowerCase(),
        );

        if (existingModifier) {
          const { error: modifierUpdateError } = await supabase
            .from("product_modifiers")
            .update({
              name: modifier.name,
              price_delta: modifier.priceDelta,
              default_included: modifier.defaultIncluded ?? false,
            })
            .eq("id", existingModifier.id);

          if (modifierUpdateError) {
            throw new Error("No se pudieron guardar los modificadores.");
          }
        } else {
          const { error: modifierInsertError } = await supabase
            .from("product_modifiers")
            .insert({
              id: modifier.id || undefined,
              modifier_group_id: modifierGroupId,
              name: modifier.name,
              price_delta: modifier.priceDelta,
              default_included: modifier.defaultIncluded ?? false,
            });

          if (modifierInsertError) {
            throw new Error("No se pudieron guardar los modificadores.");
          }
        }
      }
    }

    const savedProduct = await fetchProductById(productId);

    await createAuditLog({
      module: "productos",
      action: payload.id ? "actualizar" : "crear",
      detail: `${payload.id ? "Actualización" : "Creación"} del producto ${savedProduct.name}`,
      actor,
      previousValue: existing,
      newValue: savedProduct,
    });

    return savedProduct;
  },

  async deleteProduct(productId: string, actor: AppUser) {
    const supabase = getSupabaseClient();
    const existing = await fetchProductById(productId);

    const { error } = await supabase
      .from("products")
      .update({
        status: "inactivo",
        is_favorite: false,
      })
      .eq("id", productId);

    if (error) {
      throw new Error("No se pudo eliminar el producto.");
    }

    const savedProduct = await fetchProductById(productId);

    await createAuditLog({
      module: "productos",
      action: "eliminar_producto",
      detail: `Desactivación del producto ${existing.name}`,
      actor,
      previousValue: existing,
      newValue: savedProduct,
    });

    return savedProduct;
  },
};
