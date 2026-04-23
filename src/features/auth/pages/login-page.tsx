import { Navigate } from "react-router-dom";

import { useAuthStore } from "@/stores/auth-store";

export function LoginPage() {
  const currentUser = useAuthStore((state) => state.currentUser);

  if (currentUser) {
    return <Navigate to={currentUser.role === "cliente" ? "/" : "/app"} replace />;
  }

  return <Navigate to="/?auth=login" replace />;
}
