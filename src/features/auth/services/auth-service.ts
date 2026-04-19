import { emailToProfileName, profileNameToEmail } from "@/lib/profile-auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { AppUser } from "@/types/domain";

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

function mapProfileToUser(profile: ProfileRow): AppUser {
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

export const authService = {
  async getCurrentUser() {
    const supabase = getSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      throw new Error("No se pudo validar la sesión con Supabase.");
    }

    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      throw new Error("No se pudo cargar el perfil del usuario.");
    }

    if (!data) {
      await supabase.auth.signOut();
      throw new Error("El perfil del usuario fue eliminado o ya no existe.");
    }

    if (!data.is_active) {
      await supabase.auth.signOut();
      throw new Error("Tu usuario está inactivo. Contacta a un administrador.");
    }

    return mapProfileToUser(data);
  },

  async signIn(profileName: string, password: string) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: profileNameToEmail(profileName),
      password,
    });

    if (error) {
      throw new Error("Credenciales inválidas o usuario sin acceso.");
    }

    const user = await authService.getCurrentUser();

    if (!user) {
      throw new Error("No se pudo validar el perfil del usuario.");
    }

    return user;
  },

  async signOut() {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
  },
};
