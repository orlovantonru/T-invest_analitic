interface SparklineProps {
  points: string;
  color: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
}

export function Sparkline({
  points,
  color,
  width = 56,
  height = 24,
  strokeWidth = 1.6,
}: SparklineProps) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ flex: "none" }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
