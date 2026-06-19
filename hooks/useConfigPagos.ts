"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getConfigPagos, updateConfigPagos } from "@/lib/queries";
import type { ConfigPagos } from "@/lib/database.types";

interface UseConfigPagosReturn {
  config: ConfigPagos | null;
  isLoading: boolean;
  error: string | null;
  updateConfig: (patch: Partial<ConfigPagos>, actualizadoPor: string) => Promise<void>;
  // Compat: alias del componente /configuracion/pagos que usa la API vieja.
  // Recibe el ConfigPagos completo (no patch).
  save: (config: Partial<ConfigPagos>, actualizadoPor: string) => Promise<void>;
}

export function useConfigPagos(): UseConfigPagosReturn {
  const [config, setConfig] = useState<ConfigPagos | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number>(0);
  // ID único por instancia del hook para evitar colisión de nombre cuando
  // el hook se monta múltiples veces en la misma página (por ej. /pagos
  // lo llama desde usePagosInstructores Y usePagosProfesGuias). El cliente
  // Supabase reutiliza canales por nombre y rechaza .on() después de
  // .subscribe(), que es lo que crasheaba /pagos.
  const instanceId = useId();

  useEffect(() => {
    let cancelled = false;

    const fetchConfig = async () => {
      try {
        const data = await getConfigPagos();
        if (cancelled) return;
        setConfig(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("useConfigPagos fetch:", err);
        setConfig(null);
        setError("No se pudo cargar la configuración de pagos.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchConfig();

    const channel = supabase
      .channel(`config-pagos-default-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "config_pagos", filter: "id=eq.default" },
        () => {
          fetchConfig();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [nonce, instanceId]);

  const updateConfig = useCallback(
    async (patch: Partial<ConfigPagos>, actualizadoPor: string): Promise<void> => {
      await updateConfigPagos(patch, actualizadoPor);
      setNonce((n) => n + 1);
    },
    []
  );

  return useMemo(
    () => ({ config, isLoading, error, updateConfig, save: updateConfig }),
    [config, isLoading, error, updateConfig]
  );
}
