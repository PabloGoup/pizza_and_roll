// Serialize cancellation with submissions. Failed or unacknowledged requests block printing.
export async function synchronizeCancellations({ rpc, credentials, cancel, log }) {
  const requests = await rpc("poll_print_cancellations", credentials);
  for (const request of requests ?? []) {
    try {
      await cancel(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await rpc("ack_print_cancellation", {
        ...credentials, p_request_id: request.id, p_error: message,
      });
      await log("error", "Limpieza de cola pendiente", { requestId: request.id, error: message });
      return false;
    }
    await rpc("ack_print_cancellation", {
      ...credentials, p_request_id: request.id, p_error: null,
    });
    await log("info", "Cola del sistema limpiada", { requestId: request.id, printer: request.printerName });
  }
  return true;
}
