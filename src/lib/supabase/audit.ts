import { getSupabaseClient } from "@/lib/supabase/client";
import type { AppUser, ModuleKey } from "@/types/domain";

export async function createAuditLog(input: {
  module: ModuleKey;
  action: string;
  detail: string;
  actor: AppUser;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}) {
  const supabase = getSupabaseClient();

  const { error } = await supabase.from("audit_logs").insert([
    {
      module: input.module,
      action: input.action,
      detail: input.detail,
      performed_by: input.actor.id,
      previous_value:
        input.previousValue === undefined ? null : (input.previousValue as never),
      new_value: input.newValue === undefined ? null : (input.newValue as never),
      reason: input.reason ?? null,
    },
  ]);

  if (error) {
    throw new Error("No se pudo registrar la auditoría.");
  }
}
