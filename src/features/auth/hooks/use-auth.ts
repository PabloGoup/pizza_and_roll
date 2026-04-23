import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { authService } from "@/features/auth/services/auth-service";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth-store";

const authKeys = {
  currentUser: ["auth", "current-user"] as const,
};

export function useCurrentUser() {
  const queryClient = useQueryClient();
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

  useEffect(() => {
    if (query.isError) {
      setCurrentUser(null);
      queryClient.setQueryData(authKeys.currentUser, null);
    }
  }, [query.isError, queryClient, setCurrentUser]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setCurrentUser(null);
        queryClient.setQueryData(authKeys.currentUser, null);
        return;
      }

      queryClient.invalidateQueries({ queryKey: authKeys.currentUser });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient, setCurrentUser]);

  return query;
}

export function useSignIn() {
  const queryClient = useQueryClient();
  const setCurrentUser = useAuthStore((state) => state.setCurrentUser);

  return useMutation({
    mutationFn: ({ profileName, password }: { profileName: string; password: string }) =>
      authService.signIn(profileName, password),
    onSuccess: (user) => {
      setCurrentUser(user);
      queryClient.setQueryData(authKeys.currentUser, user);
    },
  });
}

export function useSignUpCustomer() {
  const queryClient = useQueryClient();
  const setCurrentUser = useAuthStore((state) => state.setCurrentUser);

  return useMutation({
    mutationFn: ({
      fullName,
      email,
      password,
    }: {
      fullName: string;
      email: string;
      password: string;
    }) => authService.signUpCustomer({ fullName, email, password }),
    onSuccess: (result) => {
      if (!result.user) {
        return;
      }

      setCurrentUser(result.user);
      queryClient.setQueryData(authKeys.currentUser, result.user);
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

export function useUpdateCurrentProfile() {
  const queryClient = useQueryClient();
  const setCurrentUser = useAuthStore((state) => state.setCurrentUser);

  return useMutation({
    mutationFn: ({ fullName }: { fullName: string }) =>
      authService.updateCurrentProfile({ fullName }),
    onSuccess: (user) => {
      setCurrentUser(user);
      queryClient.setQueryData(authKeys.currentUser, user);
    },
  });
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: (password: string) => authService.updatePassword(password),
  });
}
