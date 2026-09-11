// ============================================================
// SIMITI ENTERPRISE - LOCATION PROXIMITY (ADDITIVE API)
// Tambahkan setelah route /api/location-assessment dan setelah
// ensureLokasiKegiatanTable() tersedia.
// Tidak mengubah endpoint existing.
// ============================================================
app.get("/api/location-proximity", async (req, res) => {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  const threatLimit = Math.min(Math.max(Number(req.query.threatLimit) || 5, 1), 20);
  const mitigationLimit = Math.min(Math.max(Number(req.query.mitigationLimit) || 5, 1), 20);
  const incidentLimit = Math.min(Math.max(Number(req.query.incidentLimit) || 5, 1), 20);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ success: false, message: "latitude dan longitude wajib berupa angka." });
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ success: false, message: "Koordinat latitude/longitude tidak valid." });
  }

  const point = "ST_SetSRID(ST_MakePoint($2,$1),4326)";
  const startedAt = Date.now();

  try {
    await ensureLokasiKegiatanTable();

    // Gunakan konfigurasi layer risiko nyata yang sama dengan /api/location-assessment.
    const riskConfigResult = await pool.query(`
      SELECT risk_key, label, table_name, geometry_column, class_column
      FROM risk_layer_config
      WHERE COALESCE(is_active, true) = true
      ORDER BY COALESCE(sort_order, 9999), risk_key
    `);
    const riskLayers = riskConfigResult.rows || [];

    const threatResults = await Promise.all(
      riskLayers.map(async (definition) => {
        try {
          const tableName = quoteIdentifier(definition.table_name);
          const geometryColumn = quoteIdentifier(definition.geometry_column || "geom");
          const classColumn = quoteIdentifier(definition.class_column || "kelas");

          // KNN + geography distance: cari feature risiko terdekat.
          // Layer existing diasumsikan EPSG:4326 seperti /api/location-assessment.
          const q = `
            SELECT
              ${classColumn} AS risk_class,
              ST_Covers(${geometryColumn}, ${point}) AS inside,
              ROUND(ST_Distance(${geometryColumn}::geography, ${point}::geography))::bigint AS distance_meters
            FROM public.${tableName}
            WHERE ${geometryColumn} IS NOT NULL
            ORDER BY ${geometryColumn} <-> ${point}
            LIMIT 1
          `;
          const result = await pool.query(q, [latitude, longitude]);
          const row = result.rows[0];
          if (!row) return null;

          return {
            key: definition.risk_key,
            label: definition.label || definition.risk_key,
            status: row.risk_class != null ? String(row.risk_class).trim() : null,
            level: null,
            distanceMeters: row.inside ? 0 : Number(row.distance_meters),
            inside: Boolean(row.inside),
            source: definition.table_name,
          };
        } catch (error) {
          console.warn("[LOCATION PROXIMITY] risk layer skipped:", definition.risk_key, error.message);
          return null;
        }
      }),
    );

    const threats = threatResults
      .filter(Boolean)
      .sort((a, b) => Number(a.distanceMeters ?? Infinity) - Number(b.distanceMeters ?? Infinity))
      .slice(0, threatLimit);

    const mitigationResult = await pool.query(
      `
        SELECT
          id,kode,nama_kegiatan,jenis_kegiatan,status,instansi_pelaksana,
          provinsi,kabupaten_kota,kecamatan,desa_kelurahan,latitude,longitude,
          ROUND(ST_Distance(geom::geography, ${point}::geography))::bigint AS distance_meters
        FROM lokasi_kegiatan
        WHERE geom IS NOT NULL
        ORDER BY geom <-> ${point}
        LIMIT $3
      `,
      [latitude, longitude, mitigationLimit],
    );

    // Riwayat kejadian bersifat konteks historis, bukan status ancaman aktif.
    let incidents = [];
    try {
      const incidentResult = await pool.query(
        `
          SELECT
            id,
            disaster_type,
            COALESCE(event_date, created_at) AS event_date,
            latitude,longitude,
            ROUND(ST_Distance(geom::geography, ${point}::geography))::bigint AS distance_meters
          FROM kejadian
          WHERE geom IS NOT NULL
          ORDER BY geom <-> ${point}
          LIMIT $3
        `,
        [latitude, longitude, incidentLimit],
      );
      incidents = incidentResult.rows.map((row) => ({
        id: row.id,
        disaster_type: row.disaster_type,
        event_date: row.event_date,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        distanceMeters: Number(row.distance_meters),
      }));
    } catch (error) {
      console.warn("[LOCATION PROXIMITY] incident query skipped:", error.message);
    }

    const mitigations = mitigationResult.rows.map((row) => ({
      ...row,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      distanceMeters: Number(row.distance_meters),
    }));

    return res.json({
      success: true,
      source: "SIMITI PostgreSQL/PostGIS",
      generatedAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startedAt,
      location: { latitude, longitude },
      threats,
      mitigations,
      incidents,
      summary: {
        nearestThreatDistanceMeters: threats[0]?.distanceMeters ?? null,
        nearestMitigationDistanceMeters: mitigations[0]?.distanceMeters ?? null,
      },
    });
  } catch (error) {
    console.error("❌ /api/location-proximity ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal melakukan analisis kedekatan spasial.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
