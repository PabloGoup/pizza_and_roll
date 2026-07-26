import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useEffect } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
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
  openingAmount: z.number().min(0, "Ingresa un monto válido."),
  notes: z.string().max(120, "Máximo 120 caracteres.").optional(),
});

type Values = z.infer<typeof schema>;

export function OpenCashDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  suggestedAmount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Values) => Promise<unknown>;
  isPending: boolean;
  suggestedAmount?: number | null;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    control,
  } = useForm<Values>({
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

  useEffect(() => {
    if (open) {
      reset({
        openingAmount: suggestedAmount ?? 80000,
        notes: suggestedAmount != null ? "Fondo sugerido desde el último cierre" : "Caja turno",
      });
    }
  }, [open, reset, suggestedAmount]);

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
            <Controller
              control={control}
              name="openingAmount"
              render={({ field }) => (
                <CurrencyInput
                  id="openingAmount"
                  value={field.value}
                  onBlur={field.onBlur}
                  onValueChange={field.onChange}
                  aria-invalid={Boolean(errors.openingAmount)}
                />
              )}
            />
            {errors.openingAmount ? (
              <p className="text-xs text-rose-400">{errors.openingAmount.message}</p>
            ) : null}
            {suggestedAmount != null ? (
              <p className="text-xs text-muted-foreground">
                Preestablecido desde la última cuadratura: puedes modificarlo antes de abrir.
              </p>
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
