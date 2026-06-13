import { Navigate } from "react-router-dom";

import { useAuthStore } from "@/stores/auth-store";

export function LoginPage() {
  const currentUser = useAuthStore((state) => state.currentUser);

  if (currentUser) {
    if (currentUser.role === "cocina") return <Navigate to="/cocina" replace />;
    if (currentUser.role === "cliente") return <Navigate to="/" replace />;
    return <Navigate to="/app" replace />;
  }

  return <Navigate to="/?auth=login" replace />;
}
