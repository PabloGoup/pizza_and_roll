export type Role = "administrador" | "cajero";

export type ModuleKey =
  | "dashboard"
  | "ventas"
  | "caja"
  | "productos"
  | "usuarios"
  | "auditoria";

export type OrderType = "consumo_local" | "retiro_local" | "despacho";
export type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "mixto";
export type OrderStatus =
  | "pendiente"
  | "en_preparacion"
  | "listo"
  | "entregado"
  | "cancelado";
export type CashSessionStatus = "abierta" | "cerrada";
export type CashMovementType =
  | "apertura"
  | "ingreso"
  | "retiro"
  | "anulacion"
  | "diferencia"
  | "cierre";
export type ProductStatus = "activo" | "inactivo";

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  avatarUrl?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface CategoryFormData {
  id?: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  price: number;
  cost: number;
  isDefault?: boolean;
}

export interface ProductModifier {
  id: string;
  name: string;
  priceDelta: number;
  defaultIncluded?: boolean;
}

export interface Product {
  id: string;
  categoryId: string;
  sortOrder: number;
  name: string;
  description: string;
  imageUrl?: string | null;
  basePrice: number;
  cost: number;
  isFavorite: boolean;
  status: ProductStatus;
  hasVariants: boolean;
  hasModifiers: boolean;
  variants: ProductVariant[];
  modifiers: ProductModifier[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerAddress {
  id: string;
  label: string;
  street: string;
  district: string;
  reference?: string;
  isDefault?: boolean;
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  addresses: CustomerAddress[];
}

export interface OrderItemSelection {
  id: string;
  name: string;
  priceDelta: number;
  quantity?: number;
}

export interface OrderExtraCharge {
  name: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  categoryName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  notes?: string;
  variantName?: string;
  modifiers: OrderItemSelection[];
}

export interface PaymentBreakdown {
  cash: number;
  card: number;
  transfer: number;
}

export interface Order {
  id: string;
  number: string;
  type: OrderType;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentBreakdown: PaymentBreakdown;
  subtotal: number;
  discountAmount: number;
  promotionAmount: number;
  deliveryFee: number;
  extraCharges: OrderExtraCharge[];
  total: number;
  notes?: string;
  cashierId: string;
  cashierName: string;
  customer?: Customer | null;
  deliveryAddress?: CustomerAddress | null;
  items: OrderItem[];
  cancellationReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CashSession {
  id: string;
  status: CashSessionStatus;
  openingAmount: number;
  expectedAmount: number;
  expectedCashSalesAmount: number;
  expectedCardAmount: number;
  expectedTransferAmount: number;
  countedAmount?: number | null;
  countedCardAmount?: number | null;
  countedTransferAmount?: number | null;
  differenceAmount?: number | null;
  differenceCardAmount?: number | null;
  differenceTransferAmount?: number | null;
  notes?: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string | null;
}

export interface CashMovement {
  id: string;
  sessionId: string;
  type: CashMovementType;
  amount: number;
  reason: string;
  performedById: string;
  performedByName: string;
  linkedOrderId?: string | null;
  linkedOrderNumber?: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  module: ModuleKey;
  action: string;
  detail: string;
  performedById: string;
  performedByName: string;
  previousValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  createdAt: string;
}

export interface DashboardMetrics {
  totalSalesToday: number;
  ordersToday: number;
  averageTicket: number;
  expectedCash: number;
  cancelledOrders: number;
  salesByHour: Array<{ label: string; total: number }>;
  paymentMix: Array<{ name: string; value: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
}

export interface PosCartItem {
  id: string;
  productId: string;
  productName: string;
  categoryName: string;
  quantity: number;
  unitPrice: number;
  notes: string;
  variantId?: string;
  variantName?: string;
  modifiers: OrderItemSelection[];
}

export interface ProductSelectionPayload {
  productId: string;
  quantity: number;
  notes?: string;
  variantId?: string;
  modifierIds: string[];
  manualModifiers: OrderItemSelection[];
}

export interface CheckoutPayload {
  type: OrderType;
  paymentMethod: PaymentMethod;
  paymentBreakdown: PaymentBreakdown;
  discountAmount: number;
  promotionAmount: number;
  deliveryFee: number;
  extraCharges: OrderExtraCharge[];
  notes?: string;
  customerName?: string;
  customerPhone?: string;
  addressLabel?: string;
  addressStreet?: string;
  addressDistrict?: string;
  addressReference?: string;
}

export interface ProductFormData {
  id?: string;
  categoryId: string;
  sortOrder: number;
  name: string;
  description: string;
  basePrice: number;
  cost: number;
  isFavorite: boolean;
  status: ProductStatus;
  tags: string[];
  variants: ProductVariant[];
  modifiers: ProductModifier[];
}

export interface CashMovementInput {
  type: Extract<CashMovementType, "ingreso" | "retiro">;
  amount: number;
  reason: string;
}

export interface CashCloseInput {
  countedAmount: number;
  countedCardAmount: number;
  countedTransferAmount: number;
  forceCloseWithDifferences?: boolean;
  notes?: string;
}

export interface CashCloseMethodSummary {
  method: Exclude<PaymentMethod, "mixto">;
  salesCount: number;
  salesAmount: number;
  expectedAmount: number;
  reviewedAmount: number;
  differenceAmount: number;
  orders: CashCloseOrderDetail[];
}

export interface CashCloseSummary {
  sessionId: string;
  openingAmount: number;
  manualIncomeAmount: number;
  manualExpenseAmount: number;
  cashBaseAmount: number;
  cash: CashCloseMethodSummary;
  card: CashCloseMethodSummary;
  transfer: CashCloseMethodSummary;
  totalSalesAmount: number;
  totalReviewedAmount: number;
  totalDifferenceAmount: number;
}

export interface CashCloseOrderDetail {
  orderId: string;
  orderNumber: string;
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  amount: number;
  total: number;
  createdAt: string;
  cashierName?: string;
}

export interface UserFormData {
  id?: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
}
