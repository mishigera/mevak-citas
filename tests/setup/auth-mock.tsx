/**
 * Sustituto de `@/contexts/auth` para los tests de pantallas.
 *
 * Las pantallas no deben depender de la lógica real de sesión: esa ya tiene sus propios
 * tests en `tests/unit/auth-context.test.tsx`. Aquí solo interesa poder decir
 * "esta pantalla la está viendo una RECEPCIONISTA" y comprobar qué se pinta.
 *
 * El estado cuelga de globalThis para sobrevivir a `jest.resetModules()`.
 */
import React from "react";

export type Role = "ADMIN" | "OWNER" | "RECEPTION" | "FACIALIST";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

type Estado = {
  user: AuthUser | null;
  isLoading: boolean;
  login: jest.Mock;
  logout: jest.Mock;
};

const g = globalThis as { __mockAuthState?: Estado };

function estado(): Estado {
  g.__mockAuthState ??= {
    user: null,
    isLoading: false,
    login: jest.fn(async () => {}),
    logout: jest.fn(async () => {}),
  };
  return g.__mockAuthState;
}

/** Define quién está usando la app. `null` = sesión cerrada. */
export function __setAuthUser(user: AuthUser | null) {
  estado().user = user;
}

export function __setAuthLoading(isLoading: boolean) {
  estado().isLoading = isLoading;
}

export function __resetAuth() {
  const e = estado();
  e.user = null;
  e.isLoading = false;
  e.login.mockClear();
  e.logout.mockClear();
}

/** Acceso a los espías de login/logout desde el test. */
export function __authSpies() {
  const e = estado();
  return { login: e.login, logout: e.logout };
}

export function useAuth() {
  const e = estado();
  const role = e.user?.role;

  return {
    user: e.user,
    isLoading: e.isLoading,
    login: e.login,
    logout: e.logout,
    canViewClinical: role === "ADMIN" || role === "OWNER",
    canManageServices: role === "ADMIN",
    canViewReports: role === "ADMIN" || role === "OWNER",
    canCreateBlocks: role === "ADMIN" || role === "OWNER" || role === "FACIALIST",
    isOwnerOrAdmin: role === "ADMIN" || role === "OWNER",
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
