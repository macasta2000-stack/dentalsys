// ============================================================
// FeatureGate — Bloquea secciones según el plan del tenant
// Uso: <FeatureGate feature="crm"> ... </FeatureGate>
// ============================================================
import { usePlanFeatures } from '../hooks/usePlanFeatures'
import UpgradePrompt from './UpgradePrompt'

export default function FeatureGate({ feature, fallback, children }) {
  const { hasFeature } = usePlanFeatures()

  if (hasFeature(feature)) return children

  return fallback ?? <UpgradePrompt feature={feature} />
}
