const PROFILE_EMAIL_DOMAIN = "usuarios.pizzaandroll.app";
const LEGACY_PROFILE_EMAIL_DOMAIN = "perfil.local";

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

export function profileNameToEmailCandidates(profileName: string) {
  const normalizedProfileName = normalizeProfileName(profileName);

  return [
    `${normalizedProfileName}@${PROFILE_EMAIL_DOMAIN}`,
    `${normalizedProfileName}@${LEGACY_PROFILE_EMAIL_DOMAIN}`,
  ];
}

export function emailToProfileName(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  for (const domain of [PROFILE_EMAIL_DOMAIN, LEGACY_PROFILE_EMAIL_DOMAIN]) {
    if (normalizedEmail.endsWith(`@${domain}`)) {
      return normalizedEmail.replace(`@${domain}`, "");
    }
  }

  return normalizedEmail.split("@")[0] ?? normalizedEmail;
}
