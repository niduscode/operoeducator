"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import DirectorDashboard from "@/components/dashboard/DirectorDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import InstructorDashboard from "@/components/dashboard/InstructorDashboard";
import { useAuth } from "@/hooks/useAuth";

export default function DashboardPage() {
  const router = useRouter();
  const { user, userRole, isLoading, logout } = useAuth();

  // Si no hay sesión, regresamos al login
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/");
    }
  }, [user, isLoading, router]);

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  if (isLoading || !user || !userRole) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 w-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  const renderDashboard = () => {
    switch (userRole) {
      case "director":
        return <DirectorDashboard />;
      case "admin":
        return <AdminDashboard />;
      case "instructor":
        return <InstructorDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-end mb-4">
          <Button variant="outline" onClick={handleLogout}>
            Cerrar sesión
          </Button>
        </div>

        {renderDashboard()}
      </div>
    </div>
  );
}
