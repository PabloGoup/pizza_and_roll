import { useSearchParams } from "react-router-dom";

import { LoadingState } from "@/components/common/loading-state";
import { TicketCard } from "@/features/kitchen/components/ticket-card";
import { useKitchenTickets } from "@/features/kitchen/hooks/use-kitchen-tickets";

const KITCHEN_TOKEN = import.meta.env.VITE_KITCHEN_TOKEN as string | undefined;

export function KitchenDisplayPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  // Token guard — simple protection for the kitchen display URL
  if (KITCHEN_TOKEN && token !== KITCHEN_TOKEN) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <p className="text-2xl font-bold">Acceso denegado</p>
          <p className="text-muted-foreground">
            Agrega <code>?token=&lt;token&gt;</code> a la URL para acceder.
          </p>
        </div>
      </div>
    );
  }

  return <KitchenDisplayContent />;
}

function KitchenDisplayContent() {
  const {
    pendientes,
    enPreparacion,
    isLoading,
    error,
    connectionStatus,
    iniciarTicket,
    marcarListo,
  } = useKitchenTickets();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">🍕 Cocina</h1>
          <span className="text-muted-foreground text-sm hidden sm:block">— Pizza & Roll</span>
        </div>

        {/* Realtime indicator */}
        <div className="flex items-center gap-1.5 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${connectionStatus === "conectado" ? "bg-green-500" : "bg-gray-400"}`}
          />
          <span className="text-muted-foreground hidden sm:block">
            {connectionStatus === "conectado" ? "Tiempo real" : "Sin conexión en vivo"}
          </span>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 p-4 overflow-auto">
        {isLoading && <LoadingState label="Cargando pedidos..." />}

        {!isLoading && error && (
          <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-700 dark:text-red-400">
            Error: {error}
          </div>
        )}

        {!isLoading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Column: PENDIENTES */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">PENDIENTES</h2>
                <CountBadge count={pendientes.length} color="bg-amber-500" />
              </div>

              {pendientes.length === 0 ? (
                <EmptyColumn label="Sin pedidos pendientes" />
              ) : (
                <div className="space-y-3">
                  {pendientes.map((order) => (
                    <TicketCard
                      key={order.ticket_id}
                      order={order}
                      onIniciarTicket={iniciarTicket}
                      onMarcarListo={marcarListo}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Column: EN PREPARACIÓN */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">EN PREPARACIÓN</h2>
                <CountBadge count={enPreparacion.length} color="bg-blue-500" />
              </div>

              {enPreparacion.length === 0 ? (
                <EmptyColumn label="Sin pedidos en preparación" />
              ) : (
                <div className="space-y-3">
                  {enPreparacion.map((order) => (
                    <TicketCard
                      key={order.ticket_id}
                      order={order}
                      onIniciarTicket={iniciarTicket}
                      onMarcarListo={marcarListo}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function CountBadge({ count, color }: { count: number; color: string }) {
  return (
    <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white ${color}`}>
      {count}
    </span>
  );
}

function EmptyColumn({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
      {label}
    </div>
  );
}
