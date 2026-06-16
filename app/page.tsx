"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading, login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Si el usuario ya tiene sesión activa, lo mandamos al dashboard.
  // Esto cubre tanto "ya estaba logueado al entrar" como "acaba de hacer login OK".
  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/dashboard");
    }
  }, [user, isLoading, router]);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError("Conectando...");
    setIsSubmitting(true);
    try {
      await login(username, password);
      // El redirect ocurre en el useEffect cuando user deja de ser null.
    } catch {
      setAuthError("Error: Usuario o contraseña incorrectos.");
      setIsSubmitting(false);
    }
  };

  // Spinner mientras resolvemos la sesión inicial (mismo diseño que el v1)
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 w-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-4 w-full">
      <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-2xl shadow-slate-200/50 w-full max-w-[400px] flex flex-col items-center">
        {/* Logo: cuadrado con gradiente brand -> accent, icono de academia */}
        <div className="w-16 h-16 bg-gradient-to-tr from-brand-500 to-accent-400 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/30 mb-5">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-slate-900"
          >
            <path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72l5 2.73 5-2.73v3.72z" />
          </svg>
        </div>

        {/* Título estilizado: "Opero" light + "Educator" bold */}
        <h1 className="text-2xl tracking-tight text-slate-900 mb-8">
          <span className="font-light">Opero</span>
          <span className="font-bold">Educator</span>
        </h1>

        <form onSubmit={handleLogin} className="w-full space-y-4">
          <Input
            variant="login"
            type="text"
            name="username"
            placeholder="Usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={isSubmitting}
          />
          {/* Wrapper con icono ojo para alternar visibilidad. El input nativo
              lo dejamos custom (no usamos Input genérico) para poder posicionar
              el botón en absolute sin romper el layout del componente. */}
          <div className="relative">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isSubmitting}
              className="w-full bg-white p-4 pr-12 rounded-2xl border border-slate-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20 outline-none transition-all text-slate-900 text-sm placeholder:text-slate-400 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              disabled={isSubmitting}
              aria-label={
                showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
              }
              aria-pressed={showPassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-50"
            >
              {showPassword ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          {/* Caja rosa para errores de autenticación (y estado "Conectando...") */}
          {authError && (
            <div className="p-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-bold text-center">
              {authError}
            </div>
          )}

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
              className="w-full !py-4 text-base font-bold shadow-brand-500/40 hover:shadow-brand-500/60"
            >
              Entrar al Sistema
            </Button>
          </div>
        </form>

        <div className="mt-8">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Nube Conectada
          </p>
        </div>
      </div>
    </div>
  );
}
