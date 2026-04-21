import { useQuery } from "@tanstack/react-query";

import { storefrontService } from "@/features/storefront/services/storefront-service";

const storefrontKeys = {
  settings: ["storefront", "settings"] as const,
  deliveryZones: ["storefront", "delivery-zones"] as const,
  promotions: ["storefront", "promotions"] as const,
};

export function useStoreSettings() {
  return useQuery({
    queryKey: storefrontKeys.settings,
    queryFn: storefrontService.getStoreSettings,
  });
}

export function useDeliveryZones() {
  return useQuery({
    queryKey: storefrontKeys.deliveryZones,
    queryFn: storefrontService.listDeliveryZones,
  });
}

export function useStorefrontPromotions() {
  return useQuery({
    queryKey: storefrontKeys.promotions,
    queryFn: storefrontService.listPromotions,
  });
}
