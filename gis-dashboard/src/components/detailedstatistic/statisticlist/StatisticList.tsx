import React from "react";

interface StatisticListProps {
  image: string;
  imageSize?: number;
  number: number | string;
  metric?: string;
  description?: string;
}

const StatisticList: React.FC<StatisticListProps> = ({
  image,
  imageSize = 50,
  number,
  metric = "",
  description = "",
}) => {
  const formattedDescription = description
    .replace(/\/n/g, "\n")
    .replace(/\\n/g, "\n");

  return (
    <div className="statistic-list">
      <div className="statistic-list-icon">
        <img
          src={image}
          alt=""
          width={imageSize}
          height={imageSize}
          style={{
            width: `${imageSize}px`,
            height: `${imageSize}px`,
            objectFit: "contain",
          }}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      </div>

      <div className="statistic-list-content">
        <div className="statistic-list-value">
          <span className="statistic-list-number">{number}</span>

          {metric && <span className="statistic-list-metric">{metric}</span>}
        </div>

        {formattedDescription && (
          <div className="statistic-list-description">
            {formattedDescription.split("\n").map((line, index) => (
              <React.Fragment key={index}>
                {line}
                {index < formattedDescription.split("\n").length - 1 && <br />}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatisticList;
