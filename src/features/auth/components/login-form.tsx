import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSignIn } from "@/features/auth/hooks/use-auth";

const loginSchema = z.object({
  email: z.string().email("Ingresa un correo válido."),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const navigate = useNavigate();
  const signIn = useSignIn();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    await signIn.mutateAsync(values);
    navigate("/");
  });

  return (
    <Card className="border-border/70 bg-card/90 shadow-2xl shadow-black/10">
      <CardHeader>
        <CardTitle>Ingreso al sistema</CardTitle>
        <CardDescription>
          Accede con tu cuenta de caja o administración.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" type="email" placeholder="correo@empresa.cl" {...register("email")} />
            {errors.email ? <p className="text-xs text-rose-400">{errors.email.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" type="password" placeholder="••••••••" {...register("password")} />
            {errors.password ? (
              <p className="text-xs text-rose-400">{errors.password.message}</p>
            ) : null}
          </div>

          <Button type="submit" className="h-11 w-full rounded-2xl text-sm font-semibold" disabled={signIn.isPending}>
            {signIn.isPending ? "Ingresando..." : "Entrar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
