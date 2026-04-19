import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { usersService } from "@/features/users/services/users-service";
import type { AppUser, UserFormData } from "@/types/domain";

const userKeys = {
  all: ["users"] as const,
};

export function useUsers() {
  return useQuery({
    queryKey: userKeys.all,
    queryFn: usersService.listUsers,
  });
}

export function useSaveUser(actor: AppUser) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UserFormData) => usersService.saveUser(payload, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}
