import { createAuditLog } from "@/lib/supabase/audit";
import { emailToProfileName, normalizeProfileName, profileNameToEmail } from "@/lib/profile-auth";
import { createTransientSupabaseClient, getSupabaseClient } from "@/lib/supabase/client";
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
    profileName: emailToProfileName(profile.email),
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
      if (!payload.password || payload.password.length < 6) {
        throw new Error("La contraseña debe tener al menos 6 caracteres.");
      }

      const normalizedProfileName = normalizeProfileName(payload.profileName);
      const authClient = createTransientSupabaseClient();
      const generatedEmail = profileNameToEmail(normalizedProfileName);
      const { data: signUpData, error: signUpError } = await authClient.auth.signUp({
        email: generatedEmail,
        password: payload.password,
        options: {
          data: {
            full_name: payload.fullName,
          },
        },
      });

      if (signUpError || !signUpData.user) {
        if (signUpError?.message?.toLowerCase().includes("already")) {
          throw new Error("Ya existe un usuario con ese nombre de perfil.");
        }

        throw new Error(signUpError?.message ?? "No se pudo crear el usuario.");
      }

      const { data: createdProfile, error: createdProfileError } = await supabase
        .from("profiles")
        .update({
          email: generatedEmail,
          full_name: payload.fullName,
          role: payload.role,
          is_active: payload.isActive,
        })
        .eq("id", signUpData.user.id)
        .select("*")
        .single();

      if (createdProfileError) {
        throw new Error("El usuario fue creado, pero no se pudo actualizar su perfil.");
      }

      await createAuditLog({
        module: "usuarios",
        action: "crear",
        detail: `Creación del usuario ${payload.fullName}`,
        actor,
        newValue: createdProfile,
      });

      return mapProfile(createdProfile);
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

  async deleteUser(userId: string, actor: AppUser) {
    const supabase = getSupabaseClient();

    if (userId === actor.id) {
      throw new Error("No puedes eliminar tu propio usuario mientras estás conectado.");
    }

    const { data: previous, error: previousError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (previousError) {
      throw new Error("No se pudo cargar el usuario antes de eliminar.");
    }

    const { error } = await supabase.from("profiles").delete().eq("id", userId);

    if (error) {
      const { data: disabledProfile, error: disableError } = await supabase
        .from("profiles")
        .update({ is_active: false })
        .eq("id", userId)
        .select("*")
        .single();

      if (disableError) {
        throw new Error("No se pudo eliminar el usuario.");
      }

      await createAuditLog({
        module: "usuarios",
        action: "desactivar",
        detail: `Desactivación del usuario ${previous.full_name}`,
        actor,
        previousValue: previous,
        newValue: disabledProfile,
        reason: "El usuario mantiene historial y no puede eliminarse físicamente.",
      });

      return { mode: "disabled" as const, user: mapProfile(disabledProfile) };
    }

    await createAuditLog({
      module: "usuarios",
      action: "eliminar",
      detail: `Eliminación del usuario ${previous.full_name}`,
      actor,
      previousValue: previous,
      newValue: null,
    });

    return { mode: "deleted" as const, user: mapProfile(previous) };
  },
};
