import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/app/layouts/app-shell";
import { LoadingState } from "@/components/common/loading-state";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { LoginPage } from "@/features/auth/pages/login-page";
import { AuditPage } from "@/features/audit/pages/audit-page";
import { CashPage } from "@/features/cash/pages/cash-page";
import { DashboardPage } from "@/features/dashboard/pages/dashboard-page";
import { ProductsPage } from "@/features/products/pages/products-page";
import { PosPage } from "@/features/sales/pages/pos-page";
import { UsersPage } from "@/features/users/pages/users-page";
import { useAuthStore } from "@/stores/auth-store";

function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading } = useCurrentUser();
  const currentUser = useAuthStore((state) => state.currentUser);

  if (isLoading) {
    return <LoadingState label="Validando sesión..." />;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const currentUser = useAuthStore((state) => state.currentUser);

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser.role !== "administrador") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="ventas" element={<PosPage />} />
          <Route path="caja" element={<CashPage />} />
          <Route
            path="productos"
            element={
              <RequireAdmin>
                <ProductsPage />
              </RequireAdmin>
            }
          />
          <Route
            path="usuarios"
            element={
              <RequireAdmin>
                <UsersPage />
              </RequireAdmin>
            }
          />
          <Route
            path="auditoria"
            element={
              <RequireAdmin>
                <AuditPage />
              </RequireAdmin>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
