import { useStoreSettings } from "@/features/storefront/hooks/use-storefront";
import { Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildOrderPrintMarkup,
  getOrderPrintStyles,
  printOrder,
  type PrintMode,
} from "@/features/sales/lib/order-print";
import type { Order, StoreSettings } from "@/types/domain";

export function OrderPrintPreviewDialog({
  open,
  onOpenChange,
  order,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
}) {
  const { data: store } = useStoreSettings();
  const mode: PrintMode = "ticket";

  if (!order) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vista previa de impresión</DialogTitle>
          <DialogDescription>
            Revisa el formato térmico antes de imprimir. Puedes usar la impresión del navegador o
            guardar en PDF.
          </DialogDescription>
        </DialogHeader>

        <PrintPreviewPaper order={order} mode="ticket" store={store} />

        <DialogFooter className="items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Simulación en ancho térmico de 58 mm.
          </p>
          <Button
            className="rounded-full"
            onClick={() => {
              const success = printOrder(order, mode, store);

              if (!success) {
                toast.error("El navegador bloqueó la ventana de impresión.");
              }
            }}
          >
            <Printer className="size-4" />
            Imprimir comprobante
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrintPreviewPaper({ order, mode, store }: { order: Order; mode: PrintMode; store?: StoreSettings }) {
  return (
    <div className="rounded-3xl border border-border/70 bg-muted/20 p-4 sm:p-6">
      <div className="mx-auto max-w-[274px] rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
        <style>{getOrderPrintStyles()}</style>
        <div dangerouslySetInnerHTML={{ __html: buildOrderPrintMarkup(order, mode, store) }} />
      </div>
    </div>
  );
}
