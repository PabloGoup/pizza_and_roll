import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey =
      Deno.env.get("EDGE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Faltan variables de entorno de Supabase para la función.");
    }

    if (!authorization) {
      return jsonResponse({ error: "No autorizado." }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();

    const {
      data: { user: requester },
      error: requesterError,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (requesterError || !requester) {
      return jsonResponse(
        { error: requesterError?.message || "No se pudo validar al usuario solicitante." },
        401,
      );
    }

    const { data: requesterProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role, is_active")
      .eq("id", requester.id)
      .single();

    if (
      profileError ||
      !requesterProfile ||
      !requesterProfile.is_active ||
      requesterProfile.role !== "administrador"
    ) {
      return jsonResponse({ error: "Solo un administrador puede crear usuarios." }, 403);
    }

    const body = await request.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const fullName = String(body?.fullName ?? "").trim();
    const role = String(body?.role ?? "");
    const isActive = body?.isActive !== false;
    const isInternalEmail = /^[a-z0-9._-]+@usuarios\.pizzaandroll\.app$/.test(email);

    if (
      !isInternalEmail ||
      password.length < 6 ||
      fullName.length < 3 ||
      !["administrador", "cajero"].includes(role)
    ) {
      return jsonResponse({ error: "Los datos del nuevo usuario no son válidos." }, 400);
    }

    const { data: createdAuth, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role },
      });

    if (createError || !createdAuth.user) {
      const message = createError?.message?.toLowerCase() ?? "";
      if (message.includes("already") || message.includes("registered")) {
        return jsonResponse({ error: "Ya existe un usuario con ese nombre de perfil." }, 409);
      }
      return jsonResponse({ error: createError?.message || "No se pudo crear el usuario." }, 400);
    }

    const { data: profile, error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        email,
        full_name: fullName,
        role,
        is_active: isActive,
      })
      .eq("id", createdAuth.user.id)
      .select("*")
      .single();

    if (updateError || !profile) {
      await supabaseAdmin.auth.admin.deleteUser(createdAuth.user.id);
      return jsonResponse(
        { error: "No se pudo completar el perfil. La creación fue revertida." },
        400,
      );
    }

    const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
      module: "usuarios",
      action: "crear",
      detail: `Creación del usuario interno ${fullName}`,
      performed_by: requester.id,
      previous_value: null,
      new_value: profile,
      reason: "Creado mediante función administrativa sin envío de correo.",
    });

    if (auditError) {
      await supabaseAdmin.auth.admin.deleteUser(createdAuth.user.id);
      return jsonResponse(
        { error: "No se pudo registrar la auditoría. La creación fue revertida." },
        500,
      );
    }

    return jsonResponse({ ok: true, profile }, 200);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "No se pudo crear el usuario." },
      500,
    );
  }
});
