type FunctionErrorWithContext = {
  message?: string;
  context?: Response;
};

export async function getFunctionErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  const functionError = error as FunctionErrorWithContext | null;
  const response = functionError?.context;

  if (response instanceof Response) {
    try {
      const payload = await response.clone().json() as { error?: string; message?: string };
      const detail = payload.error ?? payload.message;
      if (detail) return detail;
    } catch {
      try {
        const detail = await response.clone().text();
        if (detail.trim()) return detail.trim();
      } catch {
        // Conserva el mensaje original si el cuerpo no está disponible.
      }
    }
  }

  return functionError?.message || fallback;
}
