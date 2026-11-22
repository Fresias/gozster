import { StudioSankeyView } from "@/components/coach/studio-sankey-view";
import { createClient } from "@/lib/supabase/server";
import { crearKpisNegocioVacios, obtenerKpisNegocio, type KpisNegocio } from "@/lib/kpis-negocio";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Flujo de Facturación & Cobranza | Coach Studio GOZSter",
  description: "Visualización interactiva estilo Sankey de facturación potencial, efectividad de cobranza y mora.",
};

export default async function StudioIngresosPage() {
  const supabase = await createClient();
  const authUser = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  let userRole: string = "ENTRENADOR";
  if (authUser?.data?.user) {
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("rol")
      .eq("id", authUser.data.user.id)
      .maybeSingle();
    if (perfil?.rol) {
      userRole = perfil.rol;
    }
  }

  let kpis: KpisNegocio = crearKpisNegocioVacios(userRole);
  try {
    const liveKpis = await obtenerKpisNegocio(supabase, { rol: userRole });
    if (liveKpis) {
      kpis = liveKpis;
    }
  } catch {
    // Mantener KPIs en cero si no hay datos o falla la consulta
  }

  return <StudioSankeyView kpis={kpis} isLiveMode={true} />;
}

