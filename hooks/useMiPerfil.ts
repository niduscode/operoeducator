"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  limit,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { INSTRUCTORES_COLLECTION } from "@/lib/firestore";
import type { Instructor } from "@/lib/types";

interface UseMiPerfilReturn {
  perfil: Instructor | null;
  isLoading: boolean;
  error: string | null;
}

// Devuelve el perfil del instructor logueado a partir de su email Firebase Auth.
// Para director y admin retorna null (no son instructores).
// La suscripción es reactiva: si el director reasigna la sucursal, el dashboard
// del instructor se actualiza al instante sin recargar.
export function useMiPerfil(): UseMiPerfilReturn {
  const { userEmail, userRole, isLoading: authLoading } = useAuth();
  const [perfil, setPerfil] = useState<Instructor | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Esperamos a que useAuth termine de hidratar.
    if (authLoading) {
      setIsLoading(true);
      return;
    }

    // No-instructores no tienen perfil que cargar.
    if (userRole !== "instructor" || !userEmail) {
      setPerfil(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const q = query(
      collection(db, INSTRUCTORES_COLLECTION),
      where("email", "==", userEmail),
      limit(1)
    );

    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        if (snap.empty) {
          setPerfil(null);
        } else {
          const d = snap.docs[0];
          const data = d.data();
          setPerfil({
            id: d.id,
            username: data.username ?? "",
            email: data.email ?? "",
            nombreCompleto: data.nombreCompleto ?? "",
            telefono: data.telefono ?? "",
            sucursalActual: data.sucursalActual,
            activo: data.activo ?? true,
            fechaIngreso: data.fechaIngreso ?? "",
            fechaCreacion: data.fechaCreacion ?? "",
            creadoPor: data.creadoPor ?? "",
            authVerificado: data.authVerificado ?? false,
          });
        }
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("useMiPerfil onSnapshot:", err);
        setError("No se pudo cargar tu perfil de instructor.");
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [userEmail, userRole, authLoading]);

  return useMemo(
    () => ({ perfil, isLoading, error }),
    [perfil, isLoading, error]
  );
}
