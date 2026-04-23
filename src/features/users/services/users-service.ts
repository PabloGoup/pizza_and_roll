import { createAuditLog } from "@/lib/supabase/audit";
import { emailToProfileName, normalizeProfileName, profileNameToEmail } from "@/lib/profile-auth";
import {
  createTransientSupabaseClient,
  getSupabaseClient,
  getSupabaseConfig,
} from "@/lib/supabase/client";
import type { AppUser, UserFormData } from "@/types/domain";

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
      .in("role", ["administrador", "cajero"])
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

  async resetUserPassword(user: AppUser, password: string, actor: AppUser) {
    const supabase = getSupabaseClient();
    const { url, anonKey } = getSupabaseConfig();
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

    const invokeReset = async (accessToken: string) => {
      const response = await fetch(`${url}/functions/v1/admin-reset-user-password`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          password,
        }),
      });

      const payload = await response
        .json()
        .catch(async () => ({ error: await response.text().catch(() => "") }));

      return {
        ok: response.ok,
        status: response.status,
        payload,
      };
    };

    let session = await readCurrentSession();

    if (!session?.access_token) {
      throw new Error("La sesión del administrador expiró. Vuelve a iniciar sesión.");
    }

    let result = await invokeReset(session.access_token);

    if (result.status === 401) {
      session = await resolveSession();

      if (!session?.access_token) {
        throw new Error("La sesión del administrador expiró. Vuelve a iniciar sesión.");
      }

      result = await invokeReset(session.access_token);
    }

    if (!result.ok) {
      if (result.status === 401) {
        throw new Error("La sesión del administrador ya no es válida. Vuelve a iniciar sesión.");
      }

      if (typeof result.payload?.error === "string" && result.payload.error.trim().length > 0) {
        throw new Error(result.payload.error);
      }

      throw new Error("No se pudo restablecer la contraseña.");
    }

    await createAuditLog({
      module: "usuarios",
      action: "restablecer_clave",
      detail: `Restablecimiento de contraseña para ${user.fullName}`,
      actor,
      previousValue: {
        userId: user.id,
        profileName: user.profileName,
      },
      newValue: {
        userId: user.id,
        profileName: user.profileName,
        updated: true,
        providerResponse: result.payload ?? null,
      },
    });

    return true;
  },
};
