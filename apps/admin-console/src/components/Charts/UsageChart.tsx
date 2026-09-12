interface UsageSeries {
  label: string;
  values: Array<{ label: string; value: number }>;
}

export default function UsageChart({ series, height = 120 }: { series: UsageSeries[]; height?: number }) {
  if (series.length === 0) {
    return <div className="empty-state">No usage data</div>;
  }
  const allValues = series.flatMap((s) => s.values.map((v) => v.value));
  const max = Math.max(1, ...allValues);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {series.map((s) => (
        <div key={s.label}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{s.label}</div>
          <div className="bar-chart" style={{ height }}>
            {s.values.map((v) => (
              <div key={v.label} className="bar" style={{ height: `${Math.max(4, (v.value / max) * (height - 24))}px` }}>
                <span className="bar-value">{v.value}</span>
                <span className="bar-label">{v.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}