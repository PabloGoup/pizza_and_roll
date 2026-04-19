import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { authService } from "@/features/auth/services/auth-service";
import { useAuthStore } from "@/stores/auth-store";

const authKeys = {
  currentUser: ["auth", "current-user"] as const,
};

export function useCurrentUser() {
  const setCurrentUser = useAuthStore((state) => state.setCurrentUser);

  const query = useQuery({
    queryKey: authKeys.currentUser,
    queryFn: authService.getCurrentUser,
    retry: false,
  });

  useEffect(() => {
    if (query.data !== undefined) {
      setCurrentUser(query.data);
    }
  }, [query.data, setCurrentUser]);

  return query;
}

export function useSignIn() {
  const queryClient = useQueryClient();
  const setCurrentUser = useAuthStore((state) => state.setCurrentUser);

  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authService.signIn(email, password),
    onSuccess: (user) => {
      setCurrentUser(user);
      queryClient.setQueryData(authKeys.currentUser, user);
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const setCurrentUser = useAuthStore((state) => state.setCurrentUser);

  return useMutation({
    mutationFn: authService.signOut,
    onSuccess: () => {
      setCurrentUser(null);
      queryClient.setQueryData(authKeys.currentUser, null);
    },
  });
}
