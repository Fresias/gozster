import { StudioSankeyView } from "@/components/coach/studio-sankey-view";
import { CANONICAL_SANKEY_DATA } from "@/components/coach/studio-sankey-modal";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Flujo de Facturación & Cobranza | Coach Studio GOZSter",
  description: "Visualización interactiva estilo Sankey de facturación potencial, efectividad de cobranza y mora.",
};

export default function StudioIngresosPage() {
  return <StudioSankeyView initialData={CANONICAL_SANKEY_DATA} />;
}
