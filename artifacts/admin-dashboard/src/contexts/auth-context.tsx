import { createContext, useContext, useState } from "react";
import {
  AdminUser,
  getAdminUsers,
  getAdminUserById,
} from "@/lib/store";

const AUTH_KEY     = "onesoft-admin-auth";
const AUTH_USER_ID = "onesoft-admin-user-id";

type AuthContextType = {
  isAuthenticated: boolean;
  currentUser: AdminUser | null;
  isSuperAdmin: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  refreshCurrentUser: () => void;
};

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  currentUser: null,
  isSuperAdmin: false,
  login: () => false,
  logout: () => {},
  refreshCurrentUser: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(() => {
    try {
      const isAuth = sessionStorage.getItem(AUTH_KEY) === "true";
      const userId  = sessionStorage.getItem(AUTH_USER_ID);
      if (!isAuth || !userId) return null;
      return getAdminUserById(userId) ?? null;
    } catch {
      return null;
    }
  });

  const isAuthenticated = currentUser !== null;
  const isSuperAdmin    = currentUser?.role === "superadmin";

  const login = (username: string, password: string): boolean => {
    const users = getAdminUsers();
    const user  = users.find(
      u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );
    if (user) {
      sessionStorage.setItem(AUTH_KEY, "true");
      sessionStorage.setItem(AUTH_USER_ID, user.id);
      setCurrentUser(user);
      return true;
    }
    return false;
  };

  const logout = () => {
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_USER_ID);
    setCurrentUser(null);
  };

  const refreshCurrentUser = () => {
    const userId = sessionStorage.getItem(AUTH_USER_ID);
    if (userId) setCurrentUser(getAdminUserById(userId) ?? null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, currentUser, isSuperAdmin, login, logout, refreshCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
