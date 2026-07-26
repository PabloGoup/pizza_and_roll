import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";

function formatInteger(value: number) {
  return Math.max(0, Math.trunc(value)).toLocaleString("es-CL");
}

function parseInteger(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number.parseInt(digits, 10) : 0;
}

type CurrencyInputProps = Omit<
  ComponentProps<typeof Input>,
  "inputMode" | "onChange" | "type" | "value"
> & {
  value: number;
  onValueChange: (value: number) => void;
};

export function CurrencyInput({
  value,
  onValueChange,
  ...props
}: CurrencyInputProps) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={value > 0 ? formatInteger(value) : ""}
      onChange={(event) => onValueChange(parseInteger(event.target.value))}
    />
  );
}
