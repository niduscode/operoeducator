"use client";

import { useEffect, useState, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { UserRole, determineRole, usernameToEmail } from "@/lib/types";

interface UseAuthReturn {
  user: User | null;
  userRole: UserRole | null;
  userEmail: string;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Suscripción al estado de autenticación de Firebase.
  // Se ejecuta una sola vez y se limpia al desmontar.
  useEffect(() => {
    let resolved = false;

    // Red de seguridad: si Firebase Auth no resuelve en 5s (red lenta,
    // IndexedDB colgado, túnel HTTPS con problemas), tratamos al usuario
    // como no autenticado en vez de quedarnos en loading infinito.
    const timeoutId = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      console.warn("useAuth: timeout 5s sin resolver sesión, asumiendo no autenticado");
      setUser(null);
      setUserEmail("");
      setUserRole(null);
      setIsLoading(false);
    }, 5000);

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      resolved = true;
      clearTimeout(timeoutId);
      if (firebaseUser) {
        const email = firebaseUser.email ?? "";
        // El rol se deriva del username (parte antes de @) contra DIRECTORES/ADMINS.
        setUser(firebaseUser);
        setUserEmail(email);
        setUserRole(determineRole(email));
      } else {
        setUser(null);
        setUserEmail("");
        setUserRole(null);
      }
      setIsLoading(false);
    });

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    // El usuario escribe solo su username (ej. "director.christan");
    // usernameToEmail le agrega el dominio interno para Firebase Auth.
    const email = usernameToEmail(username.trim());
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  return {
    user,
    userRole,
    userEmail,
    isLoading,
    login,
    logout,
  };
}
