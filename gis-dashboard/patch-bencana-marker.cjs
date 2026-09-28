const fs = require("fs");

const file = "src/Kerawanan.tsx";
const backup = "src/Kerawanan.tsx.bak-bencana-color-v2";

const s = fs.readFileSync(file, "utf8");

const pointIndex = s.indexOf("pointToLayer: function");
const start = s.indexOf(
  "          const tableColor = getColorForTable(tableName);",
  pointIndex
);
const end = s.indexOf("        },", start);

if (pointIndex < 0 || start < 0 || end < 0) {
  throw new Error("BLOCK pointToLayer TIDAK DITEMUKAN - FILE TIDAK DIUBAH");
}

const oldBlock = s.slice(start, end);

console.log("BLOCK LAMA:");
console.log(oldBlock);

const newBlock = `          const isBencanaLayer = BENCANA_FOCUS_LAYERS.has(String(tableName));
          const tableColor = isBencanaLayer
            ? getBencanaLayerColor(String(tableName))
            : getColorForTable(tableName);
          return window.L.circleMarker([lat, lng], {
            radius: isBencanaLayer ? (zoom > 10 ? 8 : 6) : (zoom > 10 ? 6 : 4),
            fillColor: tableColor,
            color: isBencanaLayer ? tableColor : "#000",
            weight: isBencanaLayer ? 2 : 1,
            opacity: 1,
            fillOpacity: isBencanaLayer ? 0.9 : 0.7,
          });
`;

fs.copyFileSync(file, backup);
fs.writeFileSync(file, s.slice(0, start) + newBlock + s.slice(end), "utf8");

console.log("");
console.log("OK - marker bencana berhasil dipatch");
console.log("Backup:", backup);
