import { publishableMetrics } from "./select";
import { styles } from "./styles";
import type { EpkMetric } from "./types";

export type EpkMetricsProps = {
  metrics: readonly EpkMetric[];
  id?: string;
};

/**
 * Numeri inseriti manualmente (L0.7 §5): solo etichetta e valore.
 *
 * Il valore resta una stringa perché l'artista scrive “1,2 M” o “48 date”:
 * nessuna formattazione, nessuna unità aggiunta, nessun numero inventato.
 * Una riga con etichetta o valore vuoti non si rende.
 */
export function EpkMetrics({ metrics, id = "epk" }: EpkMetricsProps) {
  const published = publishableMetrics(metrics);
  if (published.length === 0) return null;
  const headingId = `${id}-numeri`;

  return (
    <div style={styles.section}>
      <h2 id={headingId} style={styles.heading}>
        Numeri
      </h2>
      <dl style={styles.metrics}>
        {published.map((metric) => (
          <div key={metric.id}>
            <dt style={styles.metricLabel}>{metric.label.trim()}</dt>
            <dd style={styles.metricValue}>{metric.value.trim()}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
