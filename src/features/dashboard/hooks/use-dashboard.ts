import { useQuery } from "@tanstack/react-query";

import { dashboardService } from "@/features/dashboard/services/dashboard-service";
import type { DashboardRange } from "@/types/domain";

export function useDashboardMetrics(range?: DashboardRange) {
  return useQuery({
    queryKey: ["dashboard", "metrics", range?.from ?? "today", range?.to ?? "today"],
    queryFn: () => dashboardService.getMetrics(range),
  });
}
