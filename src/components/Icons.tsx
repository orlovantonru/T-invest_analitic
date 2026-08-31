interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const base = (size: number, style?: React.CSSProperties): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  style,
});

export const ChevronDown = ({ size = 10, style }: IconProps) => (
  <svg {...base(size, style)} strokeWidth={2.5}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const ChevronLeft = ({ size = 20, style }: IconProps) => (
  <svg {...base(size, style)} strokeWidth={2.2}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export const Check = ({ size = 18, style }: IconProps) => (
  <svg {...base(size, style)} stroke="var(--color-accent-700)" strokeWidth={2.2}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const ListIcon = ({ size = 13, style }: IconProps) => (
  <svg {...base(size, style)} strokeWidth={2}>
    <path d="M3 6h18M6 12h12M10 18h4" />
  </svg>
);

export const Calendar = ({ size = 12, style }: IconProps) => (
  <svg {...base(size, style)} strokeWidth={2}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

export const NavOverview = ({ size = 21 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
  </svg>
);
export const NavHoldings = ({ size = 21 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);
export const NavAllocation = ({ size = 21 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
);
export const NavPerformance = ({ size = 21 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
    <path d="M16 7h6v6" />
  </svg>
);
export const NavHistory = ({ size = 21 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </svg>
);
