import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/app/layouts/app-shell";
import { StorefrontShell } from "@/app/layouts/storefront-shell";
import { LoadingState } from "@/components/common/loading-state";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { LoginPage } from "@/features/auth/pages/login-page";
import { AuditPage } from "@/features/audit/pages/audit-page";
import { CashPage } from "@/features/cash/pages/cash-page";
import { DashboardPage } from "@/features/dashboard/pages/dashboard-page";
import { ProductsPage } from "@/features/products/pages/products-page";
import { PosPage } from "@/features/sales/pages/pos-page";
import { StorefrontPage } from "@/features/storefront/pages/storefront-page";
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
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<StorefrontShell />}>
          <Route index element={<StorefrontPage />} />
          <Route path="tienda" element={<Navigate to="/" replace />} />
        </Route>
        <Route
          path="/app"
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

        <Route path="/ventas" element={<Navigate to="/app/ventas" replace />} />
        <Route path="/caja" element={<Navigate to="/app/caja" replace />} />
        <Route path="/productos" element={<Navigate to="/app/productos" replace />} />
        <Route path="/usuarios" element={<Navigate to="/app/usuarios" replace />} />
        <Route path="/auditoria" element={<Navigate to="/app/auditoria" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
