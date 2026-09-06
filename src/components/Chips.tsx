// Горизонтальный ряд чипов-фильтров (Состав, История). Активный подсвечен.
interface Chip {
  key: string;
  label: string;
}

interface ChipRowProps {
  chips: readonly Chip[];
  active: string;
  onSelect: (key: string) => void;
  trailing?: React.ReactNode;
}

export function ChipRow({ chips, active, onSelect, trailing }: ChipRowProps) {
  return (
    <div className="chip-row" style={{ marginBottom: 12 }}>
      {chips.map((c) => (
        <button
          key={c.key}
          className={"chip" + (active === c.key ? " active" : "")}
          onClick={() => onSelect(c.key)}
        >
          {c.label}
        </button>
      ))}
      {trailing}
    </div>
  );
}
