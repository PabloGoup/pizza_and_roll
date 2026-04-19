import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const schema = z.object({
  type: z.enum(["ingreso", "retiro"]),
  amount: z.coerce.number().min(1, "Debe ser mayor a cero."),
  reason: z.string().min(4, "Describe el motivo."),
});

type Values = z.input<typeof schema>;
type SubmitValues = z.output<typeof schema>;

export function RegisterCashMovementDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: SubmitValues) => Promise<unknown>;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<Values, unknown, SubmitValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "retiro",
      amount: 5000,
      reason: "",
    },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
    reset();
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Movimiento de caja</DialogTitle>
          <DialogDescription>
            Registra un ingreso extraordinario o un retiro operativo.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-11 w-full rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retiro">Retiro</SelectItem>
                    <SelectItem value="ingreso">Ingreso</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Monto</Label>
            <Input id="amount" type="number" min={0} step={1000} {...register("amount")} />
            {errors.amount ? <p className="text-xs text-rose-400">{errors.amount.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Motivo</Label>
            <Input id="reason" placeholder="Ej. Compra urgente de insumos" {...register("reason")} />
            {errors.reason ? <p className="text-xs text-rose-400">{errors.reason.message}</p> : null}
          </div>

          <Button type="submit" className="h-11 w-full rounded-2xl" disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar movimiento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
