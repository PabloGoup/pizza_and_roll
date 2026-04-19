import { calculateItemsSubtotal, getCashAmountFromBreakdown } from "@/lib/business";
import { createAuditLog } from "@/lib/supabase/audit";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatSupabaseError, isUuid } from "@/lib/supabase/errors";
import type { Database } from "@/types/database";
import type {
  AppUser,
  CheckoutPayload,
  Customer,
  CustomerAddress,
  Order,
  OrderExtraCharge,
  PosCartItem,
} from "@/types/domain";

type OrderQueryRow = {
  id: string;
  number: string;
  type: Order["type"];
  status: Order["status"];
  payment_method: Order["paymentMethod"];
  subtotal: number;
  discount_amount: number;
  promotion_amount: number;
  delivery_fee: number;
  extra_charges: OrderExtraCharge[] | null;
  total: number;
  notes: string | null;
  cashier_id: string;
  customer_id: string | null;
  delivery_address_id: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string } | null;
  customers?: {
    id: string;
    full_name: string;
    phone: string;
    customer_addresses?: Array<{
      id: string;
      label: string;
      street: string;
      district: string;
      reference: string | null;
      is_default: boolean;
    }>;
  } | null;
  customer_addresses?: {
    id: string;
    label: string;
    street: string;
    district: string;
    reference: string | null;
    is_default: boolean;
  } | null;
  order_payments?: Array<{
    method: Order["paymentMethod"];
    amount: number;
  }>;
  order_items?: Array<{
    id: string;
    product_id: string;
    variant_id: string | null;
    quantity: number;
    unit_price: number;
    subtotal: number;
    notes: string | null;
    products?: {
      name: string;
      category_id: string;
    } | null;
    product_variants?: {
      name: string;
    } | null;
    order_item_modifiers?: Array<{
      id: string;
      modifier_name_snapshot: string;
      price_delta: number;
    }>;
  }>;
};

function buildPaymentBreakdown(
  payments: Array<{ method: Order["paymentMethod"]; amount: number }> = [],
) {
  return payments.reduce(
    (acc, payment) => {
      if (payment.method === "efectivo") acc.cash += payment.amount;
      if (payment.method === "tarjeta") acc.card += payment.amount;
      if (payment.method === "transferencia") acc.transfer += payment.amount;
      return acc;
    },
    { cash: 0, card: 0, transfer: 0 },
  );
}

function mapCustomer(row: OrderQueryRow["customers"]): Customer | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    addresses: (row.customer_addresses ?? []).map((address) => ({
      id: address.id,
      label: address.label,
      street: address.street,
      district: address.district,
      reference: address.reference ?? undefined,
      isDefault: address.is_default,
    })),
  };
}

function mapDeliveryAddress(
  row: OrderQueryRow["customer_addresses"],
): CustomerAddress | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    label: row.label,
    street: row.street,
    district: row.district,
    reference: row.reference ?? undefined,
    isDefault: row.is_default,
  };
}

function mapExtraCharges(extraCharges: OrderQueryRow["extra_charges"]): OrderExtraCharge[] {
  if (!Array.isArray(extraCharges)) {
    return [];
  }

  return extraCharges.map((charge) => ({
    name: charge.name,
    unitPrice: Number(charge.unitPrice ?? 0),
    quantity: Number(charge.quantity ?? 0),
    total: Number(charge.total ?? 0),
  }));
}

function isMissingColumnError(error: { message?: string | null } | null | undefined, column: string) {
  return typeof error?.message === "string" && error.message.includes(`'${column}' column`);
}

async function listCategoryMap() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("product_categories")
    .select("id, name");

    if (error) {
      throw new Error(formatSupabaseError("No se pudieron cargar las categorías de productos.", error));
    }

  return new Map(data.map((category) => [category.id, category.name]));
}

