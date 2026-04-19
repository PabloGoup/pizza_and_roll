import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Order } from "@/types/domain";

const schema = z.object({
  reason: z.string().min(6, "El motivo es obligatorio."),
});

type Values = z.infer<typeof schema>;

export function CancelOrderDialog({
  open,
  onOpenChange,
  order,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  onSubmit: (values: Values) => Promise<void>;
  isPending: boolean;
}) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      reason: "",
    },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
    reset();
    onOpenChange(false);
  });

  if (!order) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anular venta {order.number}</DialogTitle>
          <DialogDescription>
            Esta acción quedará registrada en auditoría y caja.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="cancelReason">Motivo obligatorio</Label>
            <Textarea id="cancelReason" className="min-h-24 rounded-2xl" {...register("reason")} />
            {errors.reason ? <p className="text-xs text-rose-400">{errors.reason.message}</p> : null}
          </div>

          <Button type="submit" variant="destructive" className="h-11 w-full rounded-2xl" disabled={isPending}>
            {isPending ? "Anulando..." : "Confirmar anulación"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
