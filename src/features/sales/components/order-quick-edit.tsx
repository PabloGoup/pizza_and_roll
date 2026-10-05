import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUpdateOrderDetails, useUpdateOrderPaymentMethod } from "@/features/sales/hooks/use-sales";
import type { AppUser, Order } from "@/types/domain";

export function OrderCustomerSummary({ order, onEdit }: { order: Order; onEdit: () => void }) {
  const details = [order.customerNameSnapshot ?? order.customer?.fullName,
    order.customerPhoneSnapshot ?? order.customer?.phone, order.deliveryAddress?.street,
    order.deliveryAddress?.district, order.deliveryAddress?.reference, order.notes].filter(Boolean).join(" · ");
  return <Button variant="ghost" size="sm" className="h-auto max-w-full justify-start whitespace-normal break-words text-left" disabled={order.status === "cancelado"} onClick={onEdit} aria-label={`Editar datos de ${order.number}`}>
    {details} <span className="ml-1 shrink-0 text-xs underline">{details ? "Editar datos" : "Agregar datos"}</span>
  </Button>;
}

export function OrderPaymentSelect({ order, actor, onMixed }: { order: Order; actor: AppUser; onMixed: () => void }) {
  const mutation = useUpdateOrderPaymentMethod(actor);
  return <select aria-label={`Forma de pago de ${order.number}`} className="h-10 rounded-lg border bg-background px-2 text-sm" value={order.paymentMethod} disabled={mutation.isPending || order.status === "cancelado"} onChange={(event) => {
    const value = event.target.value;
    if (value === "mixto") { onMixed(); return; }
    if (value !== "efectivo" && value !== "tarjeta" && value !== "transferencia") return;
    mutation.mutate({ orderId: order.id, paymentMethod: value }, {
      onSuccess: () => toast.success("Forma de pago actualizada"),
      onError: (error) => toast.error(error.message),
    });
  }}>
    <option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option>
    <option value="transferencia">Transferencia</option><option value="mixto">Mixto (editar montos)</option>
  </select>;
}

export function OrderDetailsDialog({ order, actor, onClose }: { order: Order; actor: AppUser; onClose: () => void }) {
  const mutation = useUpdateOrderDetails(actor);
  const [draft, setDraft] = useState({
    customerName: order.customerNameSnapshot ?? order.customer?.fullName ?? "",
    customerPhone: order.customerPhoneSnapshot ?? order.customer?.phone ?? "",
    addressLabel: order.deliveryAddress?.label ?? "Principal",
    addressStreet: order.deliveryAddress?.street ?? "",
    addressDistrict: order.deliveryAddress?.district ?? "",
    addressReference: order.deliveryAddress?.reference ?? "",
    notes: order.notes ?? "",
  });
  const fields: [keyof typeof draft, string][] = [
    ["customerName", "Nombre del cliente"], ["customerPhone", "Teléfono o número de contacto"],
    ...(order.type === "despacho" ? [["addressStreet", "Dirección"], ["addressDistrict", "Comuna"], ["addressReference", "Referencia"]] as [keyof typeof draft, string][] : []),
    ["notes", "Observaciones"],
  ];
  return <Dialog open onOpenChange={(open) => { if (!open && !mutation.isPending) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>Datos de {order.number}</DialogTitle>
        <DialogDescription>Todos los datos son opcionales. Puedes completarlos o modificarlos después.</DialogDescription></DialogHeader>
      <form className="space-y-3" onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate({ orderId: order.id, payload: draft }, {
          onSuccess: () => { toast.success("Datos actualizados"); onClose(); },
          onError: (error) => toast.error(error.message),
        });
      }}>
        {fields.map(([key, label]) => <div key={key} className="space-y-1">
          <Label htmlFor={`quick-${key}`}>{label}</Label>
          {key === "notes" ? <Textarea id={`quick-${key}`} value={draft[key]} disabled={mutation.isPending} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /> : <Input id={`quick-${key}`} value={draft[key]} disabled={mutation.isPending} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />}
        </div>)}
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Guardando…" : "Guardar datos"}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}
