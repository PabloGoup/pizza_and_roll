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

export function useDeleteUser(actor: AppUser) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => usersService.deleteUser(userId, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useResetUserPassword(actor: AppUser) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ user, password }: { user: AppUser; password: string }) =>
      usersService.resetUserPassword(user, password, actor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}
