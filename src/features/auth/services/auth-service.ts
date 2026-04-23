import { FunctionsHttpError } from "@supabase/supabase-js";

import { emailToProfileName, profileNameToEmail } from "@/lib/profile-auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { AppUser } from "@/types/domain";

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: "administrador" | "cajero" | "cliente";
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

function buildLoginCandidates(identifier: string) {
  const normalizedIdentifier = identifier.trim().toLowerCase();

  if (!normalizedIdentifier) {
    return [];
  }

  const candidates = new Set<string>();

  if (normalizedIdentifier.includes("@")) {
    candidates.add(normalizedIdentifier);
    candidates.add(profileNameToEmail(emailToProfileName(normalizedIdentifier)));
  } else {
    candidates.add(profileNameToEmail(normalizedIdentifier));
  }

  return Array.from(candidates);
}

export const authService = {
  async getCurrentUser() {
    const supabase = getSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      const normalizedMessage = authError.message.toLowerCase();

      if (
        normalizedMessage.includes("session") ||
        normalizedMessage.includes("jwt") ||
        normalizedMessage.includes("token")
      ) {
        await supabase.auth.signOut().catch(() => undefined);
        return null;
      }

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
    const loginCandidates = buildLoginCandidates(profileName);
    let lastError: Error | null = null;

    for (const email of loginCandidates) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!error) {
        const user = await authService.getCurrentUser();

        if (!user) {
          throw new Error("No se pudo validar el perfil del usuario.");
        }

        return user;
      }

      lastError = error;
    }

    throw new Error(lastError?.message || "Credenciales inválidas o usuario sin acceso.");
  },

  async signUpCustomer({
    fullName,
    email,
    password,
  }: {
    fullName: string;
    email: string;
    password: string;
  }) {
    const supabase = getSupabaseClient();
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          role: "cliente",
        },
      },
    });

    if (error) {
      throw new Error(error.message || "No se pudo crear la cuenta.");
    }

    if (!data.session) {
      return {
        user: null,
        requiresEmailVerification: true,
      };
    }

    const user = await authService.getCurrentUser();

    if (!user) {
      throw new Error("La cuenta fue creada, pero no se pudo validar la sesión.");
    }

    return {
      user,
      requiresEmailVerification: false,
    };
  },

  async signOut() {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
  },

  async updateCurrentProfile({ fullName }: { fullName: string }) {
    const supabase = getSupabaseClient();
    const normalizedFullName = fullName.trim();
    const readCurrentSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      return session ?? null;
    };

    const resolveSession = async () => {
      const refreshed = await supabase.auth.refreshSession();

      if (refreshed.error) {
        return readCurrentSession();
      }

      return refreshed.data.session ?? null;
    };

    const invokeProfileUpdate = async (accessToken: string) =>
      supabase.functions.invoke("update-own-profile", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: {
          fullName: normalizedFullName,
        },
      });

    let session = await readCurrentSession();

    if (!session?.access_token) {
      throw new Error("Tu sesión expiró. Vuelve a iniciar sesión para guardar cambios.");
    }

    const directUpdateResult = await supabase
      .from("profiles")
      .update({
        full_name: normalizedFullName,
      })
      .eq("id", session.user.id)
      .select("*")
      .single();

    if (!directUpdateResult.error && directUpdateResult.data) {
      return mapProfileToUser(directUpdateResult.data as ProfileRow);
    }

    const directUpdateMessage = directUpdateResult.error?.message?.toLowerCase() ?? "";
    const canFallbackToEdgeFunction =
      directUpdateMessage.includes("row-level security") ||
      directUpdateMessage.includes("permission denied") ||
      directUpdateResult.error?.code === "42501";

    if (directUpdateResult.error && !canFallbackToEdgeFunction) {
      throw new Error(directUpdateResult.error.message || "No se pudo actualizar el perfil.");
    }

    let { data, error } = await invokeProfileUpdate(session.access_token);

    if (error instanceof FunctionsHttpError && error.context.status === 401) {
      session = await resolveSession();

      if (!session?.access_token) {
        throw new Error("Tu sesión expiró. Vuelve a iniciar sesión para guardar cambios.");
      }

      const retryResult = await invokeProfileUpdate(session.access_token);
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error) {
      if (error instanceof FunctionsHttpError) {
        const payload = await error.context
          .json()
          .catch(async () => ({ error: await error.context.text().catch(() => "") }));

        if (error.context.status === 401) {
          throw new Error("Tu sesión expiró o dejó de ser válida. Vuelve a iniciar sesión.");
        }

        if (typeof payload?.error === "string" && payload.error.trim().length > 0) {
          throw new Error(payload.error);
        }
      }

      const normalizedMessage = error.message?.toLowerCase() ?? "";

      if (normalizedMessage.includes("failed to send a request to the edge function")) {
        throw new Error(
          "La función para actualizar el perfil no está disponible todavía. Hay que desplegarla en Supabase.",
        );
      }

      if (normalizedMessage.includes("non-2xx")) {
        throw new Error(
          "La función rechazó la actualización del perfil. Cierra sesión y vuelve a ingresar.",
        );
      }

      throw new Error(error.message || "No se pudo actualizar el perfil.");
    }

    const user = await authService.getCurrentUser();

    if (!user) {
      throw new Error("El perfil se actualizó, pero no se pudo refrescar la sesión.");
    }

    return {
      ...user,
      fullName: String(data?.fullName ?? user.fullName),
    };
  },

  async updatePassword(password: string) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      throw new Error(error.message || "No se pudo actualizar la contraseña.");
    }
  },
};
