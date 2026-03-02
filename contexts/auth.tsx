import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, setAuthToken, getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";

export type Role = "ADMIN" | "OWNER" | "RECEPTION" | "FACIALIST";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  canViewClinical: boolean;
  canManageServices: boolean;
  canViewReports: boolean;
  canCreateBlocks: boolean;
  isOwnerOrAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const storedToken = await AsyncStorage.getItem("auth_token");
      const storedUser = await AsyncStorage.getItem("auth_user");
      if (storedToken && storedUser) {
        setAuthToken(storedToken);
        const baseUrl = getApiUrl();
        const url = new URL("/api/auth/me", baseUrl);
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        if (res.ok) {
          const data = await res.json() as AuthUser;
          setUser(data);
          await AsyncStorage.setItem("auth_user", JSON.stringify(data));
        } else {
          setAuthToken(null);
          await AsyncStorage.removeItem("auth_token");
          await AsyncStorage.removeItem("auth_user");
        }
      }
    } catch {
      setAuthToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json() as { token: string } & AuthUser;
    setAuthToken(data.token);
    const userData: AuthUser = { id: data.id, name: data.name, email: data.email, role: data.role };
    setUser(userData);
    await AsyncStorage.setItem("auth_token", data.token);
    await AsyncStorage.setItem("auth_user", JSON.stringify(userData));
  };

  const logout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout", {});
    } catch {}
    setAuthToken(null);
    setUser(null);
    await AsyncStorage.removeItem("auth_token");
    await AsyncStorage.removeItem("auth_user");
  };

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    login,
    logout,
    canViewClinical: user?.role === "ADMIN" || user?.role === "OWNER",
    canManageServices: user?.role === "ADMIN",
    canViewReports: user?.role === "ADMIN" || user?.role === "OWNER",
    canCreateBlocks: user?.role === "ADMIN" || user?.role === "OWNER" || user?.role === "FACIALIST",
    isOwnerOrAdmin: user?.role === "ADMIN" || user?.role === "OWNER",
  }), [user, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
