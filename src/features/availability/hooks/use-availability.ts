import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { availabilityService } from "@/features/availability/services/availability-service";

const operationalKey = ["availability", "operational"] as const;
const storefrontKey = ["availability", "storefront"] as const;

export function useOperationalAvailability(enabled = true) {
  return useQuery({
    queryKey: operationalKey,
    queryFn: availabilityService.getOperational,
    enabled,
    refetchInterval: 30_000,
  });
}

export function useStorefrontAvailability() {
  return useQuery({
    queryKey: storefrontKey,
    queryFn: availabilityService.getStorefront,
    refetchInterval: 30_000,
  });
}

function useInvalidateAvailability() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: operationalKey }),
      client.invalidateQueries({ queryKey: storefrontKey }),
      client.invalidateQueries({ queryKey: ["products"] }),
    ]);
}

export function useSetProductAvailability() {
  const invalidate = useInvalidateAvailability();
  return useMutation({
    mutationFn: ({ id, isSoldOut }: { id: string; isSoldOut: boolean }) =>
      availabilityService.setProduct(id, isSoldOut),
    onSuccess: invalidate,
  });
}

export function useSetIngredientAvailability() {
  const invalidate = useInvalidateAvailability();
  return useMutation({
    mutationFn: ({ id, isSoldOut }: { id: string; isSoldOut: boolean }) =>
      availabilityService.setIngredient(id, isSoldOut),
    onSuccess: invalidate,
  });
}
