import { getSupabaseClient } from "@/lib/supabase/client";

export const auditService = {
  async listAuditEvents() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*, profiles!performed_by(full_name)")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error("No se pudo cargar la auditoría.");
    }

    return (data as Array<{
      id: string;
      module: string;
      action: string;
      detail: string;
      performed_by: string | null;
      previous_value: unknown;
      new_value: unknown;
      reason: string | null;
      created_at: string;
      profiles?: { full_name?: string } | null;
    }>).map((row) => ({
      id: row.id,
      module: row.module as
        | "dashboard"
        | "ventas"
        | "caja"
        | "productos"
        | "usuarios"
        | "auditoria",
      action: row.action,
      detail: row.detail,
      performedById: row.performed_by ?? "",
      performedByName: row.profiles?.full_name ?? "Sistema",
      previousValue: row.previous_value ? JSON.stringify(row.previous_value) : null,
      newValue: row.new_value ? JSON.stringify(row.new_value) : null,
      reason: row.reason,
      createdAt: row.created_at,
    }));
  },
};
