import { getSupabaseClient } from "@/lib/supabase/client";
import { formatSupabaseError } from "@/lib/supabase/errors";
import { getFunctionErrorMessage } from "@/lib/supabase/function-errors";

export type DailyReportSettings = {
  isEnabled: boolean;
  recipients: string[];
  senderName: string;
  subjectPrefix: string;
  updatedAt: string;
};

export type DailyReportDelivery = {
  id: string;
  sessionId: string;
  status: "pending" | "processing" | "sent" | "failed" | "skipped";
  recipients: string[];
  attempts: number;
  sentAt: string | null;
  lastError: string | null;
  createdAt: string;
};

export const dailyReportSettingsService = {
  async getSettings(): Promise<DailyReportSettings> {
    const { data, error } = await getSupabaseClient()
      .from("daily_cash_report_settings")
      .select("*")
      .eq("id", true)
      .single();

    if (error) {
      throw new Error(
        formatSupabaseError("No se pudo cargar la configuración del informe diario.", error),
      );
    }

    return {
      isEnabled: data.is_enabled,
      recipients: data.recipients ?? [],
      senderName: data.sender_name,
      subjectPrefix: data.subject_prefix,
      updatedAt: data.updated_at,
    };
  },

  async updateSettings(
    settings: Omit<DailyReportSettings, "updatedAt">,
    updatedBy: string,
  ): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("daily_cash_report_settings")
      .update({
        is_enabled: settings.isEnabled,
        recipients: settings.recipients,
        sender_name: settings.senderName,
        subject_prefix: settings.subjectPrefix,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);

    if (error) {
      throw new Error(
        formatSupabaseError("No se pudo guardar la configuración del informe diario.", error),
      );
    }
  },

  async listDeliveries(): Promise<DailyReportDelivery[]> {
    const { data, error } = await getSupabaseClient()
      .from("daily_cash_report_deliveries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(formatSupabaseError("No se pudo cargar el historial de envíos.", error));
    }

    return data.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      status: row.status,
      recipients: row.recipients ?? [],
      attempts: row.attempts,
      sentAt: row.sent_at,
      lastError: row.last_error,
      createdAt: row.created_at,
    }));
  },

  async retryDelivery(sessionId: string): Promise<void> {
    const { data, error } = await getSupabaseClient().functions.invoke(
      "send-daily-cash-report",
      { body: { sessionId } },
    );

    if (error) {
      throw new Error(
        await getFunctionErrorMessage(error, "No se pudo reenviar el informe."),
      );
    }
    if (!data?.ok) throw new Error(data?.error ?? "No se pudo reenviar el informe.");
  },
};
