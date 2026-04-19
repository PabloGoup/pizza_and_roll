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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  openingAmount: z.coerce.number().min(0, "Ingresa un monto válido."),
  notes: z.string().max(120, "Máximo 120 caracteres.").optional(),
});

type Values = z.input<typeof schema>;
type SubmitValues = z.output<typeof schema>;

export function OpenCashDialog({
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
    reset,
    formState: { errors },
  } = useForm<Values, unknown, SubmitValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      openingAmount: 80000,
      notes: "Caja turno mañana",
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
          <DialogTitle>Apertura de caja</DialogTitle>
          <DialogDescription>
            Define el monto inicial y el detalle del turno.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="openingAmount">Monto inicial</Label>
            <Input id="openingAmount" type="number" min={0} step={1000} {...register("openingAmount")} />
            {errors.openingAmount ? (
              <p className="text-xs text-rose-400">{errors.openingAmount.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Input id="notes" placeholder="Ej. Caja turno tarde" {...register("notes")} />
            {errors.notes ? <p className="text-xs text-rose-400">{errors.notes.message}</p> : null}
          </div>

          <Button type="submit" className="h-11 w-full rounded-2xl" disabled={isPending}>
            {isPending ? "Abriendo..." : "Abrir caja"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