async function fetchOrdersFromDatabase() {
  const supabase = getSupabaseClient();
  const categoryMap = await listCategoryMap();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "*, profiles!cashier_id(full_name), customers(*, customer_addresses(*)), customer_addresses!delivery_address_id(*), order_payments(*), order_items(*, products(name, category_id), product_variants(name), order_item_modifiers(*))",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(formatSupabaseError("No se pudo cargar el historial de ventas.", error));
  }

  return (data as unknown as OrderQueryRow[]).map(
    (row): Order => ({
      id: row.id,
      number: row.number,
      type: row.type,
      status: row.status,
      paymentMethod: row.payment_method,
      paymentBreakdown: buildPaymentBreakdown(row.order_payments),
      subtotal: row.subtotal,
      discountAmount: row.discount_amount,
      promotionAmount: row.promotion_amount,
      deliveryFee: row.delivery_fee ?? 0,
      extraCharges: mapExtraCharges(row.extra_charges),
      total: row.total,
      notes: row.notes ?? undefined,
      cashierId: row.cashier_id,
      cashierName: row.profiles?.full_name ?? "Usuario",
      customer: mapCustomer(row.customers),
      deliveryAddress: mapDeliveryAddress(row.customer_addresses),
      items: (row.order_items ?? []).map((item) => ({
        id: item.id,
        productId: item.product_id,
        productName: item.products?.name ?? "Producto",
        categoryName: categoryMap.get(item.products?.category_id ?? "") ?? "General",
        quantity: item.quantity,
        unitPrice: item.unit_price,
        subtotal: item.subtotal,
        notes: item.notes ?? undefined,
        variantName: item.product_variants?.name ?? undefined,
        modifiers: (item.order_item_modifiers ?? []).map((modifier) => ({
          id: modifier.id,
          name: modifier.modifier_name_snapshot,
          priceDelta: modifier.price_delta,
        })),
      })),
      cancellationReason: row.cancellation_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  );
}

async function getOpenCashSession() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("status", "abierta")
    .order("opened_at", { ascending: false })
    .maybeSingle();

  if (error) {
    throw new Error(formatSupabaseError("No se pudo validar la caja abierta.", error));
  }

  return data;
}

