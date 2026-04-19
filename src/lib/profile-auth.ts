const PROFILE_EMAIL_DOMAIN = "perfil.local";

export function normalizeProfileName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export function profileNameToEmail(profileName: string) {
  return `${normalizeProfileName(profileName)}@${PROFILE_EMAIL_DOMAIN}`;
}

export function emailToProfileName(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail.endsWith(`@${PROFILE_EMAIL_DOMAIN}`)) {
    return normalizedEmail.replace(`@${PROFILE_EMAIL_DOMAIN}`, "");
  }

  return normalizedEmail.split("@")[0] ?? normalizedEmail;
}
