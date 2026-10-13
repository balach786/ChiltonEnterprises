import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, registerUnauthorizedHandler, request, tokenStore, ApiError } from './api';
import type { AuthUser, LoginResult, Permission } from './types';

interface AuthState {
  user: AuthUser | null;
  isReady: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  can: (...permissions: Permission[]) => boolean;
  setUser: (user: AuthUser) => void;
}

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = React.useState<AuthUser | null>(null);

  const me = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => request<AuthUser>({ url: '/api/auth/me', method: 'GET' }),
    enabled: Boolean(tokenStore.get()),
    retry: false,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (me.data) setUser(me.data);
    if (me.isError) setUser(null);
  }, [me.data, me.isError]);

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const response = await http.post<{ success: boolean; data: LoginResult }>('/api/auth/login', {
        email,
        password,
      });
      return response.data.data;
    },
    onSuccess: (result) => {
      tokenStore.set(result.accessToken);
      setUser({ ...result.user, _id: result.user.id });
      void queryClient.invalidateQueries();
    },
  });

  const logout = React.useCallback(() => {
    void http.post('/api/auth/logout').catch(() => undefined);
    tokenStore.set(null);
    setUser(null);
    void queryClient.clear();
  }, [queryClient]);

  React.useEffect(() => {
    registerUnauthorizedHandler(() => {
      tokenStore.set(null);
      setUser(null);
      void queryClient.clear();
    });
  }, [queryClient]);

  // The restored profile is used directly instead of waiting for the effect that mirrors it into
  // `user`. Without this there is exactly one render where the session check has finished but the
  // local state has not caught up, which used to bounce a signed-in user to /login on hard refresh.
  // `tokenStore` is checked so a logout (which clears the token) can never be undone by cached data.
  const effectiveUser = user ?? (tokenStore.get() ? me.data ?? null : null);

  const can = React.useCallback(
    (...permissions: Permission[]) => {
      if (!effectiveUser) return false;
      if (permissions.length === 0) return true;
      return permissions.some((permission) => effectiveUser.permissions.includes(permission));
    },
    [effectiveUser]
  );

  const value = React.useMemo<AuthState>(
    () => ({
      user: effectiveUser,
      isReady: !tokenStore.get() || me.isFetched || me.isError || !me.isLoading,
      isAuthenticated: Boolean(effectiveUser),
      login: (email, password) =>
        loginMutation
          .mutateAsync({ email, password })
          .then((result): AuthUser => ({ ...result.user, _id: result.user.id })),
      logout,
      can,
      setUser,
    }),
    [effectiveUser, me.isFetched, me.isError, me.isLoading, loginMutation, logout, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      request<{ message: string }>({ url: '/api/auth/change-password', method: 'POST', data: payload }),
  });
}

export function useApiError(error: unknown) {
  if (error instanceof ApiError) return error;
  return null;
}
