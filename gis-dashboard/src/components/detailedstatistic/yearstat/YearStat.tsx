import React from "react";

interface YearStatProps {
  year: number | string;
  count: number;
  index?: number;
  onYearClick?: (year: number | string) => void;
  isActive?: boolean;
}

const YearStat: React.FC<YearStatProps> = ({
  year,
  count,
  index = 0,
  onYearClick,
  isActive = false,
}) => {
  const handleClick = () => {
    if (onYearClick) {
      onYearClick(year);
    }
  };

  return (
    <button
      type="button"
      className={`year-stat ${isActive ? "active" : ""}`}
      onClick={handleClick}
      aria-pressed={isActive}
      title={`Lihat kejadian tahun ${year}`}
    >
      <div className="year-stat-year">{year}</div>

      <div className="year-stat-count">{count}</div>

      <div className="year-stat-label">Kejadian</div>
    </button>
  );
};

export default YearStat;
