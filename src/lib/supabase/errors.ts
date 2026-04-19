type SupabaseErrorLike = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

export function formatSupabaseError(
  baseMessage: string,
  error: SupabaseErrorLike | null | undefined,
) {
  if (!error) {
    return baseMessage;
  }

  const details = [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" | ");

  return details ? `${baseMessage} ${details}` : baseMessage;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
