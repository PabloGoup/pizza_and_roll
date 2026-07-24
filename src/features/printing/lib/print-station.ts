const PRINT_STATION_KEY = "pizza-roll:print-station";

export function getSelectedPrintStationId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PRINT_STATION_KEY);
}

export function selectPrintStation(agentId: string) {
  window.localStorage.setItem(PRINT_STATION_KEY, agentId);
}

export function clearSelectedPrintStation(agentId?: string) {
  if (
    !agentId ||
    window.localStorage.getItem(PRINT_STATION_KEY) === agentId
  ) {
    window.localStorage.removeItem(PRINT_STATION_KEY);
  }
}
