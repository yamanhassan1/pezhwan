interface AuditBarProps {
  data: Array<{ label: string; count: number }>;
  height?: number;
}

export default function AuditChart({ data, height = 100 }: AuditBarProps) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="bar-chart" style={{ height }}>
      {data.map((d) => (
        <div
          key={d.label}
          className="bar"
          style={{ height: `${Math.max(4, (d.count / max) * (height - 24))}px` }}
        >
          <span className="bar-value">{d.count}</span>
          <span className="bar-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}