'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CurrentUser, LoginPayload } from '@csi/shared';
import { apiClient } from '@/lib/api-client';
import {
  setCurrentQueueUserId,
  quarantinePendingOperations,
  clearSyncedOperations,
} from '@/lib/offline-queue';

interface AuthContextType {
  user: CurrentUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<CurrentUser | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async (): Promise<CurrentUser | null> => {
    try {
      const current = await apiClient.get<CurrentUser>('/auth/me');
      setUser(current);
      setCurrentQueueUserId(current?.id ?? null);
      return current;
    } catch {
      setUser(null);
      setCurrentQueueUserId(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = async (payload: LoginPayload): Promise<CurrentUser> => {
    const res = await apiClient.post<{ message: string; user: CurrentUser }>('/auth/login', payload);
    setUser(res.user);
    setCurrentQueueUserId(res.user?.id ?? null);
    return res.user;
  };

  const logout = async (): Promise<void> => {
    const loggingOutUserId = user?.id;
    try {
      await apiClient.post('/auth/logout', {});
    } finally {
      if (loggingOutUserId) {
        try {
          await quarantinePendingOperations(loggingOutUserId);
          await clearSyncedOperations(loggingOutUserId);
        } catch {
          // Gracefully suppress storage cleanup errors during logout
        }
      }
      setUser(null);
      setCurrentQueueUserId(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

