import { useQuery } from "@tanstack/react-query";

import { auditService } from "@/features/audit/services/audit-service";

export function useAuditEvents() {
  return useQuery({
    queryKey: ["audit"],
    queryFn: auditService.listAuditEvents,
  });
}
