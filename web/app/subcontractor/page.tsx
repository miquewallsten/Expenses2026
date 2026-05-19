"use client";

import { useEffect, useState } from "react";
import { HardHat, LogIn } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { getStoredSession } from "@/lib/session";

/**
 * Subcontractor portal page.
 *
 * Redirects authenticated subcontractor users to /mywork?module=subcontractors.
 * Shows a login/invite screen for unauthenticated subcontractors.
 */
export default function SubcontractorPortalPage() {
  const t = useTranslations("subcontractor");
  const router = useRouter();
  const params = useSearchParams();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const session = getStoredSession();
    if (session) {
      // Already logged in - go to mywork with subcontractor module
      router.replace("/mywork?module=subcontractors");
      return;
    }
    setChecking(false);
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  // Subcontractor invite token flow
  const token = params.get("token");

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0 p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-default bg-surface-1 p-6">
          {/* Header */}
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
              <HardHat className="h-7 w-7 text-accent" />
            </div>
            <h1 className="text-lg font-bold text-primary">Portal de Subcontratistas</h1>
            <p className="mt-1 text-xs text-tertiary">
              Gestiona tus facturas, valida CFDI y consulta el estado de tus pagos.
            </p>
          </div>

          {/* Invite token message */}
          {token ? (
            <div className="space-y-3">
              <p className="text-center text-xs text-secondary">
                Verificando invitación...
              </p>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
              >
                <LogIn className="h-4 w-4" />
                Acceder con invitación
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <a
                href="/login"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
              >
                <LogIn className="h-4 w-4" />
                Iniciar sesión
              </a>
              <p className="text-center text-[10px] text-muted">
                ¿No tienes acceso? Solicita una invitación a tu contacto en la empresa.
              </p>
            </div>
          )}

          {/* Features */}
          <div className="mt-6 space-y-2">
            {[
              { label: "Facturas CFDI", desc: "Sube y valida comprobantes fiscales" },
              { label: "Estado de pagos", desc: "Consulta el estatus de tus facturas en tiempo real" },
              { label: "Retenciones", desc: "ISR e IVA calculados automáticamente" },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-2 rounded-lg border border-default bg-surface-0 p-2.5">
                <div className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <div>
                  <p className="text-[11px] font-medium text-secondary">{item.label}</p>
                  <p className="text-[9px] text-tertiary">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
