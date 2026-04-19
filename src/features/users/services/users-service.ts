import { createAuditLog } from "@/lib/supabase/audit";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { AppUser, UserFormData } from "@/types/domain";

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: "administrador" | "cajero";
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

function mapProfile(profile: ProfileRow): AppUser {
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    isActive: profile.is_active,
    avatarUrl: profile.avatar_url,
    createdAt: profile.created_at,
    lastLoginAt: profile.updated_at,
  };
}

export const usersService = {
  async listUsers() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error("No se pudo cargar el listado de usuarios.");
    }

    return data.map(mapProfile);
  },

  async saveUser(payload: UserFormData, actor: AppUser) {
    const supabase = getSupabaseClient();

    if (!payload.id) {
      throw new Error(
        "La creación de usuarios debe ejecutarse desde un endpoint seguro o Edge Function de Supabase.",
      );
    }

    const { data: previous, error: previousError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", payload.id)
      .single();

    if (previousError) {
      throw new Error("No se pudo cargar el usuario antes de actualizar.");
    }

    const { data, error } = await supabase
      .from("profiles")
      .update({
        email: payload.email,
        full_name: payload.fullName,
        role: payload.role,
        is_active: payload.isActive,
      })
      .eq("id", payload.id)
      .select("*")
      .single();

    if (error) {
      throw new Error("No se pudo actualizar el usuario.");
    }

    await createAuditLog({
      module: "usuarios",
      action: "actualizar",
      detail: `Actualización del usuario ${payload.fullName}`,
      actor,
      previousValue: previous,
      newValue: data,
    });

    return mapProfile(data);
  },
};
