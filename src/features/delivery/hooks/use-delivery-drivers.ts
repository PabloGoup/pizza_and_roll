import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth-store";

export type DeliveryDriver = { id: string; full_name: string };

export function useDeliveryDrivers(enabled = true) {
  const userId = useAuthStore((state) => state.currentUser?.id);
  return useQuery({
    queryKey: ["dispatch", "drivers", userId],
    enabled: enabled && !!userId,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().rpc("list_delivery_drivers");
      if (error) throw new Error(error.message);
      return data as unknown as DeliveryDriver[];
    },
    refetchInterval: 30000,
  });
}