async function findOrCreateCustomer(payload: CheckoutPayload) {
  const supabase = getSupabaseClient();

  if (!payload.customerName || !payload.customerPhone) {
    return { customerId: null, deliveryAddressId: null };
  }

  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("*")
    .eq("phone", payload.customerPhone)
    .maybeSingle();

  let customerId = existingCustomer?.id ?? null;

  if (!customerId) {
    const { data, error } = await supabase
      .from("customers")
      .insert({
        full_name: payload.customerName,
        phone: payload.customerPhone,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(formatSupabaseError("No se pudo guardar el cliente.", error));
    }

    customerId = data.id;
  }

  let deliveryAddressId: string | null = null;

  if (payload.type === "despacho" && payload.addressStreet && payload.addressDistrict && customerId) {
    const { data: existingAddress } = await supabase
      .from("customer_addresses")
      .select("*")
      .eq("customer_id", customerId)
      .eq("street", payload.addressStreet)
      .eq("district", payload.addressDistrict)
      .maybeSingle();

    if (existingAddress) {
      deliveryAddressId = existingAddress.id;
    } else {
      const { data, error } = await supabase
        .from("customer_addresses")
        .insert({
          customer_id: customerId,
          label: payload.addressLabel || "Principal",
          street: payload.addressStreet,
          district: payload.addressDistrict,
          reference: payload.addressReference ?? null,
          is_default: true,
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(formatSupabaseError("No se pudo guardar la dirección del cliente.", error));
      }

      deliveryAddressId = data.id;
    }
  }

  return { customerId, deliveryAddressId };
}

export const salesService = {
  async listOrders() {
    return fetchOrdersFromDatabase();
  },

  async createOrder(cart: PosCartItem[], payload: CheckoutPayload, actor: AppUser) {
    const supabase = getSupabaseClient();

    if (!cart.length) {
      throw new Error("Agrega al menos un producto al carrito.");
    }

    const currentSession = await getOpenCashSession();

    if (!currentSession) {
      throw new Error("Debes abrir caja antes de registrar ventas.");
    }

    const items = cart.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      categoryName: item.categoryName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal:
        (item.unitPrice +
          item.modifiers.reduce((total, modifier) => total + modifier.priceDelta, 0)) *
        item.quantity,
      notes: item.notes,
      variantId: item.variantId,
      variantName: item.variantName,
      modifiers: item.modifiers,
    }));

    const subtotal = calculateItemsSubtotal(
      items.map((item) => ({
        id: "",
        productId: item.productId,
        productName: item.productName,
        categoryName: item.categoryName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        notes: item.notes,
        variantName: item.variantName,
        modifiers: item.modifiers,
      })),
    );
    const extrasTotal = payload.extraCharges.reduce((total, charge) => total + charge.total, 0);
    const preDiscountTotal = subtotal + payload.deliveryFee + extrasTotal;
    const total = preDiscountTotal - payload.discountAmount - payload.promotionAmount;
    const initialStatus: Order["status"] = "pendiente";

    const { customerId, deliveryAddressId } = await findOrCreateCustomer(payload);

    const baseOrderInsert = {
      type: payload.type,
      status: initialStatus,
      payment_method: payload.paymentMethod,
      subtotal: preDiscountTotal,
      discount_amount: payload.discountAmount,
      promotion_amount: payload.promotionAmount,
      total,
      notes: payload.notes ?? null,
      cashier_id: actor.id,
      customer_id: customerId,
      delivery_address_id: deliveryAddressId,
    };

    let orderRow: Database["public"]["Tables"]["orders"]["Row"] | null = null;

    const { data: orderWithCharges, error: orderWithChargesError } = await supabase
      .from("orders")
      .insert({
        ...baseOrderInsert,
        delivery_fee: payload.deliveryFee,
        extra_charges:
          payload.extraCharges as unknown as Database["public"]["Tables"]["orders"]["Insert"]["extra_charges"],
      })
      .select("*")
      .single();

    if (
      orderWithChargesError &&
      (isMissingColumnError(orderWithChargesError, "delivery_fee") ||
        isMissingColumnError(orderWithChargesError, "extra_charges"))
    ) {
      const { data: legacyOrderRow, error: legacyOrderError } = await supabase
        .from("orders")
        .insert(baseOrderInsert)
        .select("*")
        .single();

      if (legacyOrderError) {
        throw new Error(formatSupabaseError("No se pudo registrar la venta.", legacyOrderError));
      }

      orderRow = legacyOrderRow;
    } else if (orderWithChargesError) {
      throw new Error(formatSupabaseError("No se pudo registrar la venta.", orderWithChargesError));
    } else {
      orderRow = orderWithCharges;
    }

    const paymentRows = [
      { method: "efectivo" as const, amount: payload.paymentBreakdown.cash },
      { method: "tarjeta" as const, amount: payload.paymentBreakdown.card },
      { method: "transferencia" as const, amount: payload.paymentBreakdown.transfer },
    ].filter((payment) => payment.amount > 0);

    if (paymentRows.length) {
      const { error: paymentsError } = await supabase.from("order_payments").insert(
        paymentRows.map((payment) => ({
          order_id: orderRow.id,
          method: payment.method,
          amount: payment.amount,
        })),
      );

      if (paymentsError) {
        throw new Error(formatSupabaseError("No se pudo guardar el detalle de pago.", paymentsError));
      }
    }

    for (const item of items) {
      const { data: orderItemRow, error: orderItemError } = await supabase
        .from("order_items")
        .insert({
          order_id: orderRow.id,
          product_id: item.productId,
          variant_id: item.variantId ?? null,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          subtotal: item.subtotal,
          notes: item.notes || null,
        })
        .select("id")
        .single();

      if (orderItemError) {
        throw new Error(formatSupabaseError("No se pudo guardar el detalle del pedido.", orderItemError));
      }

      if (item.modifiers.length) {
        const { error: modifiersError } = await supabase
          .from("order_item_modifiers")
          .insert(
            item.modifiers.map((modifier) => ({
              order_item_id: orderItemRow.id,
              modifier_id: isUuid(modifier.id) ? modifier.id : null,
              modifier_name_snapshot: modifier.name,
              price_delta: modifier.priceDelta,
            })),
          );

        if (modifiersError) {
          throw new Error(
            formatSupabaseError("No se pudieron guardar los modificadores del pedido.", modifiersError),
          );
        }
      }
    }

    const { error: kitchenError } = await supabase.from("kitchen_tickets").insert({
      order_id: orderRow.id,
      status: initialStatus,
    });

    if (kitchenError) {
      throw new Error(formatSupabaseError("No se pudo crear la comanda de cocina.", kitchenError));
    }

    if (payload.type === "despacho") {
      const { error: dispatchError } = await supabase.from("dispatch_orders").insert({
        order_id: orderRow.id,
        status: "pendiente",
        contact_name: payload.customerName ?? null,
        contact_phone: payload.customerPhone ?? null,
      });

      if (dispatchError) {
        throw new Error(formatSupabaseError("No se pudo crear el despacho.", dispatchError));
      }
    }

    const cashPart = getCashAmountFromBreakdown(payload.paymentBreakdown);

    if (cashPart > 0) {
      const { error: cashMovementError } = await supabase.from("cash_movements").insert({
        session_id: currentSession.id,
        type: "ingreso",
        amount: cashPart,
        reason: `Venta ${orderRow.number}`,
        performed_by: actor.id,
        linked_order_id: orderRow.id,
      });

      if (cashMovementError) {
        throw new Error(
          formatSupabaseError("La venta quedó creada, pero falló el ingreso en caja.", cashMovementError),
        );
      }

      const { error: cashSessionError } = await supabase
        .from("cash_sessions")
        .update({
          expected_amount: currentSession.expected_amount + cashPart,
        })
        .eq("id", currentSession.id);

      if (cashSessionError) {
        throw new Error(
          formatSupabaseError("No se pudo actualizar el monto esperado de la caja.", cashSessionError),
        );
      }
    }

    const savedOrder = (await fetchOrdersFromDatabase()).find((order) => order.id === orderRow.id);

    if (!savedOrder) {
      throw new Error("La venta fue creada, pero no se pudo reconstruir la respuesta.");
    }

    await createAuditLog({
      module: "ventas",
      action: "crear",
      detail: `Registro de la venta ${savedOrder.number}`,
      actor,
      newValue: savedOrder,
    });

    return savedOrder;
  },

  async updateOrderStatus(orderId: string, status: Extract<Order["status"], "pendiente" | "listo">, actor: AppUser) {
    const supabase = getSupabaseClient();
    const previousOrder = (await fetchOrdersFromDatabase()).find((entry) => entry.id === orderId);

    if (!previousOrder) {
      throw new Error("No se encontró la venta a actualizar.");
    }

    if (previousOrder.status === "cancelado") {
      throw new Error("No puedes cambiar el estado de una venta anulada.");
    }

    if (previousOrder.status === status) {
      return previousOrder.id;
    }

    const { error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", orderId);

    if (error) {
      throw new Error("No se pudo actualizar el estado del pedido.");
    }

    const { error: kitchenError } = await supabase
      .from("kitchen_tickets")
      .update({ status })
      .eq("order_id", orderId);

    if (kitchenError) {
      throw new Error("El pedido cambió, pero no se pudo actualizar la comanda.");
    }

    const nextOrder = (await fetchOrdersFromDatabase()).find((entry) => entry.id === orderId);

    if (!nextOrder) {
      throw new Error("El pedido cambió, pero no se pudo recargar su estado.");
    }

    await createAuditLog({
      module: "ventas",
      action: "actualizar_estado",
      detail: `Cambio de estado de ${nextOrder.number} a ${status}`,
      actor,
      previousValue: previousOrder,
      newValue: nextOrder,
    });

    return nextOrder.id;
  },

  async updateOrderPaymentMethod(
    orderId: string,
    paymentMethod: Extract<Order["paymentMethod"], "efectivo" | "tarjeta" | "transferencia">,
    actor: AppUser,
  ) {
    const supabase = getSupabaseClient();
    const currentSession = await getOpenCashSession();
    const previousOrder = (await fetchOrdersFromDatabase()).find((entry) => entry.id === orderId);

    if (!previousOrder) {
      throw new Error("No se encontró la venta a actualizar.");
    }

    if (previousOrder.status === "cancelado") {
      throw new Error("No puedes cambiar el cobro de una venta anulada.");
    }

    if (previousOrder.paymentMethod === paymentMethod) {
      return previousOrder;
    }

    const oldCashAmount = getCashAmountFromBreakdown(previousOrder.paymentBreakdown);
    const nextPaymentBreakdown =
      paymentMethod === "efectivo"
        ? { cash: previousOrder.total, card: 0, transfer: 0 }
        : paymentMethod === "tarjeta"
          ? { cash: 0, card: previousOrder.total, transfer: 0 }
          : { cash: 0, card: 0, transfer: previousOrder.total };
    const nextCashAmount = getCashAmountFromBreakdown(nextPaymentBreakdown);
    const cashDelta = nextCashAmount - oldCashAmount;

    const { error: orderError } = await supabase
      .from("orders")
      .update({ payment_method: paymentMethod })
      .eq("id", orderId);

    if (orderError) {
      throw new Error("No se pudo actualizar el medio de pago.");
    }

    const { error: deletePaymentsError } = await supabase
      .from("order_payments")
      .delete()
      .eq("order_id", orderId);

    if (deletePaymentsError) {
      throw new Error("No se pudo limpiar el detalle de pago anterior.");
    }

    const { error: insertPaymentsError } = await supabase.from("order_payments").insert({
      order_id: orderId,
      method: paymentMethod,
      amount: previousOrder.total,
    });

    if (insertPaymentsError) {
      throw new Error("No se pudo guardar el nuevo detalle de pago.");
    }

    if (cashDelta !== 0 && currentSession) {
      const { error: cashMovementError } = await supabase.from("cash_movements").insert({
        session_id: currentSession.id,
        type: cashDelta > 0 ? "ingreso" : "anulacion",
        amount: Math.abs(cashDelta),
        reason:
          cashDelta > 0
            ? `Corrección cobro a efectivo ${previousOrder.number}`
            : `Corrección cobro fuera de efectivo ${previousOrder.number}`,
        performed_by: actor.id,
        linked_order_id: orderId,
      });

      if (cashMovementError) {
        throw new Error("Se actualizó el cobro, pero falló el ajuste en caja.");
      }

      const { error: cashSessionError } = await supabase
        .from("cash_sessions")
        .update({
          expected_amount: currentSession.expected_amount + cashDelta,
        })
        .eq("id", currentSession.id);

      if (cashSessionError) {
        throw new Error("Se actualizó el cobro, pero no se pudo ajustar el esperado de caja.");
      }
    }

    const nextOrder = (await fetchOrdersFromDatabase()).find((entry) => entry.id === orderId);

    if (!nextOrder) {
      throw new Error("Se actualizó el cobro, pero no se pudo reconstruir la venta.");
    }

    await createAuditLog({
      module: "ventas",
      action: "actualizar_pago",
      detail: `Cambio de medio de pago de ${nextOrder.number} a ${paymentMethod}`,
      actor,
      previousValue: previousOrder,
      newValue: nextOrder,
    });

    return nextOrder;
  },

  async cancelOrder(orderId: string, reason: string, actor: AppUser) {
    const supabase = getSupabaseClient();
    const order = (await fetchOrdersFromDatabase()).find((entry) => entry.id === orderId);

    if (!order) {
      throw new Error("No se encontró la venta a anular.");
    }

    if (order.status === "cancelado") {
      throw new Error("La venta ya se encuentra anulada.");
    }

    const { error } = await supabase
      .from("orders")
      .update({
        status: "cancelado",
        cancellation_reason: reason,
      })
      .eq("id", orderId);

    if (error) {
      throw new Error("No se pudo anular la venta.");
    }

    const { error: kitchenError } = await supabase
      .from("kitchen_tickets")
      .update({ status: "cancelado" })
      .eq("order_id", orderId);

    if (kitchenError) {
      throw new Error("La venta se anuló, pero no se pudo actualizar la comanda.");
    }

    const { error: dispatchError } = await supabase
      .from("dispatch_orders")
      .update({ status: "cancelado" })
      .eq("order_id", orderId);

    if (dispatchError) {
      throw new Error("La venta se anuló, pero no se pudo actualizar el despacho.");
    }

    const cashPart = getCashAmountFromBreakdown(order.paymentBreakdown);
    const currentSession = await getOpenCashSession();

    if (cashPart > 0 && currentSession) {
      const { error: reversalError } = await supabase.from("cash_movements").insert({
        session_id: currentSession.id,
        type: "anulacion",
        amount: cashPart,
        reason: `Anulación ${order.number}`,
        performed_by: actor.id,
        linked_order_id: order.id,
      });

      if (reversalError) {
        throw new Error("La venta se anuló, pero falló el ajuste en caja.");
      }

      const { error: cashSessionError } = await supabase
        .from("cash_sessions")
        .update({
          expected_amount: currentSession.expected_amount - cashPart,
        })
        .eq("id", currentSession.id);

      if (cashSessionError) {
        throw new Error("No se pudo actualizar la caja luego de la anulación.");
      }
    }

    const nextOrder = (await fetchOrdersFromDatabase()).find((entry) => entry.id === orderId);

    if (!nextOrder) {
      throw new Error("La venta se anuló, pero no se pudo recargar su estado.");
    }

    await createAuditLog({
      module: "ventas",
      action: "anular",
      detail: `Anulación de la venta ${nextOrder.number}`,
      actor,
      previousValue: order,
      newValue: nextOrder,
      reason,
    });

    return nextOrder;
  },
};
