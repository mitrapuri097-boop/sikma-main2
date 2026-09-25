// server.js - Updated with new schema and Excel processing + REFERENCE_MAPPING
require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const { Pool: PgPool } = require("pg");

// ============================================================
// GOOGLE reCAPTCHA v2
// ============================================================
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || "";

async function verifyRecaptchaToken(token, remoteIp) {
  if (!RECAPTCHA_SECRET_KEY) {
    throw new Error("RECAPTCHA_SECRET_KEY belum dikonfigurasi di backend .env");
  }

  if (!token) return false;

  const params = new URLSearchParams();
  params.set("secret", RECAPTCHA_SECRET_KEY);
  params.set("response", token);
  if (remoteIp) params.set("remoteip", remoteIp);

  const response = await fetch(
    "https://www.google.com/recaptcha/api/siteverify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  if (!response.ok) {
    throw new Error(`Google reCAPTCHA verification HTTP ${response.status}`);
  }

  const result = await response.json();
  return result.success === true;
}

const app = express();
const progressClients = new Map();
const { exec, spawn } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
app.use(
  cors({
    origin: true, // Allow semua origin
    credentials: true,
  }),
);
// app.use(express.json());

app.use(
  express.json({
    limit: "3gb", // 3GB limit for JSON payload
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(
  express.urlencoded({
    limit: "3gb", // 3GB limit for URL-encoded data
    extended: true,
    parameterLimit: 100000, // Increase parameter limit
  }),
);

// Set timeout untuk large file uploads (2 jam)
app.use((req, res, next) => {
  req.setTimeout(7200000); // 2 hours (120 minutes)
  res.setTimeout(7200000); // 2 hours
  next();
});

// Keep-alive configuration
app.use((req, res, next) => {
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Keep-Alive", "timeout=7200"); // 2 hours
  next();
});

// ============================================================
// POSTGRESQL 17 / POSTGIS DATABASE
// ============================================================
// .env:
// DB_HOST=localhost
// DB_PORT=5432
// DB_NAME=simiti_local
// DB_USER=postgres
// DB_PASSWORD=your_postgres_password
// ============================================================
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "simiti_local",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
  max: Number(process.env.DB_CONNECTION_LIMIT || 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

const pool = new PgPool(dbConfig);

// ============================================================
// SIMITI AI MITIGATION RECOMMENDATION V3.1
// ============================================================
const {
  createAiMitigationRecommendationRouter,
} = require("./aiMitigationRecommendation");

app.use("/api/ai", createAiMitigationRecommendationRouter(pool));

// Native PostgreSQL client wrapper.
// Existing routes can continue using pool.query(), pool.connect(),
// client.query(), rows and rowCount without the old MySQL compatibility layer.
const client = {
  query: (...args) => pool.query(...args),
};

pool.on("error", (err) => {
  console.error("PostgreSQL pool error:", err);
});

async function testDatabaseConnection() {
  const result = await pool.query(
    "SELECT current_database() AS database, current_user AS user, version() AS version",
  );

  console.log(
    `PostgreSQL connected: database=${result.rows[0].database}, user=${result.rows[0].user}`,
  );
}

// Ensure master_role supports the Active/Inactive Role Management UI.
// Aman dijalankan berulang kali karena memakai IF NOT EXISTS.
async function ensureMasterRoleStatusColumn() {
  await pool.query(`
    ALTER TABLE public.master_role
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
  `);

  await pool.query(`
    UPDATE public.master_role
    SET status = 'active'
    WHERE status IS NULL OR BTRIM(status) = ''
  `);
}

ensureMasterRoleStatusColumn().catch((error) => {
  console.error("âŒ master_role status init:", error);
});

// let riskAnalysisCache = new Map();

// // Setup for file uploads
// const uploadDir = path.join(__dirname, 'uploads');
// if (!fs.existsSync(uploadDir)) {
//   fs.mkdirSync(uploadDir, { recursive: true });
// }

// // Multer configuration for file upload
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, uploadDir);
//   },
//   filename: (req, file, cb) => {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//     cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
//   }
// });

// const kejadianUpload = multer({
//   storage: storage,
//   fileFilter: (req, file, cb) => {
//     // Allow images and Excel files only for kejadian form
//     if (file.mimetype.startsWith('image/') ||
//         file.mimetype === 'application/vnd.ms-excel' ||
//         file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
//       cb(null, true);
//     } else {
//       cb(new Error('Only image and Excel files are allowed for kejadian reports'), false);
//     }
//   },
//   limits: {
//     fileSize: 10 * 1024 * 1024 // 10MB limit
//   }
// });

// const fileManagerUpload = multer({
//   storage: storage,
//   // Tidak ada fileFilter - izinkan semua tipe file
//   limits: {
//     fileSize: 10 * 1024 * 1024 // 10MB limit
//   }
// });

// // Serve uploaded files statically
// app.use('/uploads', express.static(uploadDir));

// const dbConfig = {
//   host: 'localhost',
//   port: 5433,
//   database: 'gis_data',
//   user: 'postgres',
//   password: '12345678'
// };

// async function resolveNameColumn(tableName) {
//   const candidates = ['nama', 'provinsi', 'kab_kota', 'kecamatan', 'kelurahan', 'name', 'nama_das'];
//   try {
//     const q = `
//       SELECT column_name
//       FROM information_schema.columns
//       WHERE table_schema = DATABASE() AND table_name = $1
//     `;
//     const cols = (await client.query(q, [tableName])).rows.map(r => r.column_name.toLowerCase());
//     for (let cand of candidates) {
//       if (cols.includes(cand)) return cand;
//     }
//     const fallback = cols.find(c => !['geom', 'geometry', 'gid', 'id', 'tahun_data'].includes(c));
//     return fallback || 'nama';
//   } catch (err) {
//     console.error('resolveNameColumn error', err);
//     return 'nama';
//   }
// }

// // TAMBAHAN: Helper function untuk clear cache berdasarkan area yang terdampak
// const invalidateRiskCache = (impactData) => {

//   if (!impactData) return;
//   const { disaster_type, provinsi, kabupaten, kecamatan, kelurahan, das } = impactData;
//   // Clear semua cache yang mungkin terdampak
//   const keysToDelete = [];
//   for (let [cacheKey, cacheData] of riskAnalysisCache.entries()) {
//     const keyParts = cacheKey.split('|');
//     if (keyParts.length >= 3) {
//       const cachedDisasterType = keyParts[0];
//       const cachedLevel = keyParts[1];
//       const cachedLocation = keyParts[2];
//       // Hapus cache jika disaster type sama
//       if (cachedDisasterType === disaster_type) {
//         // Check berbagai level yang mungkin terdampak
//         if (
//           (cachedLevel === 'Provinsi' && cachedLocation === provinsi) ||
//           (cachedLevel === 'Kabupaten/Kota' && cachedLocation === kabupaten) ||
//           (cachedLevel === 'Kecamatan' && cachedLocation === kecamatan) ||
//           (cachedLevel === 'DAS' && cachedLocation === das) ||
//           // Atau jika provinsi/kabupaten parent sama (karena bisa mempengaruhi child areas)
//           (cachedLevel === 'Kabupaten/Kota' && provinsi && cacheData.parentArea === provinsi) ||
//           (cachedLevel === 'Kecamatan' && kabupaten && cacheData.parentArea === kabupaten)
//         ) {
//           keysToDelete.push(cacheKey);
//         }
//       }
//     }
//   }

//   // Hapus cache yang terdampak
//   keysToDelete.forEach(key => {
//     riskAnalysisCache.delete(key);
//     console.log(`Risk cache invalidated for key: ${key}`);
//   });

//   console.log(`Total ${keysToDelete.length} cache entries invalidated`);
// };

// // Function to create updated kejadian table
// // const createKejadianTable = async () => {
// //   const createTableSQL = `
// //     CREATE TABLE IF NOT EXISTS kejadian (
// //       id SERIAL PRIMARY KEY,
// //       thumbnail_path VARCHAR(500),
// //       images_paths TEXT[],
// //       disaster_type VARCHAR(50) NOT NULL,
// //       provinsi VARCHAR(100) NOT NULL,
// //       kabupaten VARCHAR(100) NOT NULL,
// //       kecamatan VARCHAR(100) NOT NULL,
// //       kelurahan VARCHAR(100) NOT NULL,
// //       das VARCHAR(100),
// //       title VARCHAR(255) NOT NULL,
// //       description TEXT NOT NULL,
// //       incident_date DATE NOT NULL,
// //       longitude DOUBLE PRECISION NOT NULL,
// //       latitude DOUBLE PRECISION NOT NULL,
// //       geom GEOMETRY(POINT, 4326),

// //       -- Additional fields from Excel data
// //       curah_hujan DECIMAL(10,2),
// //       korban_meninggal INTEGER DEFAULT 0,
// //       korban_luka_luka INTEGER DEFAULT 0,
// //       korban_mengungsi INTEGER DEFAULT 0,
// //       rumah_rusak_berat INTEGER DEFAULT 0,
// //       rumah_rusak_sedang INTEGER DEFAULT 0,
// //       rumah_rusak_ringan INTEGER DEFAULT 0,
// //       rumah_rusak_terendam INTEGER DEFAULT 0,
// //       infrastruktur_rusak_berat INTEGER DEFAULT 0,
// //       infrastruktur_rusak_sedang INTEGER DEFAULT 0,
// //       infrastruktur_rusak_ringan INTEGER DEFAULT 0,
// //       dampak_kebakaran TEXT,
// //       luas_lokasi_kejadian DECIMAL(15,2),
// //       kejadian_ke INTEGER,

// //       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
// //       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// //     );

// //     -- Create indexes
// //     CREATE INDEX IF NOT EXISTS idx_kejadian_provinsi ON kejadian(provinsi);
// //     CREATE INDEX IF NOT EXISTS idx_kejadian_kabupaten ON kejadian(kabupaten);
// //     CREATE INDEX IF NOT EXISTS idx_kejadian_kecamatan ON kejadian(kecamatan);
// //     CREATE INDEX IF NOT EXISTS idx_kejadian_kelurahan ON kejadian(kelurahan);
// //     CREATE INDEX IF NOT EXISTS idx_kejadian_disaster_type ON kejadian(disaster_type);
// //     CREATE INDEX IF NOT EXISTS idx_kejadian_incident_date ON kejadian(incident_date);
// //     CREATE INDEX IF NOT EXISTS idx_kejadian_geom ON kejadian USING GIST(geom);

// //     -- Create composite indexes for common filter combinations
// //     CREATE INDEX IF NOT EXISTS idx_kejadian_filter_combo ON kejadian(provinsi, disaster_type);
// //     CREATE INDEX IF NOT EXISTS idx_kejadian_date_province ON kejadian(incident_date DESC, provinsi);

// //     -- Create trigger function for updating timestamp
// //     CREATE OR REPLACE FUNCTION update_kejadian_timestamp()
// //     RETURNS TRIGGER AS $$
// //     BEGIN
// //         NEW.updated_at = CURRENT_TIMESTAMP;
// //         RETURN NEW;
// //     END;
// //     $$ LANGUAGE plpgsql;

// //     -- Create trigger
// //     DROP TRIGGER IF EXISTS trigger_update_kejadian_timestamp ON kejadian;
// //     CREATE TRIGGER trigger_update_kejadian_timestamp
// //         BEFORE UPDATE ON kejadian
// //         FOR EACH ROW
// //         EXECUTE FUNCTION update_kejadian_timestamp();
// //   `;

// //   try {
// //     await client.query(createTableSQL);
// //     console.log('Updated kejadian table created successfully');
// //   } catch (error) {
// //     console.error('Error creating kejadian table:', error);
// //   }
// // };

// const createKejadianTable = async () => {
//   const createTableSQL = `
//     -- KEJADIAN TABLE (hapus field curah_hujan)
//     CREATE TABLE IF NOT EXISTS kejadian (
//       id SERIAL PRIMARY KEY,
//       thumbnail_path VARCHAR(500),
//       images_paths TEXT[],
//       disaster_type VARCHAR(50) NOT NULL CHECK (disaster_type IN ('Banjir', 'Kebakaran', 'Longsor')),
//       provinsi VARCHAR(100) NOT NULL,
//       kabupaten VARCHAR(100) NOT NULL,
//       kecamatan VARCHAR(100) NOT NULL,
//       kelurahan VARCHAR(100) NOT NULL,
//       das VARCHAR(100),
//       title VARCHAR(255) NOT NULL,
//       description TEXT NOT NULL,
//       incident_date DATE NOT NULL,
//       longitude DOUBLE PRECISION NOT NULL,
//       latitude DOUBLE PRECISION NOT NULL,
//       geom GEOMETRY(POINT, 4326),

//       -- Data Korban (dari sheet "Data Korban")
//       korban_meninggal INTEGER DEFAULT 0,
//       korban_luka_luka INTEGER DEFAULT 0,
//       korban_mengungsi INTEGER DEFAULT 0,
//       rumah_rusak_berat INTEGER DEFAULT 0,
//       rumah_rusak_sedang INTEGER DEFAULT 0,
//       rumah_rusak_ringan INTEGER DEFAULT 0,
//       rumah_rusak_terendam INTEGER DEFAULT 0,
//       infrastruktur_rusak_berat INTEGER DEFAULT 0,
//       infrastruktur_rusak_sedang INTEGER DEFAULT 0,
//       infrastruktur_rusak_ringan INTEGER DEFAULT 0,
//       dampak_kebakaran TEXT,
//       luas_lokasi_kejadian DECIMAL(15,2),
//       kejadian_ke INTEGER,
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );

//     -- Indexes
//     CREATE INDEX IF NOT EXISTS idx_kejadian_provinsi ON kejadian(provinsi);
//     CREATE INDEX IF NOT EXISTS idx_kejadian_kabupaten ON kejadian(kabupaten);
//     CREATE INDEX IF NOT EXISTS idx_kejadian_kecamatan ON kejadian(kecamatan);
//     CREATE INDEX IF NOT EXISTS idx_kejadian_kelurahan ON kejadian(kelurahan);
//     CREATE INDEX IF NOT EXISTS idx_kejadian_disaster_type ON kejadian(disaster_type);
//     CREATE INDEX IF NOT EXISTS idx_kejadian_incident_date ON kejadian(incident_date);
//     CREATE INDEX IF NOT EXISTS idx_kejadian_geom ON kejadian USING GIST(geom);

//     -- CURAH HUJAN (tabel terpisah)
//     CREATE TABLE IF NOT EXISTS curah_hujan (
//       id SERIAL PRIMARY KEY,
//       kejadian_id INTEGER NOT NULL REFERENCES kejadian(id) ON DELETE CASCADE,
//       hari VARCHAR(20),
//       jam TIME,
//       curah_hujan DECIMAL(10,2) NOT NULL,
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );
//     CREATE INDEX IF NOT EXISTS idx_curah_hujan_kejadian ON curah_hujan(kejadian_id);

//     -- TUTUPAN DAS
//     CREATE TABLE IF NOT EXISTS tutupan_das (
//       id SERIAL PRIMARY KEY,
//       kejadian_id INTEGER NOT NULL REFERENCES kejadian(id) ON DELETE CASCADE,
//       jenis_tutupan VARCHAR(50) NOT NULL,
//       persentase DECIMAL(5,2) NOT NULL,
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );
//     CREATE INDEX IF NOT EXISTS idx_tutupan_das_kejadian ON tutupan_das(kejadian_id);

//     -- KEMIRINGAN LAHAN
//     CREATE TABLE IF NOT EXISTS kemiringan_lahan (
//       id SERIAL PRIMARY KEY,
//       kejadian_id INTEGER UNIQUE NOT NULL REFERENCES kejadian(id) ON DELETE CASCADE,
//       sangat_datar DECIMAL(10,2) DEFAULT 0,
//       datar DECIMAL(10,2) DEFAULT 0,
//       landai DECIMAL(10,2) DEFAULT 0,
//       agak_curam DECIMAL(10,2) DEFAULT 0,
//       curam DECIMAL(10,2) DEFAULT 0,
//       sangat_curam DECIMAL(10,2) DEFAULT 0,
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );
//     CREATE INDEX IF NOT EXISTS idx_kemiringan_lahan_kejadian ON kemiringan_lahan(kejadian_id);

//     -- KEPADATAN PEMUKIMAN
//     CREATE TABLE IF NOT EXISTS kepadatan_pemukiman (
//       id SERIAL PRIMARY KEY,
//       kejadian_id INTEGER NOT NULL REFERENCES kejadian(id) ON DELETE CASCADE,
//       kel_desa VARCHAR(100) NOT NULL,
//       jumlah_kk INTEGER NOT NULL DEFAULT 0,
//       jumlah_jiwa INTEGER NOT NULL DEFAULT 0,
//       kepadatan DECIMAL(10,2),
//       klasifikasi VARCHAR(50),
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );
//     CREATE INDEX IF NOT EXISTS idx_kepadatan_pemukiman_kejadian ON kepadatan_pemukiman(kejadian_id);

//     -- STATUS DAS BANJIR
//     CREATE TABLE IF NOT EXISTS status_das_banjir (
//       id SERIAL PRIMARY KEY,
//       kejadian_id INTEGER NOT NULL REFERENCES kejadian(id) ON DELETE CASCADE,
//       nama_das VARCHAR(100) NOT NULL,
//       luas DECIMAL(10,2),
//       tutupan_vegetasi VARCHAR(10),
//       sedimentasi VARCHAR(50),
//       status_kekritisan VARCHAR(50),
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );
//     CREATE INDEX IF NOT EXISTS idx_status_das_banjir_kejadian ON status_das_banjir(kejadian_id);

//     -- STATUS DAS KEBAKARAN
//     CREATE TABLE IF NOT EXISTS status_das_kebakaran (
//       id SERIAL PRIMARY KEY,
//       kejadian_id INTEGER NOT NULL REFERENCES kejadian(id) ON DELETE CASCADE,
//       nama_das VARCHAR(100) NOT NULL,
//       luas DECIMAL(10,2),
//       tutupan_vegetasi VARCHAR(10),
//       status VARCHAR(50),
//       tingkat_risiko VARCHAR(50),
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );
//     CREATE INDEX IF NOT EXISTS idx_status_das_kebakaran_kejadian ON status_das_kebakaran(kejadian_id);

//     -- KEMIRINGAN LERENG
//     CREATE TABLE IF NOT EXISTS kemiringan_lereng (
//       id SERIAL PRIMARY KEY,
//       kejadian_id INTEGER NOT NULL REFERENCES kejadian(id) ON DELETE CASCADE,
//       segmen VARCHAR(50) NOT NULL,
//       kemiringan VARCHAR(20) NOT NULL,
//       luas DECIMAL(10,2),
//       tinggi_lereng DECIMAL(10,2),
//       klasifikasi_bahaya VARCHAR(50),
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );
//     CREATE INDEX IF NOT EXISTS idx_kemiringan_lereng_kejadian ON kemiringan_lereng(kejadian_id);

//     -- TOPOGRAFI
//     CREATE TABLE IF NOT EXISTS topografi (
//       id SERIAL PRIMARY KEY,
//       kejadian_id INTEGER NOT NULL REFERENCES kejadian(id) ON DELETE CASCADE,
//       area VARCHAR(50) NOT NULL,
//       ketinggian VARCHAR(50),
//       bentuk_lahan VARCHAR(50),
//       kelerengan VARCHAR(50),
//       potensi_longsor VARCHAR(50),
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );
//     CREATE INDEX IF NOT EXISTS idx_topografi_kejadian ON topografi(kejadian_id);

//     -- GEOLOGI
//     CREATE TABLE IF NOT EXISTS geologi (
//       id SERIAL PRIMARY KEY,
//       kejadian_id INTEGER NOT NULL REFERENCES kejadian(id) ON DELETE CASCADE,
//       parameter VARCHAR(100) NOT NULL,
//       deskripsi TEXT,
//       klasifikasi VARCHAR(100),
//       pengaruh_terhadap_longsor VARCHAR(100),
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );
//     CREATE INDEX IF NOT EXISTS idx_geologi_kejadian ON geologi(kejadian_id);

//     -- JENIS TANAH
//     CREATE TABLE IF NOT EXISTS jenis_tanah (
//       id SERIAL PRIMARY KEY,
//       kejadian_id INTEGER NOT NULL REFERENCES kejadian(id) ON DELETE CASCADE,
//       jenis_tanah VARCHAR(50) NOT NULL,
//       persentase DECIMAL(5,2) NOT NULL,
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );
//     CREATE INDEX IF NOT EXISTS idx_jenis_tanah_kejadian ON jenis_tanah(kejadian_id);

//     -- PATAHAN
//     CREATE TABLE IF NOT EXISTS patahan (
//       id SERIAL PRIMARY KEY,
//       kejadian_id INTEGER NOT NULL REFERENCES kejadian(id) ON DELETE CASCADE,
//       nama_patahan VARCHAR(100) NOT NULL,
//       jarak VARCHAR(20),
//       status VARCHAR(50),
//       tingkat_aktivitas VARCHAR(50),
//       risiko VARCHAR(50),
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );
//     CREATE INDEX IF NOT EXISTS idx_patahan_kejadian ON patahan(kejadian_id);

//     -- TUTUPAN LAHAN
//     CREATE TABLE IF NOT EXISTS tutupan_lahan (
//       id SERIAL PRIMARY KEY,
//       kejadian_id INTEGER NOT NULL REFERENCES kejadian(id) ON DELETE CASCADE,
//       jenis_tutupan VARCHAR(50) NOT NULL,
//       persentase DECIMAL(5,2) NOT NULL,
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );
//     CREATE INDEX IF NOT EXISTS idx_tutupan_lahan_kejadian ON tutupan_lahan(kejadian_id);

//     -- INFRASTRUKTUR
//     CREATE TABLE IF NOT EXISTS infrastruktur (
//       id SERIAL PRIMARY KEY,
//       kejadian_id INTEGER NOT NULL REFERENCES kejadian(id) ON DELETE CASCADE,
//       jenis_infrastruktur VARCHAR(100) NOT NULL,
//       lokasi VARCHAR(200) NOT NULL,
//       jarak VARCHAR(20),
//       status VARCHAR(100),
//       tingkat_risiko VARCHAR(50),
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//     );
//     CREATE INDEX IF NOT EXISTS idx_infrastruktur_kejadian ON infrastruktur(kejadian_id);

//     -- TRIGGER
//     CREATE OR REPLACE FUNCTION update_updated_at_column()
//     RETURNS TRIGGER AS $$
//     BEGIN
//         NEW.updated_at = CURRENT_TIMESTAMP;
//         RETURN NEW;
//     END;
//     $$ LANGUAGE plpgsql;

//     DROP TRIGGER IF EXISTS update_kejadian_updated_at ON kejadian;
//     CREATE TRIGGER update_kejadian_updated_at
//         BEFORE UPDATE ON kejadian
//         FOR EACH ROW
//         EXECUTE FUNCTION update_updated_at_column();
//   `;

//   try {
//     await client.query(createTableSQL);
//     console.log('âœ… All tables created successfully');
//   } catch (error) {
//     console.error('âŒ Error creating tables:', error);
//   }
// };

// const createFileTable = async () => {
//   const createTableSQL = `
//     CREATE TABLE IF NOT EXISTS file (
//       id SERIAL PRIMARY KEY,
//       filename VARCHAR(500) UNIQUE NOT NULL, -- Nama file unik yang disimpan
//       original_name VARCHAR(500) NOT NULL,   -- Nama file asli saat diupload
//       filepath VARCHAR(1000) NOT NULL,       -- Path relatif dari file (e.g., /uploads/filename.ext)
//       mimetype VARCHAR(100),                 -- Tipe MIME file
//       size BIGINT,                           -- Ukuran file dalam bytes
//       upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Tanggal upload
//       -- Tidak ada kolom associated_report_id karena ini hanya untuk File Manager
//     );

//     -- Index untuk performa pencarian dan penghapusan
//     CREATE INDEX IF NOT EXISTS idx_file_filename ON file(filename);
//   `;
//   try {
//     await client.query(createTableSQL);
//     console.log('File table created or already exists.');
//   } catch (error) {
//     console.error('Error creating file table:', error);
//   }
// };

// const createMitigasiTables = async () => {
//   const createRekomendasiSQL = `
//     CREATE TABLE IF NOT EXISTS rekomendasi_mitigasi_adaptasi (
//       id SERIAL PRIMARY KEY,
//       provinsi VARCHAR(100),
//       kabupaten VARCHAR(100),
//       kecamatan VARCHAR(100),
//       das VARCHAR(100),
//       sub_das VARCHAR(100),
//       banjir VARCHAR(10),
//       longsor VARCHAR(10),
//       kebakaran_hutan VARCHAR(10),
//       kerawanan VARCHAR(20),
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- Tambahkan ini
//     );

//     -- Index untuk performa query
//     CREATE INDEX IF NOT EXISTS idx_rekomendasi_provinsi ON rekomendasi_mitigasi_adaptasi(provinsi);
//     CREATE INDEX IF NOT EXISTS idx_rekomendasi_kabupaten ON rekomendasi_mitigasi_adaptasi(kabupaten);
//   `;

//   const createKegiatanSQL = `
//     CREATE TABLE IF NOT EXISTS kegiatan_mitigasi (
//       id SERIAL PRIMARY KEY,
//       rekomendasi_id INTEGER UNIQUE NOT NULL,  -- Tambahkan UNIQUE constraint
//       metode TEXT,
//       analisis TEXT,
//       monev TEXT,
//       dokumen_terkait TEXT,  -- Ubah jadi TEXT (untuk JSON string)
//       foto_dokumentasi TEXT,  -- Ubah jadi TEXT (untuk JSON string)
//       peta_awal VARCHAR(500),
//       peta_setelah VARCHAR(500),
//       peta_kerentanan VARCHAR(500),
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Tambahkan ini
//       CONSTRAINT fk_rekomendasi
//         FOREIGN KEY (rekomendasi_id)
//         REFERENCES rekomendasi_mitigasi_adaptasi(id)
//         ON DELETE CASCADE
//     );

//     -- Index untuk performa
//     CREATE INDEX IF NOT EXISTS idx_kegiatan_rekomendasi ON kegiatan_mitigasi(rekomendasi_id);

//     -- Trigger untuk auto-update updated_at
//     CREATE OR REPLACE FUNCTION update_kegiatan_timestamp()
//     RETURNS TRIGGER AS $$
//     BEGIN
//         NEW.updated_at = CURRENT_TIMESTAMP;
//         RETURN NEW;
//     END;
//     $$ LANGUAGE plpgsql;

//     DROP TRIGGER IF EXISTS trigger_update_kegiatan_timestamp ON kegiatan_mitigasi;
//     CREATE TRIGGER trigger_update_kegiatan_timestamp
//         BEFORE UPDATE ON kegiatan_mitigasi
//         FOR EACH ROW
//         EXECUTE FUNCTION update_kegiatan_timestamp();

//     -- Trigger untuk rekomendasi
//     CREATE OR REPLACE FUNCTION update_rekomendasi_timestamp()
//     RETURNS TRIGGER AS $$
//     BEGIN
//         NEW.updated_at = CURRENT_TIMESTAMP;
//         RETURN NEW;
//     END;
//     $$ LANGUAGE plpgsql;

//     DROP TRIGGER IF EXISTS trigger_update_rekomendasi_timestamp ON rekomendasi_mitigasi_adaptasi;
//     CREATE TRIGGER trigger_update_rekomendasi_timestamp
//         BEFORE UPDATE ON rekomendasi_mitigasi_adaptasi
//         FOR EACH ROW
//         EXECUTE FUNCTION update_rekomendasi_timestamp();
//   `;

//   try {
//     await client.query(createRekomendasiSQL);
//     console.log('Table rekomendasi_mitigasi_adaptasi created successfully');

//     await client.query(createKegiatanSQL);
//     console.log('Table kegiatan_mitigasi created successfully');
//   } catch (error) {
//     console.error('Error creating mitigasi tables:', error);
//   }
// };

// // Connect to database and create table
// client.connect()
//   .then(async () => {
//     console.log('Connected to PostgreSQL');
//     await createKejadianTable();
//     await createFileTable();
//     await createMitigasiTables();
//   })
//   .catch(err => console.error('Connection error:', err));

//   function processExcelFile(filePath, disasterType) {
//   const workbook = XLSX.readFile(filePath);
//   const result = {};

//   try {
//     // Process Data Korban (sama untuk semua bencana)
//     result.data_korban = processSheet_DataKorban(workbook);

//     // Process berdasarkan jenis bencana
//     if (disasterType === 'Banjir') {
//       result.curah_hujan = processSheet_CurahHujan_Banjir(workbook);
//       result.status_das = processSheet_StatusDAS_Banjir(workbook);
//       result.tutupan_das = processSheet_TutupanDas(workbook);
//       result.kemiringan_lahan = processSheet_KemiringanLahan(workbook);
//       result.kepadatan_pemukiman = processSheet_KepadatanPemukiman(workbook);
//     }
//     else if (disasterType === 'Kebakaran') {
//       result.status_das = processSheet_StatusDAS_Kebakaran(workbook);
//       result.tutupan_das = processSheet_TutupanDas(workbook);
//       result.kemiringan_lahan = processSheet_KemiringanLahan(workbook);
//       result.kepadatan_pemukiman = processSheet_KepadatanPemukiman(workbook);
//     }
//     else if (disasterType === 'Longsor') {
//       result.curah_hujan = processSheet_CurahHujan_Longsor(workbook);
//       result.kemiringan_lereng = processSheet_KemiringanLereng(workbook);
//       result.topografi = processSheet_Topografi(workbook);
//       result.geologi = processSheet_Geologi(workbook);
//       result.jenis_tanah = processSheet_JenisTanah(workbook);
//       result.patahan = processSheet_Patahan(workbook);
//       result.tutupan_lahan = processSheet_TutupanLahan(workbook);
//       result.infrastruktur = processSheet_Infrastruktur(workbook);
//       result.kepadatan_pemukiman = processSheet_KepadatanPemukiman(workbook);
//     }
//   } catch (error) {
//     console.error('Error processing Excel file:', error);
//   }

//   return result;
// }

// // Process Data Korban (sama untuk semua bencana)
// function processSheet_DataKorban(workbook) {
//   const sheetName = 'Data Korban';
//   if (!workbook.SheetNames.includes(sheetName)) return null;

//   const sheet = workbook.Sheets[sheetName];
//   const data = XLSX.utils.sheet_to_json(sheet);

//   if (data.length === 0) return null;

//   const row = data[0];
//   return {
//     korban_meninggal: parseInt(row['Korban Meninggal']) || 0,
//     korban_luka_luka: parseInt(row['Korban Luka-luka']) || 0,
//     korban_mengungsi: parseInt(row['Korban Mengungsi']) || 0,
//     rumah_rusak_berat: parseInt(row['Rumah Rusak Berat']) || 0,
//     rumah_rusak_sedang: parseInt(row['Rumah Rusak Sedang']) || 0,
//     rumah_rusak_ringan: parseInt(row['Rumah Rusak Ringan']) || 0,
//     rumah_rusak_terendam: parseInt(row['Rumah Terendam']) || 0,
//     infrastruktur_rusak_berat: parseInt(row['Infrastruktur Rusak Berat']) || 0,
//     infrastruktur_rusak_sedang: parseInt(row['Infrastruktur Rusak Sedang']) || 0,
//     infrastruktur_rusak_ringan: parseInt(row['Infrastruktur Rusak Ringan']) || 0,
//     dampak_kebakaran: row['Dampak Kebakaran'] || '',
//     luas_lokasi_kejadian: parseFloat(row['Luas Lokasi Kejadian']) || 0,
//     kejadian_ke: parseInt(row['Kejadian Ke']) || 0
//   };
// }

// // Process Curah Hujan untuk Banjir (per jam)
// function processSheet_CurahHujan_Banjir(workbook) {
//   const sheetName = 'Curah Hujan';
//   if (!workbook.SheetNames.includes(sheetName)) return [];

//   const sheet = workbook.Sheets[sheetName];
//   const data = XLSX.utils.sheet_to_json(sheet);

//   return data.map(row => ({
//     hari: row['Hari'] || null,
//     jam: row['Jam'] || null,
//     curah_hujan: parseFloat(String(row['Curah Hujan']).replace(',', '.')) || 0
//   }));
// }

// // Process Curah Hujan untuk Longsor (30 hari)
// function processSheet_CurahHujan_Longsor(workbook) {
//   const sheetName = 'Curah Hujan';
//   if (!workbook.SheetNames.includes(sheetName)) return [];

//   const sheet = workbook.Sheets[sheetName];
//   const data = XLSX.utils.sheet_to_json(sheet);

//   return data.map(row => {
//     // Extract number from "Hari 1", "Hari 2", etc.
//     let hariNumber = null;
//     if (row['Hari']) {
//       const match = row['Hari'].toString().match(/\d+/);
//       if (match) {
//         hariNumber = parseInt(match[0]);
//       }
//     }

//     return {
//       hari: hariNumber ? `Hari ${hariNumber}` : row['Hari'], // Keep format "Hari 1"
//       jam: null, // Longsor tidak pakai jam
//       curah_hujan: parseFloat(String(row['Curah Hujan']).replace(',', '.')) || 0
//     };
//   });
// }

// // Process Status DAS Banjir
// function processSheet_StatusDAS_Banjir(workbook) {
//   const sheetName = 'Status DAS';
//   if (!workbook.SheetNames.includes(sheetName)) return [];

//   const sheet = workbook.Sheets[sheetName];
//   const data = XLSX.utils.sheet_to_json(sheet);

//   return data.map(row => ({
//     nama_das: row['Nama DAS'] || '',
//     luas: parseFloat(row['Luas (kmÂ²)']) || 0,
//     tutupan_vegetasi: row['Tutupan Vegetasi'] || '',
//     sedimentasi: row['Sedimentasi'] || '',
//     status_kekritisan: row['Status Kekritisan'] || ''
//   }));
// }

// // Process Status DAS Kebakaran
// function processSheet_StatusDAS_Kebakaran(workbook) {
//   const sheetName = 'Status DAS';
//   if (!workbook.SheetNames.includes(sheetName)) return [];

//   const sheet = workbook.Sheets[sheetName];
//   const data = XLSX.utils.sheet_to_json(sheet);

//   return data.map(row => ({
//     nama_das: row['Nama DAS'] || '',
//     luas: parseFloat(row['Luas (Ha)']) || 0,
//     tutupan_vegetasi: row['Tutupan Vegetasi'] || '',
//     status: row['Status'] || '',
//     tingkat_risiko: row['Tingkat Risiko'] || ''
//   }));
// }

// // Process Tutupan DAS
// function processSheet_TutupanDas(workbook) {
//   const sheetName = 'Tutupan DAS';
//   if (!workbook.SheetNames.includes(sheetName)) return [];

//   const sheet = workbook.Sheets[sheetName];
//   const data = XLSX.utils.sheet_to_json(sheet);

//   return data.map(row => ({
//     jenis_tutupan: row['Jenis Tutupan'] || '',
//     persentase: parseFloat(row['Persentase']) || 0
//   }));
// }

// // Process Kemiringan Lahan
// function processSheet_KemiringanLahan(workbook) {
//   const sheetName = 'Kemiringan Lahan';
//   if (!workbook.SheetNames.includes(sheetName)) return null;

//   const sheet = workbook.Sheets[sheetName];
//   const data = XLSX.utils.sheet_to_json(sheet);

//   if (data.length === 0) return null;

//   const row = data[0];

//   // Try different header formats
//   return {
//     sangat_datar: parseFloat(row['0-2Â° Sangat Datar (ha)'] || row['0-8Â° Sangat Datar (Ha)'] || 0),
//     datar: parseFloat(row['2-8Â° Datar (ha)'] || row['0-8Â° Datar (Ha)'] || 0),
//     landai: parseFloat(row['8-15Â° Landai (ha)'] || row['8-15Â° Landai (Ha)'] || 0),
//     agak_curam: parseFloat(row['15-25Â° Agak Curam (ha)'] || row['15-25Â° Agak Curam (Ha)'] || 0),
//     curam: parseFloat(row['>25Â° Curam (ha)'] || row['25-40Â° Curam (Ha)'] || 0),
//     sangat_curam: parseFloat(row['>25Â° Sangat Curam (ha)'] || row['>40Â° Sangat Curam (Ha)'] || 0)
//   };
// }

// // Process Kepadatan Pemukiman
// function processSheet_KepadatanPemukiman(workbook) {
//   const sheetName = 'Kepadatan Pemukiman';
//   if (!workbook.SheetNames.includes(sheetName)) return [];

//   const sheet = workbook.Sheets[sheetName];
//   const data = XLSX.utils.sheet_to_json(sheet);

//   return data.map(row => ({
//     kel_desa: row['Kelurahan/Desa'] || '',
//     jumlah_kk: parseInt(row['Jumlah KK']) || 0,
//     jumlah_jiwa: parseInt(row['Jumlah Jiwa']) || 0,
//     kepadatan: parseFloat(row['Kepadatan (jiwa/kmÂ²)']) || 0,
//     klasifikasi: row['Klasifikasi'] || ''
//   }));
// }

// // Process Kemiringan Lereng (Longsor)
// function processSheet_KemiringanLereng(workbook) {
//   const sheetName = 'Kemiringan Lereng';
//   if (!workbook.SheetNames.includes(sheetName)) return [];

//   const sheet = workbook.Sheets[sheetName];
//   const data = XLSX.utils.sheet_to_json(sheet);

//   return data.map(row => ({
//     segmen: row['Segmen'] || '',
//     kemiringan: row['Kemiringan'] || '',
//     luas: parseFloat(row['Luas (Ha)']) || 0,
//     tinggi_lereng: parseFloat(row['Tinggi Lereng (m)']) || 0,
//     klasifikasi_bahaya: row['Klasifikasi Bahaya'] || ''
//   }));
// }

// // Process Topografi
// function processSheet_Topografi(workbook) {
//   const sheetName = 'Topografi';
//   if (!workbook.SheetNames.includes(sheetName)) return [];

//   const sheet = workbook.Sheets[sheetName];
//   const data = XLSX.utils.sheet_to_json(sheet);

//   return data.map(row => ({
//     area: row['Area'] || '',
//     ketinggian: row['Ketinggian (mdpl)'] || '',
//     bentuk_lahan: row['Bentuk Lahan'] || '',
//     kelerengan: row['Kelerengan'] || '',
//     potensi_longsor: row['Potensi Longsor'] || ''
//   }));
// }

// // Process Geologi
// function processSheet_Geologi(workbook) {
//   const sheetName = 'Geologi';
//   if (!workbook.SheetNames.includes(sheetName)) return [];

//   const sheet = workbook.Sheets[sheetName];
//   const data = XLSX.utils.sheet_to_json(sheet);

//   return data.map(row => ({
//     parameter: row['Parameter'] || '',
//     deskripsi: row['Deskripsi'] || '',
//     klasifikasi: row['Klasifikasi'] || '',
//     pengaruh_terhadap_longsor: row['Pengaruh terhadap Longsor'] || ''
//   }));
// }

// // Process Jenis Tanah
// function processSheet_JenisTanah(workbook) {
//   const sheetName = 'Jenis Tanah';
//   if (!workbook.SheetNames.includes(sheetName)) return [];

//   const sheet = workbook.Sheets[sheetName];
//   const data = XLSX.utils.sheet_to_json(sheet);

//   return data.map(row => ({
//     jenis_tanah: row['Jenis Tanah'] || '',
//     persentase: parseFloat(row['Persentase']) || 0
//   }));
// }

// // Process Patahan
// function processSheet_Patahan(workbook) {
//   const sheetName = 'Patahan';
//   if (!workbook.SheetNames.includes(sheetName)) return [];

//   const sheet = workbook.Sheets[sheetName];
//   const data = XLSX.utils.sheet_to_json(sheet);

//   return data.map(row => ({
//     nama_patahan: row['Nama Patahan'] || '',
//     jarak: row['Jarak dari Lokasi (km)'] || '',
//     status: row['Status'] || '',
//     tingkat_aktivitas: row['Tingkat Aktivitas'] || '',
//     risiko: row['Risiko'] || ''
//   }));
// }

// // Process Tutupan Lahan
// function processSheet_TutupanLahan(workbook) {
//   const sheetName = 'Tutupan Lahan';
//   if (!workbook.SheetNames.includes(sheetName)) return [];

//   const sheet = workbook.Sheets[sheetName];
//   const data = XLSX.utils.sheet_to_json(sheet);

//   return data.map(row => ({
//     jenis_tutupan: row['Jenis Tutupan'] || '',
//     persentase: parseFloat(row['Persentase']) || 0
//   }));
// }

// // Process Infrastruktur
// function processSheet_Infrastruktur(workbook) {
//   const sheetName = 'Infrastruktur';
//   if (!workbook.SheetNames.includes(sheetName)) return [];

//   const sheet = workbook.Sheets[sheetName];
//   const data = XLSX.utils.sheet_to_json(sheet);

//   return data.map(row => ({
//     jenis_infrastruktur: row['Jenis Infrastruktur'] || '',
//     lokasi: row['Nama/Lokasi'] || '',
//     jarak: row['Jarak dari Longsor'] || '',
//     status: row['Status'] || '',
//     tingkat_risiko: row['Tingkat Risiko'] || ''
//   }));
// }

// async function insertCurahHujan(client, kejadianId, data) {
//   for (const row of data) {
//     await client.query(
//       `INSERT INTO curah_hujan (kejadian_id, hari, jam, curah_hujan) VALUES ($1, $2, $3, $4)`,
//       [kejadianId, row.hari, row.jam, row.curah_hujan]
//     );
//   }
// }

// async function insertStatusDasBanjir(client, kejadianId, data) {
//   for (const row of data) {
//     await client.query(
//       `INSERT INTO status_das_banjir (kejadian_id, nama_das, luas, tutupan_vegetasi, sedimentasi, status_kekritisan)
//        VALUES ($1, $2, $3, $4, $5, $6)`,
//       [kejadianId, row.nama_das, row.luas, row.tutupan_vegetasi, row.sedimentasi, row.status_kekritisan]
//     );
//   }
// }

// async function insertStatusDasKebakaran(client, kejadianId, data) {
//   for (const row of data) {
//     await client.query(
//       `INSERT INTO status_das_kebakaran (kejadian_id, nama_das, luas, tutupan_vegetasi, status, tingkat_risiko)
//        VALUES ($1, $2, $3, $4, $5, $6)`,
//       [kejadianId, row.nama_das, row.luas, row.tutupan_vegetasi, row.status, row.tingkat_risiko]
//     );
//   }
// }

// async function insertTutupanDas(client, kejadianId, data) {
//   for (const row of data) {
//     await client.query(
//       `INSERT INTO tutupan_das (kejadian_id, jenis_tutupan, persentase) VALUES ($1, $2, $3)`,
//       [kejadianId, row.jenis_tutupan, row.persentase]
//     );
//   }
// }

// async function insertKemiringanLahan(client, kejadianId, data) {
//   if (!data) return;
//   await client.query(
//     `INSERT INTO kemiringan_lahan (kejadian_id, sangat_datar, datar, landai, agak_curam, curam, sangat_curam)
//      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
//     [kejadianId, data.sangat_datar, data.datar, data.landai, data.agak_curam, data.curam, data.sangat_curam]
//   );
// }

// async function insertKepadatanPemukiman(client, kejadianId, data) {
//   for (const row of data) {
//     await client.query(
//       `INSERT INTO kepadatan_pemukiman (kejadian_id, kel_desa, jumlah_kk, jumlah_jiwa, kepadatan, klasifikasi)
//        VALUES ($1, $2, $3, $4, $5, $6)`,
//       [kejadianId, row.kel_desa, row.jumlah_kk, row.jumlah_jiwa, row.kepadatan, row.klasifikasi]
//     );
//   }
// }

// async function insertKemiringanLereng(client, kejadianId, data) {
//   for (const row of data) {
//     await client.query(
//       `INSERT INTO kemiringan_lereng (kejadian_id, segmen, kemiringan, luas, tinggi_lereng, klasifikasi_bahaya)
//        VALUES ($1, $2, $3, $4, $5, $6)`,
//       [kejadianId, row.segmen, row.kemiringan, row.luas, row.tinggi_lereng, row.klasifikasi_bahaya]
//     );
//   }
// }

// async function insertTopografi(client, kejadianId, data) {
//   for (const row of data) {
//     await client.query(
//       `INSERT INTO topografi (kejadian_id, area, ketinggian, bentuk_lahan, kelerengan, potensi_longsor)
//        VALUES ($1, $2, $3, $4, $5, $6)`,
//       [kejadianId, row.area, row.ketinggian, row.bentuk_lahan, row.kelerengan, row.potensi_longsor]
//     );
//   }
// }

// async function insertGeologi(client, kejadianId, data) {
//   for (const row of data) {
//     await client.query(
//       `INSERT INTO geologi (kejadian_id, parameter, deskripsi, klasifikasi, pengaruh_terhadap_longsor)
//        VALUES ($1, $2, $3, $4, $5)`,
//       [kejadianId, row.parameter, row.deskripsi, row.klasifikasi, row.pengaruh_terhadap_longsor]
//     );
//   }
// }

// async function insertJenisTanah(client, kejadianId, data) {
//   for (const row of data) {
//     await client.query(
//       `INSERT INTO jenis_tanah (kejadian_id, jenis_tanah, persentase) VALUES ($1, $2, $3)`,
//       [kejadianId, row.jenis_tanah, row.persentase]
//     );
//   }
// }

// async function insertPatahan(client, kejadianId, data) {
//   for (const row of data) {
//     await client.query(
//       `INSERT INTO patahan (kejadian_id, nama_patahan, jarak, status, tingkat_aktivitas, risiko)
//        VALUES ($1, $2, $3, $4, $5, $6)`,
//       [kejadianId, row.nama_patahan, row.jarak, row.status, row.tingkat_aktivitas, row.risiko]
//     );
//   }
// }

// async function insertTutupanLahan(client, kejadianId, data) {
//   for (const row of data) {
//     await client.query(
//       `INSERT INTO tutupan_lahan (kejadian_id, jenis_tutupan, persentase) VALUES ($1, $2, $3)`,
//       [kejadianId, row.jenis_tutupan, row.persentase]
//     );
//   }
// }

// async function insertInfrastruktur(client, kejadianId, data) {
//   for (const row of data) {
//     await client.query(
//       `INSERT INTO infrastruktur (kejadian_id, jenis_infrastruktur, lokasi, jarak, status, tingkat_risiko)
//        VALUES ($1, $2, $3, $4, $5, $6)`,
//       [kejadianId, row.jenis_infrastruktur, row.lokasi, row.jarak, row.status, row.tingkat_risiko]
//     );
//   }
// }

// // Aggregate Curah Hujan
// async function aggregateCurahHujan(kejadianIds, perJam = true) {
//   if (kejadianIds.length === 0) return [];

//   const query = `
//     SELECT hari, jam, curah_hujan
//     FROM curah_hujan
//     WHERE kejadian_id = ANY($1)
//     ${perJam ? 'AND jam IS NOT NULL' : 'AND jam IS NULL'}
//     ORDER BY hari, jam
//   `;

//   const result = await client.query(query, [kejadianIds]);
//   const data = result.rows;

//   // Group by hari and jam
//   const grouped = {};

//   data.forEach(row => {
//     const key = perJam ? `${row.hari}_${row.jam}` : row.hari;

//     if (!grouped[key]) {
//       grouped[key] = {
//         hari: row.hari,
//         jam: row.jam,
//         values: [],
//         count: 0
//       };
//     }

//     grouped[key].values.push(parseFloat(row.curah_hujan));
//     grouped[key].count++;
//   });

//   // Calculate average for same hari/jam
//   const aggregated = Object.values(grouped).map(group => ({
//     hari: group.hari,
//     jam: group.jam,
//     curah_hujan: (group.values.reduce((a, b) => a + b, 0) / group.count).toFixed(2)
//   }));

//   return aggregated;
// }

// // Aggregate Status DAS (append all)
// async function aggregateStatusDas(kejadianIds, tableName) {
//   if (kejadianIds.length === 0) return [];

//   const query = `SELECT * FROM ${tableName} WHERE kejadian_id = ANY($1)`;
//   const result = await client.query(query, [kejadianIds]);

//   return result.rows;
// }

// // Aggregate Tutupan (DAS/Lahan) - percentage based
// async function aggregateTutupan(kejadianIds, tableName) {
//   if (kejadianIds.length === 0) return [];

//   const columnName = tableName === 'tutupan_das' ? 'jenis_tutupan' :
//                      tableName === 'tutupan_lahan' ? 'jenis_tutupan' : 'jenis_tanah';

//   const query = `
//     SELECT ${columnName}, persentase, kejadian_id
//     FROM ${tableName}
//     WHERE kejadian_id = ANY($1)
//   `;

//   const result = await client.query(query, [kejadianIds]);
//   const data = result.rows;

//   // Group by jenis
//   const grouped = {};

//   data.forEach(row => {
//     const jenis = row[columnName];

//     if (!grouped[jenis]) {
//       grouped[jenis] = {
//         values: [],
//         kejadian_ids: new Set()
//       };
//     }

//     grouped[jenis].values.push(parseFloat(row.persentase));
//     grouped[jenis].kejadian_ids.add(row.kejadian_id);
//   });

//   // Calculate weighted average and normalize to 100%
//   let aggregated = Object.keys(grouped).map(jenis => ({
//     [columnName]: jenis,
//     persentase: grouped[jenis].values.reduce((a, b) => a + b, 0) / grouped[jenis].kejadian_ids.size
//   }));

//   // Normalize to 100%
//   const total = aggregated.reduce((sum, item) => sum + item.persentase, 0);

//   if (total > 0) {
//     aggregated = aggregated.map(item => ({
//       ...item,
//       persentase: ((item.persentase / total) * 100).toFixed(2)
//     }));
//   }

//   return aggregated;
// }

// // Aggregate Kemiringan Lahan
// async function aggregateKemiringanLahan(kejadianIds) {
//   if (kejadianIds.length === 0) return null;

//   const query = `SELECT * FROM kemiringan_lahan WHERE kejadian_id = ANY($1)`;
//   const result = await client.query(query, [kejadianIds]);
//   const data = result.rows;

//   if (data.length === 0) return null;

//   // Sum all values
//   const aggregated = {
//     sangat_datar: 0,
//     datar: 0,
//     landai: 0,
//     agak_curam: 0,
//     curam: 0,
//     sangat_curam: 0
//   };

//   data.forEach(row => {
//     aggregated.sangat_datar += parseFloat(row.sangat_datar) || 0;
//     aggregated.datar += parseFloat(row.datar) || 0;
//     aggregated.landai += parseFloat(row.landai) || 0;
//     aggregated.agak_curam += parseFloat(row.agak_curam) || 0;
//     aggregated.curam += parseFloat(row.curam) || 0;
//     aggregated.sangat_curam += parseFloat(row.sangat_curam) || 0;
//   });

//   return aggregated;
// }

// // Aggregate Tables (append all rows)
// async function aggregateTable(kejadianIds, tableName) {
//   if (kejadianIds.length === 0) return [];

//   const query = `SELECT * FROM ${tableName} WHERE kejadian_id = ANY($1)`;
//   const result = await client.query(query, [kejadianIds]);

//   return result.rows;
// }

// // Aggregate Banjir Data
// async function aggregateBanjirData(kejadianIds) {
//   return {
//     curah_hujan: await aggregateCurahHujan(kejadianIds, true),
//     status_das: await aggregateStatusDas(kejadianIds, 'status_das_banjir'),
//     tutupan_das: await aggregateTutupan(kejadianIds, 'tutupan_das'),
//     kemiringan_lahan: await aggregateKemiringanLahan(kejadianIds),
//     kepadatan_pemukiman: await aggregateTable(kejadianIds, 'kepadatan_pemukiman')
//   };
// }

// // Aggregate Kebakaran Data
// async function aggregateKebakaranData(kejadianIds) {
//   return {
//     status_das: await aggregateStatusDas(kejadianIds, 'status_das_kebakaran'),
//     tutupan_das: await aggregateTutupan(kejadianIds, 'tutupan_das'),
//     kemiringan_lahan: await aggregateKemiringanLahan(kejadianIds),
//     kepadatan_pemukiman: await aggregateTable(kejadianIds, 'kepadatan_pemukiman')
//   };
// }

// // Aggregate Longsor Data
// async function aggregateLongsorData(kejadianIds) {
//   return {
//     curah_hujan: await aggregateCurahHujan(kejadianIds, false),
//     kemiringan_lereng: await aggregateTable(kejadianIds, 'kemiringan_lereng'),
//     topografi: await aggregateTable(kejadianIds, 'topografi'),
//     geologi: await aggregateTable(kejadianIds, 'geologi'),
//     jenis_tanah: await aggregateTutupan(kejadianIds, 'jenis_tanah'),
//     patahan: await aggregateTable(kejadianIds, 'patahan'),
//     tutupan_lahan: await aggregateTutupan(kejadianIds, 'tutupan_lahan'),
//     infrastruktur: await aggregateTable(kejadianIds, 'infrastruktur'),
//     kepadatan_pemukiman: await aggregateTable(kejadianIds, 'kepadatan_pemukiman')
//   };
// }

// // Hardcoded reference mapping dengan contoh data
// const REFERENCE_MAPPING = {
//   // lahan_kritis: bpdas column
//   lahan_kritis: {
//       das_to_bpdas: {
//           'BENGAWAN SOLO': 'Solo',
//           'BEH': 'Dodokan Moyosari',
//           'DAS BEH': 'Dodokan Moyosari',
//           'DAS JANGKA': 'Dodokan Moyosari',
//           'DAS KAMBU': 'Dodokan Moyosari',
//           'DAS NAE 1': 'Dodokan Moyosari',
//           'DAS NAE 2': 'Dodokan Moyosari',
//           'NAE': 'Dodokan Moyosari',
//           'DAS MOYO': 'Dodokan Moyosari',
//           'DAS PALAPARADO': 'Dodokan Moyosari',
//           'DAS REA': 'Dodokan Moyosari',
//           'REA': 'Dodokan Moyosari',
//           'DAS GILI RHEE': 'Dodokan Moyosari',
//           'DAS TULA': 'Dodokan Moyosari',
//           'DAS UTAN': 'Dodokan Moyosari',
//           'DAS SUMBAWA': 'Dodokan Moyosari',
//           'UNDA': 'Unda Anyar',
//           'AYUNG': 'Unda Anyar',
//           'RAWA PENET': 'Unda Anyar',
//           'YEH PENET': 'Unda Anyar',
//           'SABA': 'Unda Anyar',
//           'BALIAN': 'Unda Anyar',
//           'DAYA': 'Unda Anyar',
//           'DAYA 1': 'Unda Anyar',
//           'DAYA 2': 'Unda Anyar',
//           'DAS BARU': 'Brantas Sampean',
//           'BARU': 'Brantas Sampean',
//           'BARU KECIL': 'Brantas Sampean',
//           'BONDOYUDO': 'Brantas Sampean',
//           'SAMPEAN': 'Brantas Sampean',
//           'MAYANG': 'Brantas Sampean',
//           'BRANTAS': 'Brantas Sampean',
//           'CIMANUK': 'Cimanuk Citanduy',
//           'CIMANUK KECIL': 'Cimanuk Citanduy',
//           'CISANGGARUNG': 'Cimanuk Citanduy',
//           'CITANDUY': 'Cimanuk Citanduy',
//           'CIWULAN': 'Cimanuk Citanduy',
//           'CIKANDANG': 'Cimanuk Citanduy',
//           'CIKAENGAN': 'Cimanuk Citanduy',
//           'CIMEDANG': 'Cimanuk Citanduy',
//           'CILAKI': 'Citarum Ciliwung',
//           'PEMALI': 'Pemali Jratun',
//           'COMAL': 'Pemali Jratun',
//           'BODRI': 'Pemali Jratun',
//           'TUNTANG': 'Pemali Jratun',
//           'SERANG': 'Pemali Jratun',
//           'SERANG 2': 'Pemali Jratun',
//           'JUWATA': 'Pemali Jratun',
//           'BOGOWONTO': 'Serayu Opak Progo',
//           'SERAYU': 'Serayu Opak Progo',
//           'PROGO': 'Serayu Opak Progo',
//           'OPAK': 'Serayu Opak Progo',
//           'OYO': 'Serayu Opak Progo',
//           'SERUYAN': 'Kahayan',
//           'KAHAYAN': 'Kahayan',
//           'KATINGAN': 'Kahayan',
//           'MENTAYA': 'Kahayan',
//           'JELAI': 'Kahayan',
//           'KOTAWARINGIN PULAU': 'Kahayan',
//           'KOTAWARINGIN': 'Kahayan',
//           'BARITO': 'Barito',
//           'SEBUKU': 'Mahakam Berau',
//           'SEBUKU BESAR': 'Mahakam Berau',
//           'SEBUKU KECIL': 'Mahakam Berau',
//           'SEBUKU SELATAN': 'Mahakam Berau',
//           'SEBAKUNG': 'Mahakam Berau',
//           'SESAYAP': 'Mahakam Berau',
//           'KAYAN': 'Mahakam Berau',
//           'BERAU': 'Mahakam Berau',
//           'MAHAKAM': 'Mahakam Berau',
//           'KAPUAS - MURUNG PULAU': 'Kapuas',
//           'KAPUAS': 'Kapuas',
//           'PM KAPUAS DABUNG': 'Kapuas',
//           'KAPUAS - MURUNG': 'Kapuas',
//       },
//       provinsi_to_bpdas: {
//           'Jawa Tengah': ['Solo', 'Cimanuk Citanduy', 'Pemali Jratun', 'Serayu Opak Progo'],
//           'Jawa Timur': ['Solo', 'Brantas Sampean'],
//           'Nusa Tenggara Barat': 'Dodokan Moyosari',
//           'Bali': 'Unda Anyar',
//           'Jawa Barat': ['Cimanuk Citanduy', 'Citarum Ciliwung'],
//           'Banten': 'Citarum Ciliwung',
//           'DKI Jakarta': 'Citarum Ciliwung',
//           'Daerah Istimewa Yogyakarta': 'Serayu Opak Progo',
//           'Kalimantan Tengah': ['Kahayan', 'Barito'],
//           'Kalimantan Selatan': ['Kahayan', 'Barito'],
//           'Kalimantan Barat': ['Kahayan', 'Kapuas'],
//           'Kalimantan Timur': 'Mahakam Berau',
//           'Kalimantan Utara': 'Mahakam Berau',
//       }
//   },

//   // penutupan_lahan_2024: kode_prov column
//   penutupan_lahan_2024: {
//     das_to_kode_prov: {
//         'BENGAWAN SOLO': ['33', '35'],
//         'BEH': '52',
//         'DAS BEH': '52',
//         'DAS JANGKA': '52',
//         'DAS KAMBU': '52',
//         'DAS NAE 1': '52',
//         'DAS NAE 2': '52',
//         'NAE': '52',
//         'DAS MOYO': '52',
//         'DAS PALAPARADO': '52',
//         'DAS REA': '52',
//         'REA': '52',
//         'DAS GILI RHEE': '52',
//         'DAS TULA': '52',
//         'DAS UTAN': '52',
//         'DAS SUMBAWA': '52',
//         'UNDA': '51',
//         'AYUNG': '51',
//         'RAWA PENET': '51',
//         'YEH PENET': '51',
//         'SABA': '51',
//         'BALIAN': '51',
//         'DAYA': '51',
//         'DAYA 1': '51',
//         'DAYA 2': '51',
//         'DAS BARU': '35',
//         'BARU': '35',
//         'BARU KECIL': '35',
//         'BONDOYUDO': '35',
//         'SAMPEAN': '35',
//         'MAYANG': '35',
//         'BRANTAS': '35',
//         'CIMANUK': ['33', '32'],
//         'CIMANUK KECIL': ['33', '32'],
//         'CISANGGARUNG': ['33', '32'],
//         'CITANDUY': ['33', '32'],
//         'CIWULAN': ['33', '32'],
//         'CIKANDANG': ['33', '32'],
//         'CIKAENGAN': ['33', '32'],
//         'CIMEDANG': ['33', '32'],
//         'CILAKI': ['32', '36', '31'],
//         'PEMALI': '33',
//         'COMAL': '33',
//         'BODRI': '33',
//         'TUNTANG': '33',
//         'SERANG': '33',
//         'SERANG 2': '33',
//         'JUWATA': '33',
//         'BOGOWONTO': ['33', '34'],
//         'SERAYU': ['33', '34'],
//         'PROGO': ['33', '34'],
//         'OPAK': ['33', '34'],
//         'OYO': ['33', '34'],
//         'SERUYAN': ['62', '63', '61'],
//         'KAHAYAN': ['62', '63', '61'],
//         'KATINGAN': ['62', '63', '61'],
//         'MENTAYA': ['62', '63', '61'],
//         'JELAI': ['62', '63', '61'],
//         'KOTAWARINGIN PULAU': ['62', '63', '61'],
//         'KOTAWARINGIN': ['62', '63', '61'],
//         'BARITO': ['63', '62'],
//         'SEBUKU': ['64', '65'],
//         'SEBUKU BESAR': ['64', '65'],
//         'SEBUKU KECIL': ['64', '65'],
//         'SEBUKU SELATAN': ['64', '65'],
//         'SEBAKUNG': ['64', '65'],
//         'SESAYAP': ['64', '65'],
//         'KAYAN': ['64', '65'],
//         'BERAU': ['64', '65'],
//         'MAHAKAM': ['64', '65'],
//         'KAPUAS - MURUNG PULAU': '61',
//         'KAPUAS': '61',
//         'PM KAPUAS DABUNG': '61',
//         'KAPUAS - MURUNG': '61',
//     }
//   },

//   // rawan_erosi: n_bpdas column
//   rawan_erosi: {
//       das_to_n_bpdas: {
//           'BENGAWAN SOLO': 'Solo',
//           'BEH': 'Dodokan Moyosari',
//           'DAS BEH': 'Dodokan Moyosari',
//           'DAS JANGKA': 'Dodokan Moyosari',
//           'DAS KAMBU': 'Dodokan Moyosari',
//           'DAS NAE 1': 'Dodokan Moyosari',
//           'DAS NAE 2': 'Dodokan Moyosari',
//           'NAE': 'Dodokan Moyosari',
//           'DAS MOYO': 'Dodokan Moyosari',
//           'DAS PALAPARADO': 'Dodokan Moyosari',
//           'DAS REA': 'Dodokan Moyosari',
//           'REA': 'Dodokan Moyosari',
//           'DAS GILI RHEE': 'Dodokan Moyosari',
//           'DAS TULA': 'Dodokan Moyosari',
//           'DAS UTAN': 'Dodokan Moyosari',
//           'DAS SUMBAWA': 'Dodokan Moyosari',
//           'UNDA': 'Unda Anyar',
//           'AYUNG': 'Unda Anyar',
//           'RAWA PENET': 'Unda Anyar',
//           'YEH PENET': 'Unda Anyar',
//           'SABA': 'Unda Anyar',
//           'BALIAN': 'Unda Anyar',
//           'DAYA': 'Unda Anyar',
//           'DAYA 1': 'Unda Anyar',
//           'DAYA 2': 'Unda Anyar',
//           'DAS BARU': 'Brantas Sampean',
//           'BARU': 'Brantas Sampean',
//           'BARU KECIL': 'Brantas Sampean',
//           'BONDOYUDO': 'Brantas Sampean',
//           'SAMPEAN': 'Brantas Sampean',
//           'MAYANG': 'Brantas Sampean',
//           'BRANTAS': 'Brantas Sampean',
//           'CIMANUK': 'Cimanuk Citanduy',
//           'CIMANUK KECIL': 'Cimanuk Citanduy',
//           'CISANGGARUNG': 'Cimanuk Citanduy',
//           'CITANDUY': 'Cimanuk Citanduy',
//           'CIWULAN': 'Cimanuk Citanduy',
//           'CIKANDANG': 'Cimanuk Citanduy',
//           'CIKAENGAN': 'Cimanuk Citanduy',
//           'CIMEDANG': 'Cimanuk Citanduy',
//           'CILAKI': 'Citarum Ciliwung',
//           'PEMALI': 'Pemali Jratun',
//           'COMAL': 'Pemali Jratun',
//           'BODRI': 'Pemali Jratun',
//           'TUNTANG': 'Pemali Jratun',
//           'SERANG': 'Pemali Jratun',
//           'SERANG 2': 'Pemali Jratun',
//           'JUWATA': 'Pemali Jratun',
//           'BOGOWONTO': 'Serayu Opak Progo',
//           'SERAYU': 'Serayu Opak Progo',
//           'PROGO': 'Serayu Opak Progo',
//           'OPAK': 'Serayu Opak Progo',
//           'OYO': 'Serayu Opak Progo',
//           'SERUYAN': 'Kahayan',
//           'KAHAYAN': 'Kahayan',
//           'KATINGAN': 'Kahayan',
//           'MENTAYA': 'Kahayan',
//           'JELAI': 'Kahayan',
//           'KOTAWARINGIN PULAU': 'Kahayan',
//           'KOTAWARINGIN': 'Kahayan',
//           'BARITO': 'Barito',
//           'SEBUKU': 'Mahakam Berau',
//           'SEBUKU BESAR': 'Mahakam Berau',
//           'SEBUKU KECIL': 'Mahakam Berau',
//           'SEBUKU SELATAN': 'Mahakam Berau',
//           'SEBAKUNG': 'Mahakam Berau',
//           'SESAYAP': 'Mahakam Berau',
//           'KAYAN': 'Mahakam Berau',
//           'BERAU': 'Mahakam Berau',
//           'MAHAKAM': 'Mahakam Berau',
//           'KAPUAS - MURUNG PULAU': 'Kapuas',
//           'KAPUAS': 'Kapuas',
//           'PM KAPUAS DABUNG': 'Kapuas',
//           'KAPUAS - MURUNG': 'Kapuas',
//       },
//       provinsi_to_n_bpdas: {
//           'Jawa Tengah': ['Solo', 'Cimanuk Citanduy', 'Pemali Jratun', 'Serayu Opak Progo'],
//           'Jawa Timur': ['Solo', 'Brantas Sampean'],
//           'Nusa Tenggara Barat': 'Dodokan Moyosari',
//           'Bali': 'Unda Anyar',
//           'Jawa Barat': ['Cimanuk Citanduy', 'Citarum Ciliwung'],
//           'Banten': 'Citarum Ciliwung',
//           'DKI Jakarta': 'Citarum Ciliwung',
//           'Daerah Istimewa Yogyakarta': 'Serayu Opak Progo',
//           'Kalimantan Tengah': ['Kahayan', 'Barito'],
//           'Kalimantan Selatan': ['Kahayan', 'Barito'],
//           'Kalimantan Barat': ['Kahayan', 'Kapuas'],
//           'Kalimantan Timur': 'Mahakam Berau',
//           'Kalimantan Utara': 'Mahakam Berau',
//       }
//   },

//   // rawan_karhutla_2024: provinsi column
//     rawan_karhutla_2024: {
//       provinsi_direct: {
//           'Jawa Tengah': 'Jawa Tengah',
//           'Jawa Timur': 'Jawa Timur',
//           'Nusa Tenggara Barat': 'Nusa Tenggara Barat',
//           'Bali': 'Bali',
//           'Jawa Barat': 'Jawa Barat',
//           'DKI Jakarta': 'DKI Jakarta',
//           'Banten': 'Banten',
//           'D.I. Yogyakarta': 'Daerah Istimewa Yogyakarta',
//           'Kalimantan Selatan': 'Kalimantan Selatan',
//           'Kalimantan Tengah': 'Kalimantan Tengah',
//           'Kalimantan Barat': 'Kalimantan Barat',
//           'Kalimantan Timur': 'Kalimantan Timur',
//           'Kalimantan Utara': 'Kalimantan Utara',
//           'Maluku Utara': 'Maluku Utara',
//           'Maluku': 'Maluku',
//           'Papua Tengah': 'Papua Tengah',
//           'Papua Barat': 'Papua Barat',
//           'Papua Selatan': 'Papua Selatan',
//           'Papua': 'Papua',
//           'Papua Pegunungan': 'Papua Pegunungan',
//           'Gorontalo': 'Gorontalo',
//           'Sulawesi Tengah': 'Sulawesi Tengah',
//           'Sulawesi Barat': 'Sulawesi Barat',
//           'Sulawesi Tenggara': 'Sulawesi Tenggara',
//           'Sulawesi Selatan': 'Sulawesi Selatan',
//           'Sulawesi Utara': 'Sulawesi Utara',
//           'Riau': 'Riau',
//           'Sumatera Barat': 'Sumatera Barat',
//           'Jambi': 'Jambi',
//           'Sumatera Utara': 'Sumatera Utara',
//           'Bengkulu': 'Bengkulu',
//           'Sumatera Selatan': 'Sumatera Selatan',
//           'Kep. Bangka Belitung': 'Kepulauan Bangka Belitung',
//           'Lampung': 'Lampung',
//           'Aceh': 'Aceh',
//           'Kepulauan Riau': 'Kepulauan Riau',
//           'Papua Barat Daya': 'Papua Barat Daya',
//       },
//       das_to_provinsi: {
//           'BENGAWAN SOLO': ['Jawa Tengah', 'Jawa Timur'],
//           'BEH': 'Nusa Tenggara Barat',
//           'DAS BEH': 'Nusa Tenggara Barat',
//           'DAS JANGKA': 'Nusa Tenggara Barat',
//           'DAS KAMBU': 'Nusa Tenggara Barat',
//           'DAS NAE 1': 'Nusa Tenggara Barat',
//           'DAS NAE 2': 'Nusa Tenggara Barat',
//           'NAE': 'Nusa Tenggara Barat',
//           'DAS MOYO': 'Nusa Tenggara Barat',
//           'DAS PALAPARADO': 'Nusa Tenggara Barat',
//           'DAS REA': 'Nusa Tenggara Barat',
//           'REA': 'Nusa Tenggara Barat',
//           'DAS GILI RHEE': 'Nusa Tenggara Barat',
//           'DAS TULA': 'Nusa Tenggara Barat',
//           'DAS UTAN': 'Nusa Tenggara Barat',
//           'DAS SUMBAWA': 'Nusa Tenggara Barat',
//           'UNDA': 'Bali',
//           'AYUNG': 'Bali',
//           'RAWA PENET': 'Bali',
//           'YEH PENET': 'Bali',
//           'SABA': 'Bali',
//           'BALIAN': 'Bali',
//           'DAYA': 'Bali',
//           'DAYA 1': 'Bali',
//           'DAYA 2': 'Bali',
//           'DAS BARU': 'Jawa Timur',
//           'BARU': 'Jawa Timur',
//           'BARU KECIL': 'Jawa Timur',
//           'BONDOYUDO': 'Jawa Timur',
//           'SAMPEAN': 'Jawa Timur',
//           'MAYANG': 'Jawa Timur',
//           'BRANTAS': 'Jawa Timur',
//           'CIMANUK': ['Jawa Tengah', 'Jawa Barat'],
//           'CIMANUK KECIL': ['Jawa Tengah', 'Jawa Barat'],
//           'CISANGGARUNG': ['Jawa Tengah', 'Jawa Barat'],
//           'CITANDUY': ['Jawa Tengah', 'Jawa Barat'],
//           'CIWULAN': ['Jawa Tengah', 'Jawa Barat'],
//           'CIKANDANG': ['Jawa Tengah', 'Jawa Barat'],
//           'CIKAENGAN': ['Jawa Tengah', 'Jawa Barat'],
//           'CIMEDANG': ['Jawa Tengah', 'Jawa Barat'],
//           'CILAKI': ['Jawa Barat', 'Banten', 'DKI Jakarta'],
//           'PEMALI': 'Jawa Tengah',
//           'COMAL': 'Jawa Tengah',
//           'BODRI': 'Jawa Tengah',
//           'TUNTANG': 'Jawa Tengah',
//           'SERANG': 'Jawa Tengah',
//           'SERANG 2': 'Jawa Tengah',
//           'JUWATA': 'Jawa Tengah',
//           'BOGOWONTO': ['Jawa Tengah', 'Daerah Istimewa Yogyakarta'],
//           'SERAYU': ['Jawa Tengah', 'Daerah Istimewa Yogyakarta'],
//           'PROGO': ['Jawa Tengah', 'Daerah Istimewa Yogyakarta'],
//           'OPAK': ['Jawa Tengah', 'Daerah Istimewa Yogyakarta'],
//           'OYO': ['Jawa Tengah', 'Daerah Istimewa Yogyakarta'],
//           'SERUYAN': ['Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Barat'],
//           'KAHAYAN': ['Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Barat'],
//           'KATINGAN': ['Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Barat'],
//           'MENTAYA': ['Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Barat'],
//           'JELAI': ['Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Barat'],
//           'KOTAWARINGIN PULAU': ['Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Barat'],
//           'KOTAWARINGIN': ['Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Barat'],
//           'BARITO': ['Kalimantan Selatan', 'Kalimantan Tengah'],
//           'SEBUKU': ['Kalimantan Timur', 'Kalimantan Utara'],
//           'SEBUKU BESAR': ['Kalimantan Timur', 'Kalimantan Utara'],
//           'SEBUKU KECIL': ['Kalimantan Timur', 'Kalimantan Utara'],
//           'SEBUKU SELATAN': ['Kalimantan Timur', 'Kalimantan Utara'],
//           'SEBAKUNG': ['Kalimantan Timur', 'Kalimantan Utara'],
//           'SESAYAP': ['Kalimantan Timur', 'Kalimantan Utara'],
//           'KAYAN': ['Kalimantan Timur', 'Kalimantan Utara'],
//           'BERAU': ['Kalimantan Timur', 'Kalimantan Utara'],
//           'MAHAKAM': ['Kalimantan Timur', 'Kalimantan Utara'],
//           'KAPUAS - MURUNG PULAU': 'Kalimantan Barat',
//           'KAPUAS': 'Kalimantan Barat',
//           'PM KAPUAS DABUNG': 'Kalimantan Barat',
//           'KAPUAS - MURUNG': 'Kalimantan Barat',
//       }
//   },

//   // rawan_limpasan: wil_kerja column
//     rawan_limpasan: {
//       das_to_wil_kerja: {
//           'BENGAWAN SOLO': 'BPDAS SOLO',
//           'BEH': 'BPDAS DODOKAN MOYOSARI',
//           'DAS BEH': 'BPDAS DODOKAN MOYOSARI',
//           'DAS JANGKA': 'BPDAS DODOKAN MOYOSARI',
//           'DAS KAMBU': 'BPDAS DODOKAN MOYOSARI',
//           'DAS NAE 1': 'BPDAS DODOKAN MOYOSARI',
//           'DAS NAE 2': 'BPDAS DODOKAN MOYOSARI',
//           'NAE': 'BPDAS DODOKAN MOYOSARI',
//           'DAS MOYO': 'BPDAS DODOKAN MOYOSARI',
//           'DAS PALAPARADO': 'BPDAS DODOKAN MOYOSARI',
//           'DAS REA': 'BPDAS DODOKAN MOYOSARI',
//           'REA': 'BPDAS DODOKAN MOYOSARI',
//           'DAS GILI RHEE': 'BPDAS DODOKAN MOYOSARI',
//           'DAS TULA': 'BPDAS DODOKAN MOYOSARI',
//           'DAS UTAN': 'BPDAS DODOKAN MOYOSARI',
//           'DAS SUMBAWA': 'BPDAS DODOKAN MOYOSARI',
//           'UNDA': 'BPDAS UNDA ANYAR',
//           'AYUNG': 'BPDAS UNDA ANYAR',
//           'RAWA PENET': 'BPDAS UNDA ANYAR',
//           'YEH PENET': 'BPDAS UNDA ANYAR',
//           'SABA': 'BPDAS UNDA ANYAR',
//           'BALIAN': 'BPDAS UNDA ANYAR',
//           'DAYA': 'BPDAS UNDA ANYAR',
//           'DAYA 1': 'BPDAS UNDA ANYAR',
//           'DAYA 2': 'BPDAS UNDA ANYAR',
//           'DAS BARU': ['BPDAS BRANTAS', 'BPDAS SAMPEAN'],
//           'BARU': ['BPDAS BRANTAS', 'BPDAS SAMPEAN'],
//           'BARU KECIL': ['BPDAS BRANTAS', 'BPDAS SAMPEAN'],
//           'BONDOYUDO': ['BPDAS BRANTAS', 'BPDAS SAMPEAN'],
//           'SAMPEAN': ['BPDAS BRANTAS', 'BPDAS SAMPEAN'],
//           'MAYANG': ['BPDAS BRANTAS', 'BPDAS SAMPEAN'],
//           'BRANTAS': ['BPDAS BRANTAS', 'BPDAS SAMPEAN'],
//           'CIMANUK': 'BPDAS CIMANUK CITANDUY',
//           'CIMANUK KECIL': 'BPDAS CIMANUK CITANDUY',
//           'CISANGGARUNG': 'BPDAS CIMANUK CITANDUY',
//           'CITANDUY': 'BPDAS CIMANUK CITANDUY',
//           'CIWULAN': 'BPDAS CIMANUK CITANDUY',
//           'CIKANDANG': 'BPDAS CIMANUK CITANDUY',
//           'CIKAENGAN': 'BPDAS CIMANUK CITANDUY',
//           'CIMEDANG': 'BPDAS CIMANUK CITANDUY',
//           'CILAKI': 'BPDAS CITARUM CILIWUNG',
//           'PEMALI': 'BPDAS PEMALI JRATUN',
//           'COMAL': 'BPDAS PEMALI JRATUN',
//           'BODRI': 'BPDAS PEMALI JRATUN',
//           'TUNTANG': 'BPDAS PEMALI JRATUN',
//           'SERANG': 'BPDAS PEMALI JRATUN',
//           'SERANG 2': 'BPDAS PEMALI JRATUN',
//           'JUWATA': 'BPDAS PEMALI JRATUN',
//           'BOGOWONTO': 'BPDAS SERAYU OPAK PROGO',
//           'SERAYU': 'BPDAS SERAYU OPAK PROGO',
//           'PROGO': 'BPDAS SERAYU OPAK PROGO',
//           'OPAK': 'BPDAS SERAYU OPAK PROGO',
//           'OYO': 'BPDAS SERAYU OPAK PROGO',
//           'SERUYAN': 'BPDAS KAHAYAN',
//           'KAHAYAN': 'BPDAS KAHAYAN',
//           'KATINGAN': 'BPDAS KAHAYAN',
//           'MENTAYA': 'BPDAS KAHAYAN',
//           'JELAI': 'BPDAS KAHAYAN',
//           'KOTAWARINGIN PULAU': 'BPDAS KAHAYAN',
//           'KOTAWARINGIN': 'BPDAS KAHAYAN',
//           'BARITO': 'BPDAS BARITO',
//           'SEBUKU': 'BPDAS MAHAKAM BERAU',
//           'SEBUKU BESAR': 'BPDAS MAHAKAM BERAU',
//           'SEBUKU KECIL': 'BPDAS MAHAKAM BERAU',
//           'SEBUKU SELATAN': 'BPDAS MAHAKAM BERAU',
//           'SEBAKUNG': 'BPDAS MAHAKAM BERAU',
//           'SESAYAP': 'BPDAS MAHAKAM BERAU',
//           'KAYAN': 'BPDAS MAHAKAM BERAU',
//           'BERAU': 'BPDAS MAHAKAM BERAU',
//           'MAHAKAM': 'BPDAS MAHAKAM BERAU',
//           'KAPUAS - MURUNG PULAU': 'BPDAS KAPUAS',
//           'KAPUAS': 'BPDAS KAPUAS',
//           'PM KAPUAS DABUNG': 'BPDAS KAPUAS',
//           'KAPUAS - MURUNG': 'BPDAS KAPUAS',
//       },
//       provinsi_to_wil_kerja: {
//           'Jawa Tengah': ['BPDAS SOLO', 'BPDAS CIMANUK CITANDUY', 'BPDAS PEMALI JRATUN', 'BPDAS SERAYU OPAK PROGO'],
//           'Jawa Timur': ['BPDAS SOLO', 'BPDAS BRANTAS', 'BPDAS SAMPEAN'],
//           'Nusa Tenggara Barat': 'BPDAS DODOKAN MOYOSARI',
//           'Bali': 'BPDAS UNDA ANYAR',
//           'Jawa Barat': ['BPDAS CIMANUK CITANDUY', 'BPDAS CITARUM CILIWUNG'],
//           'Banten': 'BPDAS CITARUM CILIWUNG',
//           'DKI Jakarta': 'BPDAS CITARUM CILIWUNG',
//           'Daerah Istimewa Yogyakarta': 'BPDAS SERAYU OPAK PROGO',
//           'Kalimantan Tengah': ['BPDAS KAHAYAN', 'BPDAS BARITO'],
//           'Kalimantan Selatan': ['BPDAS KAHAYAN', 'BPDAS BARITO'],
//           'Kalimantan Barat': ['BPDAS KAHAYAN', 'BPDAS KAPUAS'],
//           'Kalimantan Timur': 'BPDAS MAHAKAM BERAU',
//           'Kalimantan Utara': 'BPDAS MAHAKAM BERAU',
//     }
//   }
// };

// // Function to process Excel data
// // const processExcelData = (filePath) => {
// //   try {
// //     const workbook = XLSX.readFile(filePath);
// //     const sheetName = workbook.SheetNames[0];
// //     const worksheet = workbook.Sheets[sheetName];

// //     // Read specific cells based on your mapping
// //     const cellMapping = {
// //       'A3': 'curah_hujan',           // A3
// //       'B3': 'korban_meninggal',      // B3
// //       'C3': 'korban_luka_luka',      // C3
// //       'D3': 'korban_mengungsi',      // D3
// //       'E3': 'rumah_rusak_berat',     // E3
// //       'F3': 'rumah_rusak_sedang',    // F3
// //       'G3': 'rumah_rusak_ringan',    // G3
// //       'H3': 'rumah_rusak_terendam',  // H3
// //       'I3': 'infrastruktur_rusak_berat',   // I3
// //       'J3': 'infrastruktur_rusak_sedang',  // J3
// //       'K3': 'infrastruktur_rusak_ringan',  // K3
// //       'L3': 'dampak_kebakaran',      // L3
// //       'M3': 'luas_lokasi_kejadian',  // M3
// //       'N3': 'kejadian_ke'            // N3
// //     };

// //     const processedData = {};

// //     // Process each cell mapping
// //     Object.keys(cellMapping).forEach(cellAddress => {
// //       const dbColumn = cellMapping[cellAddress];
// //       const cell = worksheet[cellAddress];

// //       let value = null;
// //       if (cell && cell.v !== undefined) {
// //         value = cell.v;
// //       }

// //       // Handle different data types based on database column
// //       if (value !== null && value !== undefined && value !== '') {
// //         if (dbColumn === 'dampak_kebakaran') {
// //           // For text field
// //           processedData[dbColumn] = String(value);
// //         } else if (dbColumn === 'curah_hujan' || dbColumn === 'luas_lokasi_kejadian') {
// //           // For decimal fields
// //           const numValue = parseFloat(value);
// //           processedData[dbColumn] = isNaN(numValue) ? null : numValue;
// //         } else {
// //           // For integer fields
// //           const intValue = parseInt(value);
// //           processedData[dbColumn] = isNaN(intValue) ? 0 : intValue;
// //         }
// //       } else {
// //         // Set default values for missing/empty data
// //         if (dbColumn === 'dampak_kebakaran') {
// //           processedData[dbColumn] = null;
// //         } else if (dbColumn === 'curah_hujan' || dbColumn === 'luas_lokasi_kejadian') {
// //           processedData[dbColumn] = null;
// //         } else {
// //           processedData[dbColumn] = 0;
// //         }
// //       }
// //     });

// //     // Validate that we got some data
// //     const hasData = Object.values(processedData).some(value =>
// //       value !== null && value !== 0 && value !== ''
// //     );

// //     if (!hasData) {
// //       console.warn('No valid data found in Excel file. All values are null/0/empty.');
// //     }

// //     return processedData;

// //   } catch (error) {
// //     console.error('Error processing Excel file:', error);
// //     throw new Error(`Failed to process Excel file: ${error.message}`);
// //   }
// // };

// // Helper functions untuk parsing geometry dan create features
// const parseGeometry = (geometryJson, rowIndex, tableName) => {
//   if (!geometryJson) {
//     console.warn(`Row ${rowIndex} in ${tableName}: No geometry_json found`);
//     return null;
//   }

//   try {
//     return JSON.parse(geometryJson);
//   } catch (e) {
//     console.error(`Error parsing geometry for row ${rowIndex} in ${tableName}:`, e.message);
//     return null;
//   }
// };

// const createFeatures = (rows, tableName) => {
//   const features = [];
//   let validCount = 0;
//   let errorCount = 0;

//   if (!rows || rows.length === 0) {
//     return features;
//   }

//   rows.forEach((row, index) => {
//     try {
//       const geometry = parseGeometry(row.geometry_json, index, tableName);

//       if (geometry) {
//         validCount++;
//         const { geometry_json, geom, ...properties } = row;

//         features.push({
//           type: 'Feature',
//           id: index,
//           properties: properties,
//           geometry: geometry
//         });
//       } else {
//         errorCount++;
//       }
//     } catch (featureError) {
//       console.error(`Error processing feature ${index} in ${tableName}:`, featureError);
//       errorCount++;
//     }
//   });

//   return features;
// };

// // PERBAIKAN 5: Perbaiki fungsi buildWhereClause jika ada masalah
// const buildWhereClause = (columnName, values, params) => {
//   try {
//     if (Array.isArray(values)) {
//       // Multiple values: WHERE column = ANY($1)
//       const paramIndex = params.length + 1;
//       params.push(values);
//       return ` WHERE ${columnName} = ANY($${paramIndex})`;
//     } else {
//       // Single value: WHERE column = $1
//       const paramIndex = params.length + 1;
//       params.push(values);
//       return ` WHERE ${columnName} = $${paramIndex}`;
//     }
//   } catch (error) {
//     console.error('Error in buildWhereClause:', error);
//     throw error;
//   }
// };

// app.get('/api/available-years/location', async (req, res) => {
//   try {
//     const result = {};

//     // âœ… FIX: Gunakan nama tabel yang benar
//     const tableConfigs = {
//       provinsi: 'provinsi',
//       kabupaten: 'kab_kota',      // âœ… UBAH dari 'kabupaten' ke 'kab_kota'
//       kecamatan: 'kecamatan',
//       kelurahan: 'kel_desa',       // âœ… UBAH dari 'kelurahan' ke 'kel_desa'
//       das: 'das'
//     };

//     for (const [key, tableName] of Object.entries(tableConfigs)) {
//       try {
//         const query = await client.query(
//           `SELECT DISTINCT tahun_data FROM ${tableName} WHERE tahun_data IS NOT NULL ORDER BY tahun_data DESC`
//         );
//         result[key] = query.rows.map(r => r.tahun_data);
//         console.log(`âœ… Found ${result[key].length} years in ${tableName}:`, result[key]);
//       } catch (err) {
//         console.log(`âš ï¸ Table ${tableName} might not exist or has no tahun_data:`, err.message);
//         result[key] = [];
//       }
//     }

//     console.log('ðŸ“… Available years result:', result);
//     res.json(result);
//   } catch (error) {
//     console.error('âŒ Error in /api/available-years/location:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// app.get('/api/available-years/disaster/:tableName', async (req, res) => {
//   const { tableName } = req.params;

//   try {
//     // Validate table name untuk security
//     const validPattern = /^[a-z_0-9]+$/;
//     if (!validPattern.test(tableName)) {
//       return res.status(400).json({ error: 'Invalid table name format' });
//     }

//     console.log(`ðŸ” Fetching years for disaster table: ${tableName}`);

//     const query = `SELECT DISTINCT tahun_data FROM ${tableName} WHERE tahun_data IS NOT NULL ORDER BY tahun_data DESC`;
//     const result = await client.query(query);

//     const years = result.rows.map(r => r.tahun_data);
//     console.log(`âœ… Found ${years.length} years in ${tableName}:`, years);

//     res.json(years);
//   } catch (error) {
//     console.error(`âŒ Error fetching years for ${tableName}:`, error.message);

//     // Check if table exists
//     try {
//       const checkTable = await client.query(
//         `SELECT EXISTS (
//           SELECT FROM information_schema.tables
//           WHERE table_name = $1
//         )`,
//         [tableName]
//       );

//       if (!checkTable.rows[0].exists) {
//         return res.status(404).json({
//           error: `Table '${tableName}' does not exist`,
//           message: 'Tabel tidak ditemukan di database'
//         });
//       }

//       // Check if tahun_data column exists
//       const checkColumn = await client.query(
//         `SELECT EXISTS (
//           SELECT FROM information_schema.columns
//           WHERE table_name = $1 AND column_name = 'tahun_data'
//         )`,
//         [tableName]
//       );

//       if (!checkColumn.rows[0].exists) {
//         return res.status(400).json({
//           error: `Column 'tahun_data' does not exist in table '${tableName}'`,
//           message: 'Kolom tahun_data tidak ditemukan di tabel'
//         });
//       }
//     } catch (checkError) {
//       console.error('Error checking table/column:', checkError);
//     }

//     res.status(500).json({
//       error: error.message,
//       table: tableName
//     });
//   }
//       });

// // ================= ENDPOINT BARU #3 ================
// app.get('/api/locations/:level', async (req, res) => {
//   const { level } = req.params;
//   const { year, filter_column, filter_value } = req.query;

//   try {
//     const tableConfig = {
//       'provinsi': { table: 'provinsi', column: 'provinsi' },
//       'kabupaten': { table: 'kab_kota', column: 'kab_kota' },
//       'kecamatan': { table: 'kecamatan', column: 'kecamatan' },
//       'kelurahan': { table: 'kel_desa', column: 'kel_desa' },
//       'das': { table: 'das', column: 'nama_das' }
//     };

//     const config = tableConfig[level];
//     if (!config) {
//       return res.status(400).json({ error: 'Invalid level' });
//     }

//     console.log(`ðŸ” Fetching ${level} for year ${year}`);

//     // PERBAIKAN: Tambahkan filter untuk exclude NULL values
//     let query = `SELECT DISTINCT ${config.column} as name, tahun_data FROM ${config.table}`;
//     const params = [];
//     const conditions = [];

//     // PERBAIKAN: Tambahkan kondisi untuk exclude NULL
//     conditions.push(`${config.column} IS NOT NULL`);
//     conditions.push(`${config.column} != ''`);

//     if (year) {
//       params.push(year);
//       conditions.push(`tahun_data = $${params.length}`);
//     }

//     // Gunakan reference_mapping untuk filter
//     if (filter_column && filter_value) {
//       const mappingQuery = `
//         SELECT target_value
//         FROM reference_mapping
//         WHERE source_table = $1
//           AND source_column = $2
//           AND UPPER(source_value) = UPPER($3)
//       `;
//       const mappingResult = await client.query(mappingQuery, [config.table, filter_column, filter_value]);

//       if (mappingResult.rows.length > 0) {
//         const targetValue = mappingResult.rows[0].target_value;
//         params.push(targetValue);
//         conditions.push(`UPPER(${filter_column}) = UPPER($${params.length})`);
//       } else {
//         params.push(filter_value);
//         conditions.push(`UPPER(${filter_column}) = UPPER($${params.length})`);
//       }
//     }

//     if (conditions.length > 0) {
//       query += ` WHERE ${conditions.join(' AND ')}`;
//     }

//     query += ` ORDER BY ${config.column}`;

//     const result = await client.query(query, params);
//     console.log(`âœ… Found ${result.rows.length} ${level}(s)`);

//     res.json(result.rows);
//   } catch (error) {
//     console.error(`âŒ Error fetching ${level}:`, error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // ================= ENDPOINT BARU #4 ================
// app.get('/api/locations/:level/max-year', async (req, res) => {
//   const { level } = req.params;
//   const { maxYear, filter_column, filter_value } = req.query;

//   if (!maxYear) {
//     return res.status(400).json({ error: 'maxYear parameter required' });
//   }

//   try {
//     const tableConfig = {
//       'provinsi': { table: 'provinsi', column: 'provinsi' },
//       'kabupaten': { table: 'kab_kota', column: 'kab_kota' },
//       'kecamatan': { table: 'kecamatan', column: 'kecamatan' },
//       'kelurahan': { table: 'kel_desa', column: 'kel_desa' },
//       'das': { table: 'das', column: 'nama_das' }
//     };

//     const config = tableConfig[level];
//     if (!config) {
//       return res.status(400).json({ error: 'Invalid level' });
//     }

//     console.log(`ðŸ” Fetching ${level} with max year ${maxYear}`);

//     // PERBAIKAN: Gunakan subquery untuk mendapatkan max year per lokasi
//     let query = `
//       WITH max_years AS (
//         SELECT
//           ${config.column},
//           MAX(tahun_data) as max_year
//         FROM ${config.table}
//         WHERE tahun_data <= $1
//         GROUP BY ${config.column}
//       )
//       SELECT DISTINCT
//         t.${config.column} as name,
//         t.tahun_data
//       FROM ${config.table} t
//       INNER JOIN max_years m
//         ON t.${config.column} = m.${config.column}
//         AND t.tahun_data = m.max_year
//     `;

//     const params = [maxYear];

//     // Gunakan reference_mapping untuk filter
//     if (filter_column && filter_value) {
//       const mappingQuery = `
//         SELECT target_value
//         FROM reference_mapping
//         WHERE source_table = $1
//           AND source_column = $2
//           AND UPPER(source_value) = UPPER($3)
//       `;
//       const mappingResult = await client.query(mappingQuery, [config.table, filter_column, filter_value]);

//       if (mappingResult.rows.length > 0) {
//         const targetValue = mappingResult.rows[0].target_value;
//         params.push(targetValue);
//         query += ` WHERE UPPER(t.${filter_column}) = UPPER($${params.length})`;
//       } else {
//         params.push(filter_value);
//         query += ` WHERE UPPER(t.${filter_column}) = UPPER($${params.length})`;
//       }
//     }

//     query += ` ORDER BY name`;

//     console.log('ðŸ“ Executing query:', query);
//     console.log('ðŸ“ With params:', params);

//     const result = await client.query(query, params);
//     console.log(`âœ… Found ${result.rows.length} ${level}(s) with max year ${maxYear}`);

//     res.json(result.rows);
//   } catch (error) {
//     console.error(`âŒ Error fetching ${level} with max year:`, error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // ================= ENDPOINT BARU #5 ================
// app.get('/api/locations/cascade/:level', async (req, res) => {
//   const { level } = req.params;
//   const { year, provinsi, kabupaten, kecamatan } = req.query;

//   if (!year) {
//     return res.status(400).json({ error: 'year parameter required' });
//   }

//   try {
//     let query, params;

//     if (level === 'kabupaten' && provinsi) {
//       console.log(`ðŸ” Fetching kabupaten for provinsi: ${provinsi}, year: ${year}`);

//       // Cari mapping dari provinsi ke kabupaten
//       const mappingQuery = `
//         SELECT DISTINCT target_value
//         FROM reference_mapping
//         WHERE source_table = 'provinsi'
//           AND source_column = 'provinsi'
//           AND target_table = 'kab_kota'
//           AND target_column = 'provinsi'
//           AND UPPER(source_value) = UPPER($1)
//       `;
//       const mappingResult = await client.query(mappingQuery, [provinsi]);

//       let provinsiFilter = mappingResult.rows.length > 0 ? mappingResult.rows[0].target_value : provinsi;

//       query = `
//         SELECT DISTINCT ON (kab_kota)
//           kab_kota as name,
//           tahun_data
//         FROM kab_kota
//         WHERE tahun_data <= $1
//           AND UPPER(provinsi) = UPPER($2)
//         ORDER BY kab_kota, tahun_data DESC
//       `;
//       params = [year, provinsiFilter];

//     } else if (level === 'kecamatan' && kabupaten) {
//       console.log(`ðŸ” Fetching kecamatan for kabupaten: ${kabupaten}, year: ${year}`);

//       const mappingQuery = `
//         SELECT DISTINCT target_value
//         FROM reference_mapping
//         WHERE source_table = 'kab_kota'
//           AND source_column = 'kab_kota'
//           AND target_table = 'kecamatan'
//           AND target_column = 'kab_kota'
//           AND UPPER(source_value) = UPPER($1)
//       `;
//       const mappingResult = await client.query(mappingQuery, [kabupaten]);

//       let kabupatenFilter = mappingResult.rows.length > 0 ? mappingResult.rows[0].target_value : kabupaten;

//       query = `
//         SELECT DISTINCT ON (kecamatan)
//           kecamatan as name,
//           tahun_data
//         FROM kecamatan
//         WHERE tahun_data <= $1
//           AND UPPER(kab_kota) = UPPER($2)
//         ORDER BY kecamatan, tahun_data DESC
//       `;
//       params = [year, kabupatenFilter];

//     } else if (level === 'kelurahan' && kecamatan) {
//       console.log(`ðŸ” Fetching kelurahan for kecamatan: ${kecamatan}, year: ${year}`);

//       const mappingQuery = `
//         SELECT DISTINCT target_value
//         FROM reference_mapping
//         WHERE source_table = 'kecamatan'
//           AND source_column = 'kecamatan'
//           AND target_table = 'kel_desa'
//           AND target_column = 'kecamatan'
//           AND UPPER(source_value) = UPPER($1)
//       `;
//       const mappingResult = await client.query(mappingQuery, [kecamatan]);

//       let kecamatanFilter = mappingResult.rows.length > 0 ? mappingResult.rows[0].target_value : kecamatan;

//       query = `
//         SELECT DISTINCT ON (kel_desa)
//           kel_desa as name,
//           tahun_data
//         FROM kel_desa
//         WHERE tahun_data <= $1
//           AND UPPER(kecamatan) = UPPER($2)
//         ORDER BY kel_desa, tahun_data DESC
//       `;
//       params = [year, kecamatanFilter];

//     } else {
//       return res.status(400).json({ error: 'Invalid cascade parameters' });
//     }

//     const result = await client.query(query, params);
//     console.log(`âœ… Cascading ${level} for year ${year}:`, result.rows.length);

//     res.json(result.rows);

//   } catch (error) {
//     console.error(`âŒ Error in cascading ${level}:`, error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // NEW ENDPOINTS: Get kabupaten, kecamatan, kelurahan data
// app.get('/api/filter/kabupaten', async (req, res) => {
//   try {
//     const result = await client.query('SELECT DISTINCT kab_kota FROM kab_kota ORDER BY kab_kota');
//     res.json(result.rows);
//   } catch (error) {
//     console.error('Error fetching kabupaten:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// app.get('/api/filter/kecamatan', async (req, res) => {
//   try {
//     const result = await client.query('SELECT DISTINCT kecamatan FROM kecamatan ORDER BY kecamatan');
//     res.json(result.rows);
//   } catch (error) {
//     console.error('Error fetching kecamatan:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// app.get('/api/filter/kelurahan', async (req, res) => {
//   try {
//     const result = await client.query('SELECT DISTINCT kel_desa FROM kel_desa ORDER BY kel_desa');
//     res.json(result.rows);
//   } catch (error) {
//     console.error('Error fetching kelurahan:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// // Existing endpoints
// app.get('/api/filter/provinces', async (req, res) => {
//   try {
//     const result = await client.query('SELECT DISTINCT provinsi FROM provinsi ORDER BY provinsi');
//     res.json(result.rows);
//   } catch (error) {
//     console.error('Error fetching provinces:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// app.get('/api/filter/das', async (req, res) => {
//   try {
//     const result = await client.query('SELECT DISTINCT nama_das FROM das ORDER BY nama_das');
//     res.json(result.rows);
//   } catch (error) {
//     console.error('Error fetching DAS:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// app.get('/api/incident-counts', async (req, res) => {
//   try {
//     const { disaster_type, level, year, location_name } = req.query;

//     if (!disaster_type || !level || !year) {
//       return res.status(400).json({
//         error: 'Missing required parameters: disaster_type, level, year'
//       });
//     }

//     console.log(`ðŸŽ¨ Fetching incident counts for coloring: ${disaster_type}, ${level}, year ${year}`);

//     let kejadianQuery;
//     let params = [];

//     // Build query based on level
//     if (level === 'Indonesia' || level === 'Provinsi') {
//       // For Indonesia and Provinsi level, count by provinsi
//       kejadianQuery = `
//         SELECT UPPER(TRIM(provinsi)) as location_key, COUNT(*) as incident_count
//         FROM kejadian
//         WHERE disaster_type = $1
//           AND EXTRACT(YEAR FROM incident_date) = $2
//           AND provinsi IS NOT NULL
//           AND TRIM(provinsi) != ''
//         GROUP BY UPPER(TRIM(provinsi))
//       `;
//       params = [disaster_type, year];

//     } else if (level === 'DAS') {
//       // For DAS level, count by das name
//       kejadianQuery = `
//         SELECT TRIM(das) as location_key, COUNT(*) as incident_count
//         FROM kejadian
//         WHERE disaster_type = $1
//           AND EXTRACT(YEAR FROM incident_date) = $2
//           AND das IS NOT NULL
//           AND TRIM(das) != ''
//         GROUP BY TRIM(das)
//       `;
//       params = [disaster_type, year];

//     } else {
//       return res.status(400).json({ error: 'Invalid level parameter' });
//     }

//     const result = await client.query(kejadianQuery, params);

//     // Create a map for easy lookup
//     const incidentMap = {};
//     result.rows.forEach(row => {
//       incidentMap[row.location_key] = parseInt(row.incident_count);
//     });

//     console.log(`âœ… Found incident counts for ${result.rows.length} locations`);
//     console.log('ðŸ“Š Sample data:', result.rows.slice(0, 3));

//     res.json({ incidentMap, totalLocations: result.rows.length });

//   } catch (error) {
//     console.error('âŒ Error fetching incident counts:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // // UPDATED ENDPOINT: Submit kejadian report with Excel processing (no report_type)
// // app.post('/api/kejadian', kejadianUpload.fields([
// //   { name: 'thumbnail', maxCount: 1 },
// //   { name: 'images', maxCount: 10 },
// //   { name: 'dataFiles', maxCount: 5 }
// // ]), async (req, res) => {
// //   try {

// //     const {
// //       disasterType,
// //       provinsi,
// //       kabupaten,
// //       kecamatan,
// //       kelurahan,
// //       das,
// //       title,
// //       description,
// //       incidentDate,
// //       longitude,
// //       latitude
// //     } = req.body;

// //     // Updated validation for new required fields
// //     const requiredFields = ['disasterType', 'provinsi', 'kabupaten', 'kecamatan', 'kelurahan', 'title', 'longitude', 'latitude', 'description', 'incidentDate'];
// //     const missingFields = requiredFields.filter(field => !req.body[field]);

// //     if (missingFields.length > 0) {
// //       return res.status(400).json({
// //         error: 'Missing required fields',
// //         missing: missingFields,
// //         // required: requiredFields
// //       });
// //     }

// //     // Validate coordinates
// //     const lng = parseFloat(longitude);
// //     const lat = parseFloat(latitude);

// //     if (isNaN(lng) || isNaN(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
// //       return res.status(400).json({
// //         error: 'Invalid coordinates',
// //         // details: `Longitude: ${longitude}, Latitude: ${latitude}`
// //       });
// //     }

// //     const lngRounded = Math.round(lng * 1000000) / 1000000;
// //     const latRounded = Math.round(lat * 1000000) / 1000000;

// //     // Process uploaded files
// //     let thumbnailPath = null;
// //     let imagesPaths = [];
// //     let excelData = {};

// //     if (req.files) {
// //       if (req.files.thumbnail && req.files.thumbnail[0]) {
// //         thumbnailPath = req.files.thumbnail[0].filename;
// //       }

// //       if (req.files.images) {
// //         imagesPaths = req.files.images.map(file => file.filename);
// //       }

// //       // Process Excel files
// //       if (req.files.dataFiles && req.files.dataFiles.length > 0) {
// //         try {
// //           // Process the first Excel file (you can modify this to process multiple files)
// //           const excelFile = req.files.dataFiles[0];
// //           const excelFilePath = path.join(uploadDir, excelFile.filename);
// //           excelData = processExcelData(excelFilePath);

// //           // Clean up Excel file after processing (optional)
// //           // fs.unlinkSync(excelFilePath);
// //         } catch (excelError) {
// //           console.error('Excel processing error:', excelError);
// //           // Continue without Excel data - it's optional
// //           excelData = {};
// //         }
// //       }
// //     }

// //     // Insert into database with new schema (no report_type)
// //     const insertQuery = `
// //       INSERT INTO kejadian (
// //         thumbnail_path, images_paths, disaster_type,
// //         provinsi, kabupaten, kecamatan, kelurahan, das, title, description, incident_date,
// //         longitude, latitude, geom,
// //         curah_hujan, korban_meninggal, korban_luka_luka, korban_mengungsi,
// //         rumah_rusak_berat, rumah_rusak_sedang, rumah_rusak_ringan, rumah_rusak_terendam,
// //         infrastruktur_rusak_berat, infrastruktur_rusak_sedang, infrastruktur_rusak_ringan,
// //         dampak_kebakaran, luas_lokasi_kejadian, kejadian_ke
// //       ) VALUES (
// //         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
// //         ST_SetSRID(ST_MakePoint($12, $13), 4326),
// //         $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
// //       ) RETURNING id, created_at
// //     `;

// //     const values = [
// //       thumbnailPath,
// //       imagesPaths,
// //       disasterType,
// //       provinsi,
// //       kabupaten,
// //       kecamatan,
// //       kelurahan,
// //       das || null,
// //       title,
// //       description,
// //       incidentDate,
// //       lngRounded,
// //       latRounded,
// //       // Excel data fields
// //       excelData.curah_hujan || null,
// //       excelData.korban_meninggal || 0,
// //       excelData.korban_luka_luka || 0,
// //       excelData.korban_mengungsi || 0,
// //       excelData.rumah_rusak_berat || 0,
// //       excelData.rumah_rusak_sedang || 0,
// //       excelData.rumah_rusak_ringan || 0,
// //       excelData.rumah_rusak_terendam || 0,
// //       excelData.infrastruktur_rusak_berat || 0,
// //       excelData.infrastruktur_rusak_sedang || 0,
// //       excelData.infrastruktur_rusak_ringan || 0,
// //       excelData.dampak_kebakaran || null,
// //       excelData.luas_lokasi_kejadian || null,
// //       excelData.kejadian_ke || null
// //     ];

// //     const result = await client.query(insertQuery, values);
// //     invalidateRiskCache({
// //       disaster_type: disasterType,
// //       provinsi, kabupaten, kecamatan, kelurahan, das
// //     });

// //     res.status(201).json({
// //       success: true,
// //       message: 'Laporan kejadian berhasil disimpan',
// //       data: {
// //         id: result.rows[0].id,
// //         created_at: result.rows[0].created_at,
// //         coordinates: {
// //           longitude: lngRounded,
// //           latitude: latRounded
// //         },
// //         thumbnail_url: thumbnailPath ? `/uploads/${thumbnailPath}` : null,
// //         images_urls: imagesPaths.map(path => `/uploads/${path}`),
// //         excel_data_processed: Object.keys(excelData).length > 0
// //       }
// //     });

// //   } catch (error) {
// //     console.error('Error saving kejadian:', error);

// //     // Clean up uploaded files if database insert fails
// //     if (req.files) {
// //       const allFiles = [
// //         ...(req.files.thumbnail || []),
// //         ...(req.files.images || []),
// //         ...(req.files.dataFiles || [])
// //       ];

// //       allFiles.forEach(file => {
// //         const filePath = path.join(uploadDir, file.filename);
// //         if (fs.existsSync(filePath)) {
// //           fs.unlinkSync(filePath);
// //         }
// //       });
// //     }

// //     res.status(500).json({
// //       error: 'Internal Server Error',
// //       message: error.message
// //     });
// //   }
// // });

// app.post('/api/kejadian', kejadianUpload.fields([
//   { name: 'thumbnail', maxCount: 1 },
//   { name: 'images', maxCount: 10 },
//   { name: 'dataFiles', maxCount: 10 }  // Semua Excel files di sini
// ]), async (req, res) => {
//   let dbClient;

//   try {
//     dbClient = await pool.connect();
//     await dbClient.query('BEGIN');

//     const {
//       disasterType,
//       provinsi,
//       kabupaten,
//       kecamatan,
//       kelurahan,
//       das,
//       title,
//       description,
//       incidentDate,
//       longitude,
//       latitude
//     } = req.body;

//     // Validation
//     const requiredFields = ['disasterType', 'provinsi', 'kabupaten', 'kecamatan', 'kelurahan', 'title', 'longitude', 'latitude', 'description', 'incidentDate'];
//     const missingFields = requiredFields.filter(field => !req.body[field]);

//     if (missingFields.length > 0) {
//       throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
//     }

//     const lng = parseFloat(longitude);
//     const lat = parseFloat(latitude);

//     if (isNaN(lng) || isNaN(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
//       throw new Error('Invalid coordinates');
//     }

//     const lngRounded = Math.round(lng * 1000000) / 1000000;
//     const latRounded = Math.round(lat * 1000000) / 1000000;

//     // Process uploaded files
//     let thumbnailPath = null;
//     let imagesPaths = [];
//     let excelData = {};
//     let dataKorban = null;

//     if (req.files) {
//       if (req.files.thumbnail && req.files.thumbnail[0]) {
//         thumbnailPath = req.files.thumbnail[0].filename;
//       }

//       if (req.files.images) {
//         imagesPaths = req.files.images.map(file => file.filename);
//       }

//       // Process Excel files
//       if (req.files.dataFiles && req.files.dataFiles.length > 0) {
//         try {
//           for (const excelFile of req.files.dataFiles) {
//             const excelFilePath = path.join(uploadDir, excelFile.filename);
//             const processedData = processExcelFile(excelFilePath, disasterType);

//             // Merge data
//             if (processedData.data_korban) {
//               dataKorban = processedData.data_korban;
//             }

//             Object.assign(excelData, processedData);

//             // Clean up Excel file after processing
//             fs.unlinkSync(excelFilePath);
//           }
//         } catch (excelError) {
//           console.error('Excel processing error:', excelError);
//           throw new Error('Failed to process Excel files: ' + excelError.message);
//         }
//       }
//     }

//     // Insert kejadian dengan data korban
//     const insertKejadianQuery = `
//       INSERT INTO kejadian (
//         thumbnail_path, images_paths, disaster_type,
//         provinsi, kabupaten, kecamatan, kelurahan, das,
//         title, description, incident_date,
//         longitude, latitude, geom,
//         korban_meninggal, korban_luka_luka, korban_mengungsi,
//         rumah_rusak_berat, rumah_rusak_sedang, rumah_rusak_ringan, rumah_rusak_terendam,
//         infrastruktur_rusak_berat, infrastruktur_rusak_sedang, infrastruktur_rusak_ringan,
//         dampak_kebakaran, luas_lokasi_kejadian, kejadian_ke
//       ) VALUES (
//         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
//         ST_SetSRID(ST_MakePoint($12, $13), 4326),
//         $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
//       ) RETURNING id, created_at
//     `;

//     const kejadianValues = [
//       thumbnailPath,
//       imagesPaths,
//       disasterType,
//       provinsi,
//       kabupaten,
//       kecamatan,
//       kelurahan,
//       das || null,
//       title,
//       description,
//       incidentDate,
//       lngRounded,
//       latRounded,
//       // Data Korban
//       dataKorban?.korban_meninggal || 0,
//       dataKorban?.korban_luka_luka || 0,
//       dataKorban?.korban_mengungsi || 0,
//       dataKorban?.rumah_rusak_berat || 0,
//       dataKorban?.rumah_rusak_sedang || 0,
//       dataKorban?.rumah_rusak_ringan || 0,
//       dataKorban?.rumah_rusak_terendam || 0,
//       dataKorban?.infrastruktur_rusak_berat || 0,
//       dataKorban?.infrastruktur_rusak_sedang || 0,
//       dataKorban?.infrastruktur_rusak_ringan || 0,
//       dataKorban?.dampak_kebakaran || null,
//       dataKorban?.luas_lokasi_kejadian || null,
//       dataKorban?.kejadian_ke || null
//     ];

//     const kejadianResult = await dbClient.query(insertKejadianQuery, kejadianValues);
//     const kejadianId = kejadianResult.rows[0].id;

//     // Insert data detail berdasarkan disaster type
//     if (disasterType === 'Banjir') {
//       if (excelData.curah_hujan && excelData.curah_hujan.length > 0) {
//         await insertCurahHujan(dbClient, kejadianId, excelData.curah_hujan);
//       }
//       if (excelData.status_das && excelData.status_das.length > 0) {
//         await insertStatusDasBanjir(dbClient, kejadianId, excelData.status_das);
//       }
//       if (excelData.tutupan_das && excelData.tutupan_das.length > 0) {
//         await insertTutupanDas(dbClient, kejadianId, excelData.tutupan_das);
//       }
//       if (excelData.kemiringan_lahan) {
//         await insertKemiringanLahan(dbClient, kejadianId, excelData.kemiringan_lahan);
//       }
//       if (excelData.kepadatan_pemukiman && excelData.kepadatan_pemukiman.length > 0) {
//         await insertKepadatanPemukiman(dbClient, kejadianId, excelData.kepadatan_pemukiman);
//       }
//     }
//     else if (disasterType === 'Kebakaran') {
//       if (excelData.status_das && excelData.status_das.length > 0) {
//         await insertStatusDasKebakaran(dbClient, kejadianId, excelData.status_das);
//       }
//       if (excelData.tutupan_das && excelData.tutupan_das.length > 0) {
//         await insertTutupanDas(dbClient, kejadianId, excelData.tutupan_das);
//       }
//       if (excelData.kemiringan_lahan) {
//         await insertKemiringanLahan(dbClient, kejadianId, excelData.kemiringan_lahan);
//       }
//       if (excelData.kepadatan_pemukiman && excelData.kepadatan_pemukiman.length > 0) {
//         await insertKepadatanPemukiman(dbClient, kejadianId, excelData.kepadatan_pemukiman);
//       }
//     }
//     else if (disasterType === 'Longsor') {
//       if (excelData.curah_hujan && excelData.curah_hujan.length > 0) {
//         await insertCurahHujan(dbClient, kejadianId, excelData.curah_hujan);
//       }
//       if (excelData.kemiringan_lereng && excelData.kemiringan_lereng.length > 0) {
//         await insertKemiringanLereng(dbClient, kejadianId, excelData.kemiringan_lereng);
//       }
//       if (excelData.topografi && excelData.topografi.length > 0) {
//         await insertTopografi(dbClient, kejadianId, excelData.topografi);
//       }
//       if (excelData.geologi && excelData.geologi.length > 0) {
//         await insertGeologi(dbClient, kejadianId, excelData.geologi);
//       }
//       if (excelData.jenis_tanah && excelData.jenis_tanah.length > 0) {
//         await insertJenisTanah(dbClient, kejadianId, excelData.jenis_tanah);
//       }
//       if (excelData.patahan && excelData.patahan.length > 0) {
//         await insertPatahan(dbClient, kejadianId, excelData.patahan);
//       }
//       if (excelData.tutupan_lahan && excelData.tutupan_lahan.length > 0) {
//         await insertTutupanLahan(dbClient, kejadianId, excelData.tutupan_lahan);
//       }
//       if (excelData.infrastruktur && excelData.infrastruktur.length > 0) {
//         await insertInfrastruktur(dbClient, kejadianId, excelData.infrastruktur);
//       }
//       if (excelData.kepadatan_pemukiman && excelData.kepadatan_pemukiman.length > 0) {
//         await insertKepadatanPemukiman(dbClient, kejadianId, excelData.kepadatan_pemukiman);
//       }
//     }

//     await dbClient.query('COMMIT');

//     invalidateRiskCache({
//       disaster_type: disasterType,
//       provinsi, kabupaten, kecamatan, kelurahan, das
//     });

//     res.status(201).json({
//       success: true,
//       message: 'Laporan kejadian dan data detail berhasil disimpan',
//       data: {
//         id: kejadianId,
//         created_at: kejadianResult.rows[0].created_at,
//         coordinates: {
//           longitude: lngRounded,
//           latitude: latRounded
//         },
//         thumbnail_url: thumbnailPath ? `/uploads/${thumbnailPath}` : null,
//         images_urls: imagesPaths.map(p => `/uploads/${p}`),
//         excel_data_processed: Object.keys(excelData).length > 0,
//         data_korban_processed: dataKorban !== null
//       }
//     });

//   } catch (error) {
//     if (dbClient) await dbClient.query('ROLLBACK');
//     console.error('Error saving kejadian:', error);

//     // Clean up uploaded files if database insert fails
//     if (req.files) {
//       const allFiles = [
//         ...(req.files.thumbnail || []),
//         ...(req.files.images || []),
//         ...(req.files.dataFiles || [])
//       ];

//       allFiles.forEach(file => {
//         const filePath = path.join(uploadDir, file.filename);
//         if (fs.existsSync(filePath)) {
//           try {
//             fs.unlinkSync(filePath);
//           } catch (e) {
//             console.error('Error deleting file:', e);
//           }
//         }
//       });
//     }

//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message
//     });
//   } finally {
//     if (dbClient) dbClient.release();
//   }
// });

//   app.get('/api/kerawanan/chart-data', async (req, res) => {
//     try {
//       const { disaster_type, provinsi, kabupaten, kecamatan, kelurahan, das } = req.query;

//       if (!disaster_type) {
//         return res.status(400).json({ error: 'disaster_type is required' });
//       }

//       // Build WHERE clause based on filters
//       const conditions = ['LOWER(disaster_type) = LOWER($1)'];
//       const params = [disaster_type];
//       let paramIndex = 2;

//       if (provinsi) {
//         conditions.push(`LOWER(provinsi) = LOWER($${paramIndex})`);
//         params.push(provinsi);
//         paramIndex++;
//       }
//       if (kabupaten) {
//         conditions.push(`LOWER(kabupaten) = LOWER($${paramIndex})`);
//         params.push(kabupaten);
//         paramIndex++;
//       }
//       if (kecamatan) {
//         conditions.push(`LOWER(kecamatan) = LOWER($${paramIndex})`);
//         params.push(kecamatan);
//         paramIndex++;
//       }
//       if (kelurahan) {
//         conditions.push(`LOWER(kelurahan) = LOWER($${paramIndex})`);
//         params.push(kelurahan);
//         paramIndex++;
//       }
//       if (das) {
//         conditions.push(`LOWER(das) = LOWER($${paramIndex})`);
//         params.push(das);
//         paramIndex++;
//       }

//       const whereClause = conditions.join(' AND ');

//       // Get all kejadian IDs that match the filters
//       const kejadianQuery = `SELECT id FROM kejadian WHERE ${whereClause}`;
//       const kejadianResult = await client.query(kejadianQuery, params);
//       const kejadianIds = kejadianResult.rows.map(row => row.id);

//       if (kejadianIds.length === 0) {
//         return res.json({
//           success: true,
//           disaster_type,
//           data: {},
//           kejadian_count: 0
//         });
//       }

//       // Aggregate data based on disaster type
//       let aggregatedData = {};

//       if (disaster_type === 'Banjir') {
//         aggregatedData = await aggregateBanjirData(kejadianIds);
//       } else if (disaster_type === 'Kebakaran') {
//         aggregatedData = await aggregateKebakaranData(kejadianIds);
//       } else if (disaster_type === 'Longsor') {
//         aggregatedData = await aggregateLongsorData(kejadianIds);
//       }

//       res.json({
//         success: true,
//         disaster_type,
//         data: aggregatedData,
//         kejadian_count: kejadianIds.length
//       });

//     } catch (error) {
//       console.error('Error fetching kerawanan chart data:', error);
//       res.status(500).json({
//         error: 'Internal Server Error',
//         message: error.message
//       });
//     }
//   });

//   app.get('/api/kejadian/year-stats', async (req, res) => {
//   try {
//     const { disaster_type, provinsi, das, start_year, end_year } = req.query;

//     console.log('ðŸ“Š Year stats request:', { disaster_type, provinsi, das, start_year, end_year });

//     if (!disaster_type) {
//       return res.status(400).json({ error: 'disaster_type is required' });
//     }

//     let query = `
//       SELECT
//         EXTRACT(YEAR FROM incident_date) as year,
//         COUNT(*) as count
//       FROM kejadian
//       WHERE disaster_type = $1
//         AND incident_date IS NOT NULL
//     `;

//     const params = [disaster_type];
//     let paramIndex = 2;

//     // Add location filters
//     if (provinsi) {
//       query += ` AND provinsi = $${paramIndex}`;
//       params.push(provinsi);
//       paramIndex++;
//     }

//     if (das) {
//       query += ` AND das = $${paramIndex}`;
//       params.push(das);
//       paramIndex++;
//     }

//     // Add year range filter
//     if (start_year) {
//       query += ` AND EXTRACT(YEAR FROM incident_date) >= $${paramIndex}`;
//       params.push(parseInt(start_year));
//       paramIndex++;
//     }

//     if (end_year) {
//       query += ` AND EXTRACT(YEAR FROM incident_date) <= $${paramIndex}`;
//       params.push(parseInt(end_year));
//       paramIndex++;
//     }

//     query += `
//       GROUP BY EXTRACT(YEAR FROM incident_date)
//       ORDER BY year
//     `;

//     console.log('ðŸ” Executing query:', query);
//     console.log('ðŸ“ With params:', params);

//     const result = await client.query(query, params);

//     const formattedResults = result.rows.map(row => ({
//       year: parseInt(row.year),
//       count: parseInt(row.count)
//     }));

//     console.log('âœ… Year stats results:', formattedResults);

//     res.json(formattedResults);
//   } catch (error) {
//     console.error('âŒ Error fetching year stats:', error);
//     console.error('âŒ Error stack:', error.stack);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message,
//       detail: error.detail || 'No additional details'
//     });
//   }
// });

// // ================= Endpoint untuk monthly statistics ================
// app.get('/api/kejadian/monthly-stats', async (req, res) => {
//   try {
//     const { disaster_type, provinsi, das, year } = req.query;

//     console.log('ðŸ“… Monthly stats request:', { disaster_type, provinsi, das, year });

//     if (!disaster_type || !year) {
//       return res.status(400).json({ error: 'disaster_type and year are required' });
//     }

//     let query = `
//       SELECT
//         EXTRACT(MONTH FROM incident_date) as month,
//         COUNT(*) as count
//       FROM kejadian
//       WHERE disaster_type = $1
//         AND EXTRACT(YEAR FROM incident_date) = $2
//         AND incident_date IS NOT NULL
//     `;

//     const params = [disaster_type, parseInt(year)];
//     let paramIndex = 3;

//     // Add location filters
//     if (provinsi) {
//       query += ` AND provinsi = $${paramIndex}`;
//       params.push(provinsi);
//       paramIndex++;
//     }

//     if (das) {
//       query += ` AND das = $${paramIndex}`;
//       params.push(das);
//       paramIndex++;
//     }

//     query += `
//       GROUP BY EXTRACT(MONTH FROM incident_date)
//       ORDER BY month
//     `;

//     console.log('ðŸ” Executing query:', query);
//     console.log('ðŸ“ With params:', params);

//     const result = await client.query(query, params);

//     const formattedResults = result.rows.map(row => ({
//       month: parseInt(row.month),
//       count: parseInt(row.count)
//     }));

//     console.log('âœ… Monthly stats results:', formattedResults);

//     res.json(formattedResults);
//   } catch (error) {
//     console.error('âŒ Error fetching monthly stats:', error);
//     console.error('âŒ Error stack:', error.stack);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message,
//       detail: error.detail || 'No additional details'
//     });
//   }
// });

//   app.get('/api/kejadian/impact-stats', async (req, res) => {
//   try {
//     const { disaster_type, provinsi, das, year } = req.query;

//     console.log('ðŸ“Š Impact stats request:', { disaster_type, provinsi, das, year });

//     if (!disaster_type || !year) {
//       return res.status(400).json({ error: 'disaster_type and year are required' });
//     }

//     let query = `
//       SELECT
//         COALESCE(SUM(korban_meninggal), 0)::integer as total_meninggal,
//         COALESCE(SUM(korban_luka_luka), 0)::integer as total_luka,
//         COALESCE(SUM(korban_mengungsi), 0)::integer as total_mengungsi,
//         COALESCE(SUM(rumah_rusak_ringan), 0)::integer as total_rusak_ringan,
//         COALESCE(SUM(rumah_rusak_sedang), 0)::integer as total_rusak_sedang,
//         COALESCE(SUM(rumah_rusak_berat), 0)::integer as total_rusak_berat,
//         COALESCE(SUM(rumah_rusak_terendam), 0)::integer as total_terendam,
//         COALESCE(SUM(infrastruktur_rusak_ringan), 0)::integer as total_infra_ringan,
//         COALESCE(SUM(infrastruktur_rusak_sedang), 0)::integer as total_infra_sedang,
//         COALESCE(SUM(infrastruktur_rusak_berat), 0)::integer as total_infra_berat,
//         COUNT(*)::integer as total_kejadian
//       FROM kejadian
//       WHERE disaster_type = $1
//         AND EXTRACT(YEAR FROM incident_date) = $2
//     `;

//     const params = [disaster_type, parseInt(year)];
//     let paramIndex = 3;

//     if (provinsi) {
//       query += ` AND provinsi = $${paramIndex}`;
//       params.push(provinsi);
//       paramIndex++;
//     } else if (das) {
//       query += ` AND das = $${paramIndex}`;
//       params.push(das);
//     }

//     console.log('ðŸ” Executing query:', query);
//     console.log('ðŸ“ With params:', params);

//     const result = await client.query(query, params);

//     console.log('âœ… Impact stats results:', result.rows[0]);

//     res.json(result.rows[0]);
//   } catch (error) {
//     console.error('âŒ Error fetching impact stats:', error);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message
//     });
//   }
// });

//   app.get('/api/kejadian/by-year', async (req, res) => {
//   try {
//     const { disaster_type, provinsi, das, year } = req.query;

//     console.log('ðŸ“ Kejadian by year request:', { disaster_type, provinsi, das, year });

//     if (!disaster_type || !year) {
//       return res.status(400).json({ error: 'disaster_type and year are required' });
//     }

//     let query = `
//       SELECT
//         id,
//         disaster_type,
//         title,
//         description,
//         incident_date,
//         longitude,
//         latitude,
//         provinsi,
//         kabupaten,
//         kecamatan
//       FROM kejadian
//       WHERE disaster_type = $1
//         AND EXTRACT(YEAR FROM incident_date) = $2
//         AND longitude IS NOT NULL
//         AND latitude IS NOT NULL
//     `;

//     const params = [disaster_type, parseInt(year)];
//     let paramIndex = 3;

//     if (provinsi) {
//       query += ` AND provinsi = $${paramIndex}`;
//       params.push(provinsi);
//       paramIndex++;
//     } else if (das) {
//       query += ` AND das = $${paramIndex}`;
//       params.push(das);
//     }

//     query += ` ORDER BY incident_date DESC`;

//     console.log('ðŸ” Executing query:', query);
//     console.log('ðŸ“ With params:', params);

//     const result = await client.query(query, params);

//     console.log(`âœ… Found ${result.rows.length} incidents for year ${year}`);

//     res.json(result.rows);
//   } catch (error) {
//     console.error('âŒ Error fetching incidents by year:', error);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message
//     });
//   }
// });

//   app.get('/api/kejadian/:id/chart-data', async (req, res) => {
//   try {
//     const { id } = req.params;

//     const kejadianQuery = 'SELECT disaster_type FROM kejadian WHERE id = $1';
//     const kejadianResult = await client.query(kejadianQuery, [id]);

//     if (kejadianResult.rows.length === 0) {
//       return res.status(404).json({ error: 'Kejadian not found' });
//     }

//     const disasterType = kejadianResult.rows[0].disaster_type;
//     let chartData = {};

//     if (disasterType === 'Banjir') {
//       chartData = await getChartDataBanjir(id);
//     } else if (disasterType === 'Kebakaran') {
//       chartData = await getChartDataKebakaran(id);
//     } else if (disasterType === 'Longsor') {
//       chartData = await getChartDataLongsor(id);
//     }

//     res.json({
//       success: true,
//       disaster_type: disasterType,
//       data: chartData
//     });

//   } catch (error) {
//     console.error('Error fetching chart data:', error);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message
//     });
//   }
// });

// async function getChartDataBanjir(kejadianId) {
//   const data = {};

//   const chResult = await client.query(
//     'SELECT jam, curah_hujan FROM curah_hujan WHERE kejadian_id = $1 AND jam IS NOT NULL ORDER BY jam',
//     [kejadianId]
//   );
//   data.curah_hujan = chResult.rows;

//   const dasResult = await client.query(
//     'SELECT * FROM status_das_banjir WHERE kejadian_id = $1',
//     [kejadianId]
//   );
//   data.status_das = dasResult.rows;

//   const tutupanResult = await client.query(
//     'SELECT jenis_tutupan, persentase FROM tutupan_das WHERE kejadian_id = $1',
//     [kejadianId]
//   );
//   data.tutupan_das = tutupanResult.rows;

//   const kemiringanResult = await client.query(
//     'SELECT * FROM kemiringan_lahan WHERE kejadian_id = $1',
//     [kejadianId]
//   );
//   data.kemiringan_lahan = kemiringanResult.rows[0] || null;

//   const kepadatanResult = await client.query(
//     'SELECT * FROM kepadatan_pemukiman WHERE kejadian_id = $1',
//     [kejadianId]
//   );
//   data.kepadatan_pemukiman = kepadatanResult.rows;

//   return data;
// }

// async function getChartDataKebakaran(kejadianId) {
//   const data = {};

//   const dasResult = await client.query(
//     'SELECT * FROM status_das_kebakaran WHERE kejadian_id = $1',
//     [kejadianId]
//   );
//   data.status_das = dasResult.rows;

//   const tutupanResult = await client.query(
//     'SELECT jenis_tutupan, persentase FROM tutupan_das WHERE kejadian_id = $1',
//     [kejadianId]
//   );
//   data.tutupan_das = tutupanResult.rows;

//   const kemiringanResult = await client.query(
//     'SELECT * FROM kemiringan_lahan WHERE kejadian_id = $1',
//     [kejadianId]
//   );
//   data.kemiringan_lahan = kemiringanResult.rows[0] || null;

//   const kepadatanResult = await client.query(
//     'SELECT * FROM kepadatan_pemukiman WHERE kejadian_id = $1',
//     [kejadianId]
//   );
//   data.kepadatan_pemukiman = kepadatanResult.rows;

//   return data;
// }

// async function getChartDataLongsor(kejadianId) {
//   const data = {};

//   const chResult = await client.query(
//     'SELECT hari, curah_hujan FROM curah_hujan WHERE kejadian_id = $1 AND jam IS NULL ORDER BY hari',
//     [kejadianId]
//   );
//   data.curah_hujan = chResult.rows;

//   const lerengResult = await client.query(
//     'SELECT * FROM kemiringan_lereng WHERE kejadian_id = $1',
//     [kejadianId]
//   );
//   data.kemiringan_lereng = lerengResult.rows;

//   const topoResult = await client.query(
//     'SELECT * FROM topografi WHERE kejadian_id = $1',
//     [kejadianId]
//   );
//   data.topografi = topoResult.rows;

//   const geoResult = await client.query(
//     'SELECT * FROM geologi WHERE kejadian_id = $1',
//     [kejadianId]
//   );
//   data.geologi = geoResult.rows;

//   const tanahResult = await client.query(
//     'SELECT jenis_tanah, persentase FROM jenis_tanah WHERE kejadian_id = $1',
//     [kejadianId]
//   );
//   data.jenis_tanah = tanahResult.rows;

//   const patahanResult = await client.query(
//     'SELECT * FROM patahan WHERE kejadian_id = $1',
//     [kejadianId]
//   );
//   data.patahan = patahanResult.rows;

//   const tutupanResult = await client.query(
//     'SELECT jenis_tutupan, persentase FROM tutupan_lahan WHERE kejadian_id = $1',
//     [kejadianId]
//   );
//   data.tutupan_lahan = tutupanResult.rows;

//   const infraResult = await client.query(
//     'SELECT * FROM infrastruktur WHERE kejadian_id = $1',
//     [kejadianId]
//   );
//   data.infrastruktur = infraResult.rows;

//   const kepadatanResult = await client.query(
//     'SELECT * FROM kepadatan_pemukiman WHERE kejadian_id = $1',
//     [kejadianId]
//   );
//   data.kepadatan_pemukiman = kepadatanResult.rows;

//   return data;
// }

// // UPDATED ENDPOINT: Yearly stats without report_type
// app.get('/api/kejadian/yearly-stats', async (req, res) => {
//   try {
//     const { disaster_type, provinsi, das } = req.query;

//     let query = `
//       SELECT
//         EXTRACT(YEAR FROM incident_date) as year,
//         COUNT(*) as count
//       FROM kejadian
//       WHERE incident_date IS NOT NULL
//     `;

//     const params = [];

//     // Add filters based on query parameters - removed report_type filter
//     if (disaster_type) {
//       query += ` AND disaster_type = $${params.length + 1}`;
//       params.push(disaster_type);
//     }

//     // Prioritize DAS if provided, otherwise use provinsi
//     if (das) {
//       query += ` AND das = $${params.length + 1}`;
//       params.push(das);
//     } else if (provinsi) {
//       query += ` AND provinsi = $${params.length + 1}`;
//       params.push(provinsi);
//     }

//     query += `
//       GROUP BY EXTRACT(YEAR FROM incident_date)
//       ORDER BY year ASC
//     `;

//     const result = await client.query(query, params);

//     // Transform data to include years with 0 counts
//     const currentYear = new Date().getFullYear();
//     const yearlyStats = [];

//     // Create array of last 10 years (current year - 9 to current year)
//     for (let year = currentYear - 9; year <= currentYear; year++) {
//       const existingData = result.rows.find(row => parseInt(row.year) === year);
//       yearlyStats.push({
//         year: year,
//         count: existingData ? parseInt(existingData.count) : 0
//       });
//     }

//     res.json(yearlyStats);

//   } catch (error) {
//     console.error('Error fetching yearly statistics:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// // FIXED: Kejadian endpoint dengan parameter placeholder yang benar
// app.get('/api/kejadian', async (req, res) => {
//   try {
//     // let query = `
//     //   SELECT
//     //     id, thumbnail_path, images_paths, disaster_type,
//     //     provinsi, kabupaten, kecamatan, kelurahan, das, title, description, incident_date,
//     //     longitude, latitude, created_at, updated_at,
//     //     curah_hujan, korban_meninggal, korban_luka_luka, korban_mengungsi,
//     //     rumah_rusak_berat, rumah_rusak_sedang, rumah_rusak_ringan, rumah_rusak_terendam,
//     //     infrastruktur_rusak_berat, infrastruktur_rusak_sedang, infrastruktur_rusak_ringan,
//     //     dampak_kebakaran, luas_lokasi_kejadian, kejadian_ke,
//     //     ST_AsGeoJSON(geom) as geometry_json
//     //   FROM kejadian
//     // `;

//     let query = `
//       SELECT
//         id, thumbnail_path, images_paths, disaster_type,
//         provinsi, kabupaten, kecamatan, kelurahan, das, title, description, incident_date,
//         longitude, latitude, created_at, updated_at,
//         korban_meninggal, korban_luka_luka, korban_mengungsi,
//         rumah_rusak_berat, rumah_rusak_sedang, rumah_rusak_ringan, rumah_rusak_terendam,
//         infrastruktur_rusak_berat, infrastruktur_rusak_sedang, infrastruktur_rusak_ringan,
//         dampak_kebakaran, luas_lokasi_kejadian, kejadian_ke,
//         ST_AsGeoJSON(geom) as geometry_json
//       FROM kejadian
//     `;

//     const params = [];
//     const conditions = [];

//     // FIXED: Added $ to all parameter placeholders
//     if (req.query.id) {
//       conditions.push(`id = $${params.length + 1}`);
//       params.push(req.query.id);
//     }

//     if (req.query.provinsi) {
//       conditions.push(`provinsi = $${params.length + 1}`);
//       params.push(req.query.provinsi);
//     }

//     // if (req.query.kabupaten) {
//     //   conditions.push(`kabupaten = $${params.length + 1}`);
//     //   params.push(req.query.kabupaten);
//     // }

//     // if (req.query.kecamatan) {
//     //   conditions.push(`kecamatan = $${params.length + 1}`);
//     //   params.push(req.query.kecamatan);
//     // }

//     // if (req.query.kelurahan) {
//     //   conditions.push(`kelurahan = $${params.length + 1}`);
//     //   params.push(req.query.kelurahan);
//     // }

//     if (req.query.das) {
//       conditions.push(`das = $${params.length + 1}`);
//       params.push(req.query.das);
//     }

//     if (req.query.disaster_type) {
//       conditions.push(`disaster_type = $${params.length + 1}`);
//       params.push(req.query.disaster_type);
//     }

//     if (req.query.start_date) {
//       conditions.push(`incident_date >= $${params.length + 1}`);
//       params.push(req.query.start_date);
//     }

//     if (req.query.end_date) {
//       conditions.push(`incident_date <= $${params.length + 1}`);
//       params.push(req.query.end_date);
//     }

//     if (conditions.length > 0) {
//       query += ' WHERE ' + conditions.join(' AND ');
//     }

//     query += ' ORDER BY created_at DESC LIMIT 1000';

//     const result = await client.query(query, params);
//     // Transform data to include full URLs for images
//     const kejadianData = result.rows.map(row => ({
//       ...row,
//       thumbnail_url: row.thumbnail_path ? `/uploads/${row.thumbnail_path}` : null,
//       images_urls: row.images_paths ? row.images_paths.map(path => `/uploads/${path}`) : []
//     }));

//     res.json(kejadianData);

//   } catch (error) {
//     console.error('Error fetching kejadian:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// // NEW ENDPOINT: Get kejadian as GeoJSON features
// app.get('/api/layers/kejadian', async (req, res) => {
//   try {
//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM kejadian
//     `;

//     const params = [];
//     const conditions = [];

//     if (req.query.provinsi) {
//       conditions.push(`provinsi = $${params.length + 1}`);
//       params.push(req.query.provinsi);
//     }

//     if (req.query.disaster_type) {
//       conditions.push(`disaster_type = $${params.length + 1}`);
//       params.push(req.query.disaster_type);
//     }

//     if (conditions.length > 0) {
//       query += ' WHERE ' + conditions.join(' AND ');
//     }

//     query += ' LIMIT 1000';

//     const result = await client.query(query, params);
//     const features = createFeatures(result.rows, 'kejadian');

//     res.json(features);

//   } catch (error) {
//     console.error('Error fetching kejadian features:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// // UPDATED ENDPOINT: Get single kejadian by ID
// app.get('/api/kejadian/:id', async (req, res) => {
//   try {
//     const { id } = req.params;

//     const query = `
//       SELECT
//         id, thumbnail_path, images_paths, disaster_type,
//         provinsi, kabupaten, kecamatan, kelurahan, das, title, description, incident_date,
//         longitude, latitude, created_at, updated_at,
//         korban_meninggal, korban_luka_luka, korban_mengungsi,
//         rumah_rusak_berat, rumah_rusak_sedang, rumah_rusak_ringan, rumah_rusak_terendam,
//         infrastruktur_rusak_berat, infrastruktur_rusak_sedang, infrastruktur_rusak_ringan,
//         dampak_kebakaran, luas_lokasi_kejadian, kejadian_ke,
//         ST_AsGeoJSON(geom) as geometry_json
//       FROM kejadian
//       WHERE id = $1
//     `;

//     const result = await client.query(query, [id]);

//     if (result.rows.length === 0) {
//       return res.status(404).json({ error: 'Kejadian not found' });
//     }

//     // Transform data to include full URLs for images
//     const kejadianData = {
//       ...result.rows[0],
//       thumbnail_url: result.rows[0].thumbnail_path ? `/uploads/${result.rows[0].thumbnail_path}` : null,
//       images_urls: result.rows[0].images_paths ? result.rows[0].images_paths.map(path => `/uploads/${path}`) : []
//     };

//     res.json(kejadianData);

//   } catch (error) {
//     console.error('Error fetching kejadian by ID:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// // UPDATED ENDPOINT: Delete kejadian dengan cache invalidation

// // app.delete('/api/kejadian/:id', async (req, res) => {
// //   try {
// //     const { id } = req.params;

// //     if (!id || isNaN(parseInt(id))) {
// //       return res.status(400).json({
// //         error: 'Invalid kejadian ID'
// //       });
// //     }

// //     // Get the kejadian data first untuk cache invalidation
// //     const selectQuery = 'SELECT * FROM kejadian WHERE id = $1';
// //     const selectResult = await client.query(selectQuery, [id]);

// //     if (selectResult.rows.length === 0) {
// //       return res.status(404).json({
// //         error: 'Kejadian not found'
// //       });
// //     }

// //     const kejadianData = selectResult.rows[0];

// //     // Delete the record from database

// //     const deleteQuery = 'DELETE FROM kejadian WHERE id = $1 RETURNING id, title, disaster_type';
// //     const deleteResult = await client.query(deleteQuery, [id]);

// //     if (deleteResult.rows.length === 0) {
// //       return res.status(404).json({
// //         error: 'Failed to delete kejadian'
// //       });
// //     }

// //     const deletedKejadian = deleteResult.rows[0];

// //     // TAMBAHAN: Invalidate risk cache setelah menghapus kejadian
// //     invalidateRiskCache({
// //       disaster_type: kejadianData.disaster_type,
// //       provinsi: kejadianData.provinsi,
// //       kabupaten: kejadianData.kabupaten,
// //       kecamatan: kejadianData.kecamatan,
// //       kelurahan: kejadianData.kelurahan,
// //       das: kejadianData.das
// //     });

// //     // Clean up associated files
// //     const filesToDelete = [];

// //     if (kejadianData.thumbnail_path) {
// //       filesToDelete.push(kejadianData.thumbnail_path);
// //     }

// //     if (kejadianData.images_paths && Array.isArray(kejadianData.images_paths)) {
// //       filesToDelete.push(...kejadianData.images_paths);
// //     }

// //     if (filesToDelete.length > 0) {
// //       deleteFiles(filesToDelete);
// //     }

// //     res.status(200).json({
// //       success: true,
// //       message: 'Kejadian berhasil dihapus',
// //       data: {
// //         id: deletedKejadian.id,
// //         title: deletedKejadian.title,
// //         disaster_type: deletedKejadian.disaster_type,
// //         files_deleted: filesToDelete.length,
// //         cache_invalidated: true
// //       }
// //     });

// //   } catch (error) {
// //     console.error('Error deleting kejadian:', error);
// //     res.status(500).json({
// //       error: 'Internal Server Error',
// //       message: error.message
// //     });
// //   }
// // });

// app.delete('/api/kejadian/:id', async (req, res) => {
//   let dbClient;

//   try {
//     const { id } = req.params;

//     if (!id || isNaN(parseInt(id))) {
//       return res.status(400).json({
//         error: 'Invalid kejadian ID'
//       });
//     }

//     dbClient = await pool.connect();
//     await dbClient.query('BEGIN');

//     // Get the kejadian data first untuk cache invalidation dan file cleanup
//     const selectQuery = 'SELECT * FROM kejadian WHERE id = $1';
//     const selectResult = await dbClient.query(selectQuery, [id]);

//     if (selectResult.rows.length === 0) {
//       await dbClient.query('ROLLBACK');
//       return res.status(404).json({
//         error: 'Kejadian not found'
//       });
//     }

//     const kejadianData = selectResult.rows[0];

//     // Delete the record from database (CASCADE akan otomatis delete related tables)
//     const deleteQuery = 'DELETE FROM kejadian WHERE id = $1 RETURNING id, title, disaster_type';
//     const deleteResult = await dbClient.query(deleteQuery, [id]);

//     if (deleteResult.rows.length === 0) {
//       await dbClient.query('ROLLBACK');
//       return res.status(404).json({
//         error: 'Failed to delete kejadian'
//       });
//     }

//     const deletedKejadian = deleteResult.rows[0];

//     await dbClient.query('COMMIT');

//     // Invalidate risk cache setelah commit berhasil
//     invalidateRiskCache({
//       disaster_type: kejadianData.disaster_type,
//       provinsi: kejadianData.provinsi,
//       kabupaten: kejadianData.kabupaten,
//       kecamatan: kejadianData.kecamatan,
//       kelurahan: kejadianData.kelurahan,
//       das: kejadianData.das
//     });

//     // Clean up associated files setelah commit berhasil
//     const filesToDelete = [];

//     if (kejadianData.thumbnail_path) {
//       filesToDelete.push(kejadianData.thumbnail_path);
//     }

//     if (kejadianData.images_paths && Array.isArray(kejadianData.images_paths)) {
//       filesToDelete.push(...kejadianData.images_paths);
//     }

//     if (filesToDelete.length > 0) {
//       deleteFiles(filesToDelete);
//     }

//     res.status(200).json({
//       success: true,
//       message: 'Kejadian dan semua data terkait berhasil dihapus (CASCADE)',
//       data: {
//         id: deletedKejadian.id,
//         title: deletedKejadian.title,
//         disaster_type: deletedKejadian.disaster_type,
//         files_deleted: filesToDelete.length,
//         cache_invalidated: true
//       }
//     });

//   } catch (error) {
//     if (dbClient) await dbClient.query('ROLLBACK');
//     console.error('Error deleting kejadian:', error);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message
//     });
//   } finally {
//     if (dbClient) dbClient.release();
//   }
// });

// // TAMBAHAN: NEW ENDPOINT untuk trigger manual refresh risk analysis

// app.post('/api/risk-analysis/refresh', async (req, res) => {
//   try {
//     const { disaster_type, provinsi, kabupaten, kecamatan, kelurahan, das, action } = req.body;

//     if (!disaster_type) {
//       return res.status(400).json({
//         error: 'disaster_type is required'
//       });
//     }

//     // Invalidate affected cache entries
//     invalidateRiskCache({
//       disaster_type, provinsi, kabupaten, kecamatan, kelurahan, das
//     });

//     // Optional: Bisa tambahkan pre-warming cache untuk area yang sering diakses
//     const popularAreas = [];

//     if (provinsi) {
//       popularAreas.push({
//         disaster_type,
//         level: 'Provinsi',
//         location_name: provinsi
//       });
//     }

//     if (kabupaten) {
//       popularAreas.push({
//         disaster_type,
//         level: 'Kabupaten/Kota',
//         location_name: kabupaten
//       });
//     }

//     // Pre-warm cache untuk area populer (optional)
//     let preWarmedCount = 0;
//     for (const area of popularAreas) {
//       try {

//         // Simulate cache warming dengan memanggil risk analysis
//         const cacheKey = `${area.disaster_type}|${area.level}|${area.location_name}`;
//         if (!riskAnalysisCache.has(cacheKey)) {
//           // Bisa panggil fungsi risk analysis di sini untuk cache warming
//           preWarmedCount++;
//         }
//       } catch (warmingError) {
//         console.warn('Cache warming failed for area:', area, warmingError.message);
//       }
//     }

//     res.status(200).json({
//       success: true,
//       message: 'Risk analysis refresh completed',
//       details: {
//         action: action || 'manual_refresh',
//         disaster_type,
//         affected_areas: { provinsi, kabupaten, kecamatan, kelurahan, das },
//         cache_entries_cleared: riskAnalysisCache.size,
//         cache_entries_prewarmed: preWarmedCount,
//         timestamp: new Date().toISOString()
//       }
//     });
//   } catch (error) {
//     console.error('Error in risk analysis refresh:', error);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message
//     });
//   }
// });

// // Helper function to delete files (unchanged)
// const deleteFiles = (filePaths) => {
//   if (!filePaths) return;
//   const pathsArray = Array.isArray(filePaths) ? filePaths : [filePaths];
//   pathsArray.forEach(filePath => {
//     if (filePath) {
//       const fullPath = path.join(uploadDir, filePath);
//       try {
//         if (fs.existsSync(fullPath)) {
//           fs.unlinkSync(fullPath);
//         }
//       } catch (error) {
//         console.error(`Error deleting file ${fullPath}:`, error);
//       }
//     }
//   });
// };

// // Layer endpoints dengan filtering - TETAP MENGGUNAKAN REFERENCE_MAPPING
// app.get('/api/layers/provinsi', async (req, res) => {
//   try {

//     let query = `
//       SELECT
//         gid, kode_prov, provinsi, fid,
//         ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM provinsi
//     `;

//     const params = [];
//     let appliedFilter = 'none';

//     if (req.query.provinsi) {
//       query += buildWhereClause('provinsi', req.query.provinsi, params);
//       appliedFilter = `provinsi: ${req.query.provinsi}`;
//     }

//     query += ' ORDER BY provinsi LIMIT 1000';

//     const result = await client.query(query, params);

//     if (result.rows.length === 0) {
//       return res.json([]);
//     }

//     const features = createFeatures(result.rows, 'provinsi');

//     res.json(features);
//   } catch (error) {
//     console.error('Error fetching provinsi:', error);
//     console.error('Error stack:', error.stack);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message,
//       endpoint: 'provinsi'
//     });
//   }
// });

// // TAMBAHAN: Endpoints untuk kab_kota dan kecamatan (yang belum ada)
// app.get('/api/layers/kab_kota', async (req, res) => {
//   try {
//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM kab_kota
//     `;

//     const params = [];
//     if (req.query.kab_kota) {
//       query += buildWhereClause('kab_kota', req.query.kab_kota, params);
//     } else if (req.query.provinsi) {
//       query += buildWhereClause('provinsi', req.query.provinsi, params);
//     }

//     query += ' LIMIT 1000';

//     const result = await client.query(query, params);
//     const features = createFeatures(result.rows, 'kab_kota');

//     res.json(features);
//   } catch (error) {
//     console.error('Error fetching kab_kota:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// app.get('/api/layers/kecamatan', async (req, res) => {
//   try {
//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM kecamatan
//     `;

//     const params = [];
//     if (req.query.kecamatan) {
//       query += buildWhereClause('kecamatan', req.query.kecamatan, params);
//     } else if (req.query.kab_kota) {
//       query += buildWhereClause('kab_kota', req.query.kab_kota, params);
//     }

//     query += ' LIMIT 1000';

//     const result = await client.query(query, params);
//     const features = createFeatures(result.rows, 'kecamatan');

//     res.json(features);
//   } catch (error) {
//     console.error('Error fetching kecamatan:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// // PERBAIKAN 2: Endpoint DAS dengan error handling yang lebih baik
// app.get('/api/layers/das', async (req, res) => {
//   try {

//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM das
//     `;

//     const params = [];
//     let appliedFilter = 'none';

//     if (req.query.nama_das) {
//       query += buildWhereClause('nama_das', req.query.nama_das, params);
//       appliedFilter = `nama_das: ${req.query.nama_das}`;
//     }

//     query += ' ORDER BY nama_das LIMIT 1000';

//     const result = await client.query(query, params);

//     if (result.rows.length === 0) {
//       return res.json([]);
//     }

//     const features = createFeatures(result.rows, 'das');

//     res.json(features);
//   } catch (error) {
//     console.error('Error fetching das:', error);
//     console.error('Error stack:', error.stack);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message,
//       endpoint: 'das'
//     });
//   }
// });

// // Endpoint lahan_kritis - MENGGUNAKAN REFERENCE_MAPPING
// app.get('/api/layers/lahan_kritis', async (req, res) => {
//   try {

//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM lahan_kritis
//     `;

//     const params = [];
//     let appliedFilter = 'none';

//     if (req.query.filterType === 'province' && req.query.provinceName) {

//       // Check if REFERENCE_MAPPING exists and has the required data
//       if (!REFERENCE_MAPPING || !REFERENCE_MAPPING.lahan_kritis || !REFERENCE_MAPPING.lahan_kritis.provinsi_to_bpdas) {
//         console.error('REFERENCE_MAPPING.lahan_kritis.provinsi_to_bpdas not found');
//         return res.status(500).json({
//           error: 'Reference mapping not available',
//           message: 'lahan_kritis provinsi mapping not configured'
//         });
//       }

//       const bpdasValue = REFERENCE_MAPPING.lahan_kritis.provinsi_to_bpdas[req.query.provinceName];

//       if (bpdasValue) {
//         query += buildWhereClause('bpdas', bpdasValue, params);
//         appliedFilter = `province: ${req.query.provinceName} -> bpdas: ${JSON.stringify(bpdasValue)}`;
//       } else {
//         return res.json([]); // Return empty if no mapping
//       }
//     }

//     if (req.query.filterType === 'das' && req.query.dasName) {

//       if (!REFERENCE_MAPPING || !REFERENCE_MAPPING.lahan_kritis || !REFERENCE_MAPPING.lahan_kritis.das_to_bpdas) {
//         console.error('REFERENCE_MAPPING.lahan_kritis.das_to_bpdas not found');
//         return res.status(500).json({
//           error: 'Reference mapping not available',
//           message: 'lahan_kritis DAS mapping not configured'
//         });
//       }

//       const bpdasValue = REFERENCE_MAPPING.lahan_kritis.das_to_bpdas[req.query.dasName];

//       if (bpdasValue) {
//         query += buildWhereClause('bpdas', bpdasValue, params);
//         appliedFilter = `das: ${req.query.dasName} -> bpdas: ${JSON.stringify(bpdasValue)}`;
//       } else {
//         return res.json([]); // Return empty if no mapping
//       }
//     }

//     query += ' LIMIT 1000';

//     const result = await client.query(query, params);

//     if (result.rows.length === 0) {
//       return res.json([]);
//     }

//     const features = createFeatures(result.rows, 'lahan_kritis');

//     res.json(features);
//   } catch (error) {
//     console.error('Error fetching lahan_kritis:', error);
//     console.error('Error stack:', error.stack);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message,
//       endpoint: 'lahan_kritis'
//     });
//   }
// });

// // PERBAIKAN 4: Endpoint penutupan_lahan_2024 dengan error handling yang lebih baik
// app.get('/api/layers/penutupan_lahan_2024', async (req, res) => {
//   try {

//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM penutupan_lahan_2024
//     `;

//     const params = [];
//     let appliedFilter = 'none';

//     if (req.query.filterType === 'province' && req.query.provinceName) {

//       // Direct lookup kode_prov dari tabel provinsi
//       try {
//         const provinceCodeQuery = await client.query('SELECT kode_prov FROM provinsi WHERE provinsi = $1', [req.query.provinceName]);

//         if (provinceCodeQuery.rows.length > 0) {
//           const kodeProvValue = provinceCodeQuery.rows[0].kode_prov;
//           query += buildWhereClause('kode_prov', kodeProvValue, params);
//           appliedFilter = `province: ${req.query.provinceName} -> kode_prov: ${kodeProvValue}`;
//         } else {
//           return res.json([]); // Return empty if province not found
//         }
//       } catch (provinceError) {
//         console.error('Error looking up province code:', provinceError);
//         return res.status(500).json({
//           error: 'Province lookup failed',
//           message: provinceError.message
//         });
//       }
//     }

//     if (req.query.filterType === 'das' && req.query.dasName) {

//       if (!REFERENCE_MAPPING || !REFERENCE_MAPPING.penutupan_lahan_2024 || !REFERENCE_MAPPING.penutupan_lahan_2024.das_to_kode_prov) {
//         console.error('REFERENCE_MAPPING.penutupan_lahan_2024.das_to_kode_prov not found');
//         return res.status(500).json({
//           error: 'Reference mapping not available',
//           message: 'penutupan_lahan_2024 DAS mapping not configured'
//         });
//       }

//       const kodeProv = REFERENCE_MAPPING.penutupan_lahan_2024.das_to_kode_prov[req.query.dasName];

//       if (kodeProv) {
//         query += buildWhereClause('kode_prov', kodeProv, params);
//         appliedFilter = `das: ${req.query.dasName} -> kode_prov: ${JSON.stringify(kodeProv)}`;
//       } else {
//         return res.json([]); // Return empty if no mapping
//       }
//     }

//     query += ' LIMIT 1000';

//     const result = await client.query(query, params);

//     if (result.rows.length === 0) {
//       return res.json([]);
//     }

//     const features = createFeatures(result.rows, 'penutupan_lahan_2024');

//     res.json(features);
//   } catch (error) {
//     console.error('Error fetching penutupan_lahan_2024:', error);
//     console.error('Error stack:', error.stack);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message,
//       endpoint: 'penutupan_lahan_2024'
//     });
//   }
// });

// // Endpoint rawan_erosi - MENGGUNAKAN REFERENCE_MAPPING
// app.get('/api/layers/rawan_erosi', async (req, res) => {
//   try {
//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM rawan_erosi
//     `;

//     const params = [];

//     if (req.query.filterType === 'province' && req.query.provinceName) {
//       const nBpdasValue = REFERENCE_MAPPING.rawan_erosi.provinsi_to_n_bpdas[req.query.provinceName];
//       if (nBpdasValue) {
//         query += buildWhereClause('n_bpdas', nBpdasValue, params);
//       }
//     }

//     if (req.query.filterType === 'das' && req.query.dasName) {
//       const nBpdasValue = REFERENCE_MAPPING.rawan_erosi.das_to_n_bpdas[req.query.dasName];
//       if (nBpdasValue) {
//         query += buildWhereClause('n_bpdas', nBpdasValue, params);
//       }
//     }

//     query += ' LIMIT 1000';

//     const result = await client.query(query, params);
//     const features = createFeatures(result.rows, 'rawan_erosi');

//     res.json(features);
//   } catch (error) {
//     console.error('Error fetching rawan_erosi:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// // Endpoint rawan_karhutla_2024 - MENGGUNAKAN REFERENCE_MAPPING
// app.get('/api/layers/rawan_karhutla_2024', async (req, res) => {
//   try {
//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM rawan_karhutla_2024
//     `;

//     const params = [];

//     if (req.query.filterType === 'province' && req.query.provinceName) {
//       const provinsiValue = REFERENCE_MAPPING.rawan_karhutla_2024.provinsi_direct[req.query.provinceName];
//       if (provinsiValue) {
//         query += buildWhereClause('provinsi', provinsiValue, params);
//       }
//     }

//     if (req.query.filterType === 'das' && req.query.dasName) {
//       const provinsiValue = REFERENCE_MAPPING.rawan_karhutla_2024.das_to_provinsi[req.query.dasName];
//       if (provinsiValue) {
//         query += buildWhereClause('provinsi', provinsiValue, params);
//       }
//     }

//     query += ' LIMIT 1000';

//     const result = await client.query(query, params);
//     const features = createFeatures(result.rows, 'rawan_karhutla_2024');

//     res.json(features);
//   } catch (error) {
//     console.error('Error fetching rawan_karhutla_2024:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// // Endpoint rawan_limpasan - MENGGUNAKAN REFERENCE_MAPPING
// app.get('/api/layers/rawan_limpasan', async (req, res) => {
//   try {
//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM rawan_limpasan
//     `;

//     const params = [];

//     if (req.query.filterType === 'province' && req.query.provinceName) {
//       const wilKerjaValue = REFERENCE_MAPPING.rawan_limpasan.provinsi_to_wil_kerja[req.query.provinceName];
//       if (wilKerjaValue) {
//         query += buildWhereClause('wil_kerja', wilKerjaValue, params);
//       }
//     }

//     if (req.query.filterType === 'das' && req.query.dasName) {
//       const wilKerjaValue = REFERENCE_MAPPING.rawan_limpasan.das_to_wil_kerja[req.query.dasName];
//       if (wilKerjaValue) {
//         query += buildWhereClause('wil_kerja', wilKerjaValue, params);
//       }
//     }

//     query += ' LIMIT 1000';

//     const result = await client.query(query, params);
//     const features = createFeatures(result.rows, 'rawan_limpasan');

//     res.json(features);
//   } catch (error) {
//     console.error('Error fetching rawan_limpasan:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// // NEW: Endpoint lahan_kritis dengan year - MENGGUNAKAN REFERENCE_MAPPING
// app.get('/api/layers/lahan_kritis/year/:year', async (req, res) => {
//   try {
//     const { year } = req.params;

//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM lahan_kritis
//       WHERE tahun_data = $1
//     `;

//     const params = [parseInt(year)];
//     let appliedFilter = `year: ${year}`;

//     if (req.query.filterType === 'province' && req.query.provinceName) {
//       if (!REFERENCE_MAPPING?.lahan_kritis?.provinsi_to_bpdas) {
//         console.error('REFERENCE_MAPPING.lahan_kritis.provinsi_to_bpdas not found');
//         return res.status(500).json({
//           error: 'Reference mapping not available',
//           message: 'lahan_kritis provinsi mapping not configured'
//         });
//       }

//       const bpdasValue = REFERENCE_MAPPING.lahan_kritis.provinsi_to_bpdas[req.query.provinceName];

//       if (bpdasValue) {
//         if (Array.isArray(bpdasValue)) {
//           query += ` AND bpdas = ANY($${params.length + 1})`;
//           params.push(bpdasValue);
//         } else {
//           query += ` AND bpdas = $${params.length + 1}`;
//           params.push(bpdasValue);
//         }
//         appliedFilter += `, province: ${req.query.provinceName} -> bpdas: ${JSON.stringify(bpdasValue)}`;
//       } else {
//         return res.json([]);
//       }
//     }

//     if (req.query.filterType === 'das' && req.query.dasName) {
//       if (!REFERENCE_MAPPING?.lahan_kritis?.das_to_bpdas) {
//         console.error('REFERENCE_MAPPING.lahan_kritis.das_to_bpdas not found');
//         return res.status(500).json({
//           error: 'Reference mapping not available',
//           message: 'lahan_kritis DAS mapping not configured'
//         });
//       }

//       const bpdasValue = REFERENCE_MAPPING.lahan_kritis.das_to_bpdas[req.query.dasName];

//       if (bpdasValue) {
//         if (Array.isArray(bpdasValue)) {
//           query += ` AND bpdas = ANY($${params.length + 1})`;
//           params.push(bpdasValue);
//         } else {
//           query += ` AND bpdas = $${params.length + 1}`;
//           params.push(bpdasValue);
//         }
//         appliedFilter += `, das: ${req.query.dasName} -> bpdas: ${JSON.stringify(bpdasValue)}`;
//       } else {
//         return res.json([]);
//       }
//     }

//     console.log('ðŸ” Fetching layer lahan_kritis for year', year);
//     console.log('ðŸ“‹ Applied filters:', appliedFilter);
//     console.log('ðŸ“ Executing query with params:', params);

//     query += ' LIMIT 10000';

//     const result = await client.query(query, params);

//     console.log(`âœ… Found ${result.rows.length} record(s) in lahan_kritis for year ${year}`);

//     if (result.rows.length === 0) {
//       return res.json([]);
//     }

//     const features = createFeatures(result.rows, 'lahan_kritis');
//     res.json(features);

//   } catch (error) {
//     console.error('âŒ Error fetching lahan_kritis with year:', error);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message,
//       endpoint: 'lahan_kritis/year'
//     });
//   }
// });

// // NEW: Endpoint penutupan_lahan_2024 dengan year
// app.get('/api/layers/penutupan_lahan_2024/year/:year', async (req, res) => {
//   try {
//     const { year } = req.params;

//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM penutupan_lahan_2024
//       WHERE tahun_data = $1
//     `;

//     const params = [parseInt(year)];
//     let appliedFilter = `year: ${year}`;

//     if (req.query.filterType === 'province' && req.query.provinceName) {
//       try {
//         const provinceCodeQuery = await client.query(
//           'SELECT kode_prov FROM provinsi WHERE provinsi = $1 ORDER BY tahun_data DESC LIMIT 1',
//           [req.query.provinceName]
//         );

//         if (provinceCodeQuery.rows.length > 0) {
//           const kodeProvValue = provinceCodeQuery.rows[0].kode_prov;
//           query += ` AND kode_prov = $${params.length + 1}`;
//           params.push(kodeProvValue);
//           appliedFilter += `, province: ${req.query.provinceName} -> kode_prov: ${kodeProvValue}`;
//         } else {
//           return res.json([]);
//         }
//       } catch (provinceError) {
//         console.error('Error looking up province code:', provinceError);
//         return res.status(500).json({
//           error: 'Province lookup failed',
//           message: provinceError.message
//         });
//       }
//     }

//     if (req.query.filterType === 'das' && req.query.dasName) {
//       if (!REFERENCE_MAPPING?.penutupan_lahan_2024?.das_to_kode_prov) {
//         console.error('REFERENCE_MAPPING.penutupan_lahan_2024.das_to_kode_prov not found');
//         return res.status(500).json({
//           error: 'Reference mapping not available',
//           message: 'penutupan_lahan_2024 DAS mapping not configured'
//         });
//       }

//       const kodeProv = REFERENCE_MAPPING.penutupan_lahan_2024.das_to_kode_prov[req.query.dasName];

//       if (kodeProv) {
//         if (Array.isArray(kodeProv)) {
//           query += ` AND kode_prov = ANY($${params.length + 1})`;
//           params.push(kodeProv);
//         } else {
//           query += ` AND kode_prov = $${params.length + 1}`;
//           params.push(kodeProv);
//         }
//         appliedFilter += `, das: ${req.query.dasName} -> kode_prov: ${JSON.stringify(kodeProv)}`;
//       } else {
//         return res.json([]);
//       }
//     }

//     console.log('ðŸ” Fetching layer penutupan_lahan_2024 for year', year);
//     console.log('ðŸ“‹ Applied filters:', appliedFilter);
//     console.log('ðŸ“ Executing query with params:', params);

//     query += ' LIMIT 10000';

//     const result = await client.query(query, params);

//     console.log(`âœ… Found ${result.rows.length} record(s) in penutupan_lahan_2024 for year ${year}`);

//     if (result.rows.length === 0) {
//       return res.json([]);
//     }

//     const features = createFeatures(result.rows, 'penutupan_lahan_2024');
//     res.json(features);

//   } catch (error) {
//     console.error('âŒ Error fetching penutupan_lahan_2024 with year:', error);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message,
//       endpoint: 'penutupan_lahan_2024/year'
//     });
//   }
// });

// // NEW: Endpoint areal_karhutla_2024 dengan year (untuk Kebakaran - Kebencanaan)
// app.get('/api/layers/areal_karhutla_2024/year/:year', async (req, res) => {
//   try {
//     const { year } = req.params;

//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM areal_karhutla_2024
//       WHERE tahun_data = $1
//     `;

//     const params = [parseInt(year)];
//     let appliedFilter = `year: ${year}`;

//     // Note: areal_karhutla_2024 belum ada mapping di REFERENCE_MAPPING,
//     // jadi untuk sementara hanya filter by year
//     // Ketika mapping sudah tersedia, bisa ditambahkan filter lokasi di sini

//     console.log('ðŸ” Fetching layer areal_karhutla_2024 for year', year);
//     console.log('ðŸ“‹ Applied filters:', appliedFilter);
//     console.log('ðŸ“ Executing query with params:', params);

//     query += ' LIMIT 10000';

//     const result = await client.query(query, params);

//     console.log(`âœ… Found ${result.rows.length} record(s) in areal_karhutla_2024 for year ${year}`);

//     if (result.rows.length === 0) {
//       return res.json([]);
//     }

//     const features = createFeatures(result.rows, 'areal_karhutla_2024');
//     res.json(features);

//   } catch (error) {
//     console.error('âŒ Error fetching areal_karhutla_2024 with year:', error);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message,
//       endpoint: 'areal_karhutla_2024/year'
//     });
//   }
// });

// // NEW: Endpoint rawan_erosi dengan year
// app.get('/api/layers/rawan_erosi/year/:year', async (req, res) => {
//   try {
//     const { year } = req.params;

//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM rawan_erosi
//       WHERE tahun_data = $1
//     `;

//     const params = [parseInt(year)];
//     let appliedFilter = `year: ${year}`;

//     if (req.query.filterType === 'province' && req.query.provinceName) {
//       if (!REFERENCE_MAPPING?.rawan_erosi?.provinsi_to_n_bpdas) {
//         console.error('REFERENCE_MAPPING.rawan_erosi.provinsi_to_n_bpdas not found');
//         return res.status(500).json({
//           error: 'Reference mapping not available'
//         });
//       }

//       const nBpdasValue = REFERENCE_MAPPING.rawan_erosi.provinsi_to_n_bpdas[req.query.provinceName];

//       if (nBpdasValue) {
//         if (Array.isArray(nBpdasValue)) {
//           query += ` AND n_bpdas = ANY($${params.length + 1})`;
//           params.push(nBpdasValue);
//         } else {
//           query += ` AND n_bpdas = $${params.length + 1}`;
//           params.push(nBpdasValue);
//         }
//         appliedFilter += `, province: ${req.query.provinceName} -> n_bpdas: ${JSON.stringify(nBpdasValue)}`;
//       } else {
//         return res.json([]);
//       }
//     }

//     if (req.query.filterType === 'das' && req.query.dasName) {
//       if (!REFERENCE_MAPPING?.rawan_erosi?.das_to_n_bpdas) {
//         console.error('REFERENCE_MAPPING.rawan_erosi.das_to_n_bpdas not found');
//         return res.status(500).json({
//           error: 'Reference mapping not available'
//         });
//       }

//       const nBpdasValue = REFERENCE_MAPPING.rawan_erosi.das_to_n_bpdas[req.query.dasName];

//       if (nBpdasValue) {
//         if (Array.isArray(nBpdasValue)) {
//           query += ` AND n_bpdas = ANY($${params.length + 1})`;
//           params.push(nBpdasValue);
//         } else {
//           query += ` AND n_bpdas = $${params.length + 1}`;
//           params.push(nBpdasValue);
//         }
//         appliedFilter += `, das: ${req.query.dasName} -> n_bpdas: ${JSON.stringify(nBpdasValue)}`;
//       } else {
//         return res.json([]);
//       }
//     }

//     console.log('ðŸ” Fetching layer rawan_erosi for year', year);
//     console.log('ðŸ“‹ Applied filters:', appliedFilter);
//     console.log('ðŸ“ Executing query with params:', params);

//     query += ' LIMIT 10000';

//     const result = await client.query(query, params);

//     console.log(`âœ… Found ${result.rows.length} record(s) in rawan_erosi for year ${year}`);

//     if (result.rows.length === 0) {
//       return res.json([]);
//     }

//     const features = createFeatures(result.rows, 'rawan_erosi');
//     res.json(features);

//   } catch (error) {
//     console.error('âŒ Error fetching rawan_erosi with year:', error);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message,
//       endpoint: 'rawan_erosi/year'
//     });
//   }
// });

// // NEW: Endpoint rawan_karhutla_2024 dengan year
// app.get('/api/layers/rawan_karhutla_2024/year/:year', async (req, res) => {
//   try {
//     const { year } = req.params;

//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM rawan_karhutla_2024
//       WHERE tahun_data = $1
//     `;

//     const params = [parseInt(year)];
//     let appliedFilter = `year: ${year}`;

//     if (req.query.filterType === 'province' && req.query.provinceName) {
//       if (!REFERENCE_MAPPING?.rawan_karhutla_2024?.provinsi_direct) {
//         console.error('REFERENCE_MAPPING.rawan_karhutla_2024.provinsi_direct not found');
//         return res.status(500).json({
//           error: 'Reference mapping not available'
//         });
//       }

//       const provinsiValue = REFERENCE_MAPPING.rawan_karhutla_2024.provinsi_direct[req.query.provinceName];

//       if (provinsiValue) {
//         query += ` AND provinsi = $${params.length + 1}`;
//         params.push(provinsiValue);
//         appliedFilter += `, province: ${req.query.provinceName} -> provinsi: ${provinsiValue}`;
//       } else {
//         return res.json([]);
//       }
//     }

//     if (req.query.filterType === 'das' && req.query.dasName) {
//       if (!REFERENCE_MAPPING?.rawan_karhutla_2024?.das_to_provinsi) {
//         console.error('REFERENCE_MAPPING.rawan_karhutla_2024.das_to_provinsi not found');
//         return res.status(500).json({
//           error: 'Reference mapping not available'
//         });
//       }

//       const provinsiValue = REFERENCE_MAPPING.rawan_karhutla_2024.das_to_provinsi[req.query.dasName];

//       if (provinsiValue) {
//         if (Array.isArray(provinsiValue)) {
//           query += ` AND provinsi = ANY($${params.length + 1})`;
//           params.push(provinsiValue);
//         } else {
//           query += ` AND provinsi = $${params.length + 1}`;
//           params.push(provinsiValue);
//         }
//         appliedFilter += `, das: ${req.query.dasName} -> provinsi: ${JSON.stringify(provinsiValue)}`;
//       } else {
//         return res.json([]);
//       }
//     }

//     console.log('ðŸ” Fetching layer rawan_karhutla_2024 for year', year);
//     console.log('ðŸ“‹ Applied filters:', appliedFilter);
//     console.log('ðŸ“ Executing query with params:', params);

//     query += ' LIMIT 10000';

//     const result = await client.query(query, params);

//     console.log(`âœ… Found ${result.rows.length} record(s) in rawan_karhutla_2024 for year ${year}`);

//     if (result.rows.length === 0) {
//       return res.json([]);
//     }

//     const features = createFeatures(result.rows, 'rawan_karhutla_2024');
//     res.json(features);

//   } catch (error) {
//     console.error('âŒ Error fetching rawan_karhutla_2024 with year:', error);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message,
//       endpoint: 'rawan_karhutla_2024/year'
//     });
//   }
// });

// // NEW: Endpoint rawan_limpasan dengan year
// app.get('/api/layers/rawan_limpasan/year/:year', async (req, res) => {
//   try {
//     const { year } = req.params;

//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM rawan_limpasan
//       WHERE tahun_data = $1
//     `;

//     const params = [parseInt(year)];
//     let appliedFilter = `year: ${year}`;

//     if (req.query.filterType === 'province' && req.query.provinceName) {
//       if (!REFERENCE_MAPPING?.rawan_limpasan?.provinsi_to_wil_kerja) {
//         console.error('REFERENCE_MAPPING.rawan_limpasan.provinsi_to_wil_kerja not found');
//         return res.status(500).json({
//           error: 'Reference mapping not available'
//         });
//       }

//       const wilKerjaValue = REFERENCE_MAPPING.rawan_limpasan.provinsi_to_wil_kerja[req.query.provinceName];

//       if (wilKerjaValue) {
//         if (Array.isArray(wilKerjaValue)) {
//           query += ` AND wil_kerja = ANY($${params.length + 1})`;
//           params.push(wilKerjaValue);
//         } else {
//           query += ` AND wil_kerja = $${params.length + 1}`;
//           params.push(wilKerjaValue);
//         }
//         appliedFilter += `, province: ${req.query.provinceName} -> wil_kerja: ${JSON.stringify(wilKerjaValue)}`;
//       } else {
//         return res.json([]);
//       }
//     }

//     if (req.query.filterType === 'das' && req.query.dasName) {
//       if (!REFERENCE_MAPPING?.rawan_limpasan?.das_to_wil_kerja) {
//         console.error('REFERENCE_MAPPING.rawan_limpasan.das_to_wil_kerja not found');
//         return res.status(500).json({
//           error: 'Reference mapping not available'
//         });
//       }

//       const wilKerjaValue = REFERENCE_MAPPING.rawan_limpasan.das_to_wil_kerja[req.query.dasName];

//       if (wilKerjaValue) {
//         if (Array.isArray(wilKerjaValue)) {
//           query += ` AND wil_kerja = ANY($${params.length + 1})`;
//           params.push(wilKerjaValue);
//         } else {
//           query += ` AND wil_kerja = $${params.length + 1}`;
//           params.push(wilKerjaValue);
//         }
//         appliedFilter += `, das: ${req.query.dasName} -> wil_kerja: ${JSON.stringify(wilKerjaValue)}`;
//       } else {
//         return res.json([]);
//       }
//     }

//     console.log('ðŸ” Fetching layer rawan_limpasan for year', year);
//     console.log('ðŸ“‹ Applied filters:', appliedFilter);
//     console.log('ðŸ“ Executing query with params:', params);

//     query += ' LIMIT 10000';

//     const result = await client.query(query, params);

//     console.log(`âœ… Found ${result.rows.length} record(s) in rawan_limpasan for year ${year}`);

//     if (result.rows.length === 0) {
//       return res.json([]);
//     }

//     const features = createFeatures(result.rows, 'rawan_limpasan');
//     res.json(features);

//   } catch (error) {
//     console.error('âŒ Error fetching rawan_limpasan with year:', error);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message,
//       endpoint: 'rawan_limpasan/year'
//     });
//   }
// });

// // NEW: Endpoint provinsi dengan year
// app.get('/api/layers/provinsi/year/:year', async (req, res) => {
//   try {
//     const { year } = req.params;

//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM provinsi
//       WHERE tahun_data = $1
//     `;

//     const params = [parseInt(year)];
//     let appliedFilter = `year: ${year}`;

//     // Filter by provinsi name if provided
//     if (req.query.provinsi) {
//       query += ` AND provinsi = $${params.length + 1}`;
//       params.push(req.query.provinsi);
//       appliedFilter += `, provinsi: ${req.query.provinsi}`;
//     }

//     console.log('ðŸ” Fetching provinsi with max year', year);
//     console.log('ðŸ“‹ Applied filters:', appliedFilter);
//     console.log('ðŸ“ Executing query with params:', params);

//     const result = await client.query(query, params);

//     console.log(`âœ… Found ${result.rows.length} provinsi(s) with max year ${year}`);

//     if (result.rows.length === 0) {
//       return res.json([]);
//     }

//     const features = createFeatures(result.rows, 'provinsi');
//     res.json(features);

//   } catch (error) {
//     console.error('âŒ Error fetching provinsi with year:', error);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message,
//       endpoint: 'provinsi/year'
//     });
//   }
// });

// // NEW: Endpoint das dengan year
// app.get('/api/layers/das/year/:year', async (req, res) => {
//   try {
//     const { year } = req.params;

//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM das
//       WHERE tahun_data = $1
//     `;

//     const params = [parseInt(year)];
//     let appliedFilter = `year: ${year}`;

//     // Filter by das name if provided
//     if (req.query.nama_das) {
//       query += ` AND nama_das = $${params.length + 1}`;
//       params.push(req.query.nama_das);
//       appliedFilter += `, nama_das: ${req.query.nama_das}`;
//     }

//     console.log('ðŸ” Fetching das with year', year);
//     console.log('ðŸ“‹ Applied filters:', appliedFilter);
//     console.log('ðŸ“ Executing query with params:', params);

//     const result = await client.query(query, params);

//     console.log(`âœ… Found ${result.rows.length} das(s) with year ${year}`);

//     if (result.rows.length === 0) {
//       return res.json([]);
//     }

//     const features = createFeatures(result.rows, 'das');
//     res.json(features);

//   } catch (error) {
//     console.error('âŒ Error fetching das with year:', error);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message,
//       endpoint: 'das/year'
//     });
//   }
// });

// // NEW ENDPOINTS for kab_kota and kecamatan layers
// app.get('/api/filter/kabupaten', async (req, res) => {
//   try {
//     const result = await client.query('SELECT DISTINCT kab_kota FROM kab_kota WHERE kab_kota IS NOT NULL ORDER BY kab_kota');

//     // Log first few records for debugging
//     if (result.rows.length > 0) {
//       console.log('ðŸ“ Sample kabupaten records:', result.rows.slice(0, 3));
//     }

//     // Filter out null/empty values
//     const validRows = result.rows.filter(row => row.kab_kota && row.kab_kota.trim() !== '');

//     res.json(validRows);
//   } catch (error) {
//     console.error('âŒ Error fetching kabupaten/kota:', error);
//     res.status(500).json({ error: 'Internal Server Error', details: error.message });
//   }
// });

// // UPDATED ENDPOINT: Get kecamatan data with better error handling
// app.get('/api/filter/kecamatan', async (req, res) => {
//   try {
//     const result = await client.query('SELECT DISTINCT kecamatan FROM kecamatan WHERE kecamatan IS NOT NULL ORDER BY kecamatan');

//     // Log first few records for debugging
//     if (result.rows.length > 0) {

//       // Check for null values in the results
//       const nullCount = result.rows.filter(row => !row.kecamatan || row.kecamatan.trim() === '').length;
//       if (nullCount > 0) {
//         console.warn(`âš ï¸ Found ${nullCount} null/empty kecamatan records`);
//       }
//     }

//     // Filter out null/empty values and ensure all are strings
//     const validRows = result.rows.filter(row => {
//       if (!row.kecamatan) {
//         console.warn('âš ï¸ Found null kecamatan:', row);
//         return false;
//       }
//       if (typeof row.kecamatan !== 'string') {
//         console.warn('âš ï¸ Found non-string kecamatan:', typeof row.kecamatan, row);
//         return false;
//       }
//       if (row.kecamatan.trim() === '') {
//         console.warn('âš ï¸ Found empty kecamatan:', row);
//         return false;
//       }
//       return true;
//     });

//     res.json(validRows);
//   } catch (error) {
//     console.error('âŒ Error fetching kecamatan:', error);
//     res.status(500).json({ error: 'Internal Server Error', details: error.message });
//   }
// });

// // UPDATED ENDPOINT: Get kelurahan/desa data with better error handling
// app.get('/api/filter/kelurahan', async (req, res) => {
//   try {
//     const result = await client.query('SELECT DISTINCT kel_desa FROM kel_desa WHERE kel_desa IS NOT NULL ORDER BY kel_desa');

//     // Log first few records for debugging
//     if (result.rows.length > 0) {
//       console.log('ðŸ“ Sample kelurahan records:', result.rows.slice(0, 3));
//     }

//     // Filter out null/empty values
//     const validRows = result.rows.filter(row => row.kel_desa && row.kel_desa.trim() !== '');

//     res.json(validRows);
//   } catch (error) {
//     console.error('âŒ Error fetching kelurahan:', error);
//     res.status(500).json({ error: 'Internal Server Error', details: error.message });
//   }
// });

// // NEW ENDPOINT: Risk analysis based on kejadian data
// app.get('/api/risk-analysis', async (req, res) => {
//   try {
//     const { disaster_type, level, location_name } = req.query;

//     if (!disaster_type || !level || !location_name) {
//       return res.status(400).json({
//         error: 'Missing required parameters: disaster_type, level, location_name'
//       });
//     }

//     const cacheKey = `${disaster_type}|${level}|${location_name}`;

//     // Check cache first
//     if (riskAnalysisCache.has(cacheKey)) {
//       const cachedData = riskAnalysisCache.get(cacheKey);
//       // Check if cache is still fresh (5 minutes)
//       if (Date.now() - cachedData.timestamp < 5 * 60 * 1000) {
//         return res.json(cachedData.features);
//       } else {
//         riskAnalysisCache.delete(cacheKey);
//       }
//     }

//     let kejadianQuery;
//     let layerQuery;
//     let groupByField;
//     let params = [];

//     // Build queries based on level
//     if (level === 'Indonesia') {
//       // Level Indonesia - Show provinsi with incident counts
//       groupByField = 'provinsi';

//       // Query dengan UPPER() untuk case-insensitive matching
//       kejadianQuery = `
//         SELECT UPPER(TRIM(provinsi)) as provinsi, COUNT(*) as incident_count
//         FROM kejadian
//         WHERE disaster_type = $1
//           AND provinsi IS NOT NULL
//           AND TRIM(provinsi) != ''
//           AND incident_date >= CURRENT_DATE - INTERVAL '1 year'
//         GROUP BY UPPER(TRIM(provinsi))
//       `;
//       params = [disaster_type];

//       layerQuery = `
//         SELECT UPPER(TRIM(provinsi)) as provinsi, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//         FROM provinsi
//         WHERE provinsi IS NOT NULL
//         ORDER BY provinsi
//       `;

//     } else if (level === 'Provinsi') {
//       // Show kab_kota with incident counts from the selected provinsi
//       groupByField = 'kabupaten';

//       kejadianQuery = `
//         SELECT kabupaten, COUNT(*) as incident_count
//         FROM kejadian
//         WHERE disaster_type = $1 AND provinsi = $2
//           AND incident_date >= CURRENT_DATE - INTERVAL '1 year'
//         GROUP BY kabupaten
//       `;
//       params = [disaster_type, location_name];

//       layerQuery = `
//         SELECT kab_kota, provinsi, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//         FROM kab_kota
//         WHERE provinsi = $1
//       `;

//     } else if (level === 'Kabupaten/Kota') {
//       // Show kecamatan with incident counts from the selected kab_kota
//       groupByField = 'kecamatan';

//       kejadianQuery = `
//         SELECT kecamatan, COUNT(*) as incident_count
//         FROM kejadian
//         WHERE disaster_type = $1 AND kabupaten = $2
//           AND incident_date >= CURRENT_DATE - INTERVAL '1 year'
//         GROUP BY kecamatan
//       `;
//       params = [disaster_type, location_name];

//       layerQuery = `
//         SELECT kecamatan, kab_kota, provinsi, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//         FROM kecamatan
//         WHERE kab_kota = $1
//       `;

//     } else if (level === 'Kecamatan') {
//       // Show kel_desa with incident counts from the selected kecamatan
//       groupByField = 'kelurahan';

//       kejadianQuery = `
//         SELECT kelurahan, COUNT(*) as incident_count
//         FROM kejadian
//         WHERE disaster_type = $1 AND kecamatan = $2
//           AND incident_date >= CURRENT_DATE - INTERVAL '1 year'
//         GROUP BY kelurahan
//       `;
//       params = [disaster_type, location_name];

//       layerQuery = `
//         SELECT kel_desa, kecamatan, kab_kota, provinsi, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//         FROM kel_desa
//         WHERE kecamatan = $1
//       `;

//     } else if (level === 'DAS') {
//       // Show areas within the DAS with incident counts
//       groupByField = 'kelurahan';

//       kejadianQuery = `
//         SELECT kelurahan, kecamatan, kabupaten, COUNT(*) as incident_count
//         FROM kejadian
//         WHERE disaster_type = $1 AND das = $2
//           AND incident_date >= CURRENT_DATE - INTERVAL '1 year'
//         GROUP BY kelurahan, kecamatan, kabupaten
//       `;
//       params = [disaster_type, location_name];

//       layerQuery = `
//         SELECT kel_desa, kecamatan, kab_kota, provinsi, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//         FROM kel_desa
//         WHERE kel_desa IN (
//           SELECT DISTINCT kelurahan FROM kejadian WHERE das = $1
//         )
//       `;
//     } else {
//       return res.status(400).json({ error: 'Invalid level parameter' });
//     }

//     // Execute queries
//     const layerParams = level === 'Indonesia' ? [] : [location_name];
//     const [kejadianResult, layerResult] = await Promise.all([
//       client.query(kejadianQuery, params),
//       client.query(layerQuery, layerParams)
//     ]);

//     // Create incident count map
//     const incidentMap = new Map();
//     kejadianResult.rows.forEach(row => {
//       let key;
//       if (level === 'Indonesia') {
//         // Untuk Indonesia, key adalah provinsi (sudah di-uppercase di query)
//         key = row.provinsi;
//       } else if (level === 'DAS') {
//         key = row.kelurahan;
//       } else {
//         key = row[groupByField.toLowerCase()];
//       }
//       incidentMap.set(key, parseInt(row.incident_count));
//     });

//     // Create features with risk levels
//     const features = layerResult.rows.map((row, index) => {
//       const { geometry_json, geom, ...properties } = row;

//       let geometry;
//       try {
//         geometry = JSON.parse(geometry_json);
//       } catch (e) {
//         console.error(`Error parsing geometry for row ${index}:`, e);
//         return null;
//       }

//       // Get the appropriate field name for matching
//       let matchField;
//       if (level === 'Indonesia') {
//         // Untuk Indonesia, matchField adalah provinsi (sudah di-uppercase)
//         matchField = row.provinsi;
//       } else if (level === 'Provinsi') {
//         matchField = row.kab_kota;
//       } else if (level === 'Kabupaten/Kota') {
//         matchField = row.kecamatan;
//       } else if (level === 'Kecamatan' || level === 'DAS') {
//         matchField = row.kel_desa;
//       }

//       const incidentCount = incidentMap.get(matchField) || 0;

//       console.log(`Feature matching: ${matchField} = ${incidentCount} incidents`); // Debug log

//       // Determine risk level and color
//       let riskLevel, riskColor;
//       if (incidentCount === 0) {
//         riskLevel = 'Very Low';
//         riskColor = '#62c486'; // Gray untuk no data
//       } else if (incidentCount <= 1) {
//         riskLevel = 'Low';
//         riskColor = '#22c55e'; // Green
//       } else if (incidentCount <= 5) {
//         riskLevel = 'Medium';
//         riskColor = '#f97316'; // Orange
//       } else {
//         riskLevel = 'High';
//         riskColor = '#ef4444'; // Red
//       }

//       return {
//         type: 'Feature',
//         id: index,
//         properties: {
//           ...properties,
//           incident_count: incidentCount,
//           risk_level: riskLevel,
//           risk_color: riskColor,
//           disaster_type: disaster_type,
//           analysis_level: level,
//           location_name: location_name
//         },
//         geometry: geometry
//       };
//     }).filter(feature => feature !== null);

//     riskAnalysisCache.set(cacheKey, {
//       features: features,
//       timestamp: Date.now(),
//       metadata: {
//         disaster_type,
//         level,
//         location_name,
//         total_features: features.length,
//         incident_groups: kejadianResult.rows.length
//       }
//     });

//     res.json(features);

//   } catch (error) {
//     console.error('Error in risk analysis:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// // Endpoint untuk mengambil daftar file dari folder uploads dan tabel file (hanya yang diupload via File Manager)
// app.get('/api/files', async (req, res) => {
//   try {
//     // Ambil file-file dari tabel 'file' (ini adalah file yang diupload via File Manager)
//     const dbFileQuery = 'SELECT filename, original_name, filepath, mimetype, size, upload_date FROM file ORDER BY upload_date DESC';
//     const dbFileResult = await client.query(dbFileQuery);

//     const responseList = dbFileResult.rows.map(row => ({
//       id: row.filename, // Gunakan nama file sebagai ID
//       name: row.original_name, // Gunakan nama asli untuk tampilan
//       date: row.upload_date.toISOString(), // Format ISO untuk konsistensi
//       size: row.size, // Ukuran dalam bytes
//       // Tentukan tipe file berdasarkan ekstensi dari original_name
//       type: (function() {
//         const ext = path.extname(row.original_name).toLowerCase();
//         if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) return 'img';
//         if (['.pdf'].includes(ext)) return 'pdf';
//         if (['.doc', '.docx'].includes(ext)) return 'doc';
//         if (['.xls', '.xlsx'].includes(ext)) return 'xls';
//         return 'default'; // Untuk tipe lainnya
//       })(),
//       // URL untuk akses file
//       url: row.filepath, // filepath sudah berisi /uploads/filename.ext
//     }));

//     res.json(responseList);
//   } catch (error) {
//     console.error('Error reading file database:', error);
//     res.status(500).json({ error: 'Failed to read file database' });
//   }
// });

// // Endpoint untuk menghapus file dari folder uploads dan tabel file (hanya file dari File Manager)
// app.delete('/api/files/:filename', async (req, res) => {
//   try {
//     const { filename } = req.params;
//     // Ambil filepath dari database untuk keamanan
//     const selectFileQuery = 'SELECT filepath FROM file WHERE filename = $1';
//     const selectResult = await client.query(selectFileQuery, [filename]);

//     if (selectResult.rows.length === 0) {
//       return res.status(404).json({ error: 'File entry not found in database' });
//     }

//     const filepath = selectResult.rows[0].filepath;
//     const filePathOnDisk = path.join(__dirname, filepath.substring(1)); // Hapus '/' pertama untuk path relatif

//     if (!fs.existsSync(filePathOnDisk)) {
//       console.warn(`File not found on disk: ${filePathOnDisk}, but entry exists in DB. Removing DB entry.`);
//       // Hapus entri dari database meskipun file tidak ditemukan di disk
//       const deleteFileQuery = 'DELETE FROM file WHERE filename = $1';
//       await client.query(deleteFileQuery, [filename]);
//       return res.status(200).json({ message: 'File entry removed from database. File not found on disk.' });
//     }

//     // Hapus file dari sistem
//     fs.unlinkSync(filePathOnDisk);

//     // Hapus entri file dari database
//     const deleteFileQuery = 'DELETE FROM file WHERE filename = $1';
//     await client.query(deleteFileQuery, [filename]);

//     res.status(200).json({ message: 'File deleted successfully' });
//   } catch (error) {
//     console.error('Error deleting file:', error);
//     res.status(500).json({ error: 'Failed to delete file' });
//   }
// });

// // Endpoint untuk upload file secara langsung ke folder uploads dan tabel file (hanya untuk File Manager)
// app.post('/api/files', fileManagerUpload.single('file'), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: 'No file uploaded' });
//     }

//     // Simpan informasi file ke database
//     const insertFileQuery = `
//       INSERT INTO file (filename, original_name, filepath, mimetype, size)
//       VALUES ($1, $2, $3, $4, $5)
//       RETURNING id
//     `;
//     const insertValues = [
//       req.file.filename,
//       req.file.originalname,
//       `/uploads/${req.file.filename}`, // Simpan path relatif
//       req.file.mimetype,
//       req.file.size
//     ];

//     await client.query(insertFileQuery, insertValues);

//     res.status(201).json({
//       success: true,
//       message: 'File uploaded and registered successfully via File Manager',
//       filename: req.file.filename,
//       originalName: req.file.originalname,
//       url: `/uploads/${req.file.filename}`
//     });
//   } catch (error) {
//     console.error('Error uploading file via File Manager:', error);
//     // Hapus file dari disk jika insert ke DB gagal
//     if (req.file && fs.existsSync(path.join(uploadDir, req.file.filename))) {
//         fs.unlinkSync(path.join(uploadDir, req.file.filename));
//     }
//     res.status(500).json({ error: 'Failed to upload file or register in database via File Manager' });
//   }
// });

// // TAMBAHAN: Cleanup expired cache entries every 10 minutes
// setInterval(() => {
//   const now = Date.now();
//   const expiredKeys = [];
//   for (let [key, value] of riskAnalysisCache.entries()) {
//     if (now - value.timestamp > 5 * 60 * 1000) { // 5 minutes
//       expiredKeys.push(key);
//     }
//   }
//   expiredKeys.forEach(key => riskAnalysisCache.delete(key));
//   if (expiredKeys.length > 0) {
//     console.log(`Cleaned up ${expiredKeys.length} expired cache entries. Current cache size: ${riskAnalysisCache.size}`);
//   }
// }, 10 * 60 * 1000);

// // Error handler untuk kedua konfigurasi multer
app.use((error, req, res, next) => {
  // JSON body malformed harus menjadi 400 yang terkontrol, bukan stack trace
  // berulang di log. Ini tidak mengubah endpoint yang valid.
  if (
    error instanceof SyntaxError &&
    error.status === 400 &&
    error.type === "entity.parse.failed"
  ) {
    console.error("Invalid JSON request body:", {
      method: req.method,
      url: req.originalUrl,
      message: error.message,
    });

    return res.status(400).json({
      success: false,
      error: "Invalid JSON request body",
      message: "Body request harus berupa JSON yang valid.",
    });
  }

  if (error instanceof multer.MulterError) {
    console.error("Multer error:", error);

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "File terlalu besar. Maksimal ukuran file adalah 5GB",
        code: "FILE_TOO_LARGE",
      });
    }

    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        error: "Terlalu banyak file. Maksimal 20 file",
        code: "TOO_MANY_FILES",
      });
    }

    return res.status(400).json({
      error: error.message,
      code: error.code,
    });
  }

  next(error);
});

// // Generic endpoint untuk mitigation layers - tambahkan setelah endpoint layer yang sudah ada
// app.get('/api/layers/:tableName', async (req, res) => {
//   try {
//     const { tableName } = req.params;

//     console.log('='.repeat(80));
//     console.log('ðŸ“¥ GET Generic Layer Request');
//     console.log('='.repeat(80));
//     console.log('ðŸ“‹ Table:', tableName);
//     console.log('ðŸ” Query params:', req.query);
//     console.log('='.repeat(80));

//     // STEP 1: Validasi table name untuk keamanan - cek apakah tabel benar-benar ada di database
//     const tableCheckQuery = `
//       SELECT table_name
//       FROM information_schema.tables
//       WHERE table_schema = DATABASE()
//         AND table_name = $1
//         AND table_type = 'BASE TABLE'
//         AND table_name NOT IN ('file', 'kejadian', 'spatial_ref_sys')
//         AND table_name NOT LIKE 'pg_%'
//         AND table_name NOT LIKE 'sql_%'
//     `;

//     console.log('ðŸ” Validating table existence...');
//     const tableCheck = await client.query(tableCheckQuery, [tableName]);

//     if (tableCheck.rows.length === 0) {
//       console.error('âŒ Table not found or not accessible:', tableName);
//       console.log('='.repeat(80));
//       return res.status(404).json({
//         error: 'Table not found',
//         message: `Table '${tableName}' does not exist or is not accessible`
//       });
//     }

//     console.log('âœ… Table validation passed:', tableName);

//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM ${tableName}
//     `;

//     const params = [];
//     let appliedFilter = 'none';

//     // Apply filters based on request and REFERENCE_MAPPING
//     if (req.query.filterType === 'province' && req.query.provinceName) {

//       let filterValue = null;
//       let columnName = null;

//       // Gunakan REFERENCE_MAPPING yang sudah ada
//       if (tableName === 'lahan_kritis') {
//         if (REFERENCE_MAPPING.lahan_kritis?.provinsi_to_bpdas) {
//           filterValue = REFERENCE_MAPPING.lahan_kritis.provinsi_to_bpdas[req.query.provinceName];
//           columnName = 'bpdas';
//         }
//       } else if (tableName === 'penutupan_lahan_2024') {
//         // Direct lookup kode_prov dari tabel provinsi
//         try {
//           const provinceCodeQuery = await client.query('SELECT kode_prov FROM provinsi WHERE provinsi = $1', [req.query.provinceName]);
//           if (provinceCodeQuery.rows.length > 0) {
//             filterValue = provinceCodeQuery.rows[0].kode_prov;
//             columnName = 'kode_prov';
//           }
//         } catch (provinceError) {
//           console.error('Error looking up province code:', provinceError);
//         }
//       } else if (tableName === 'rawan_erosi') {
//         if (REFERENCE_MAPPING.rawan_erosi?.provinsi_to_n_bpdas) {
//           filterValue = REFERENCE_MAPPING.rawan_erosi.provinsi_to_n_bpdas[req.query.provinceName];
//           columnName = 'n_bpdas';
//         }
//       } else if (tableName === 'rawan_karhutla_2024') {
//         if (REFERENCE_MAPPING.rawan_karhutla_2024?.provinsi_direct) {
//           filterValue = REFERENCE_MAPPING.rawan_karhutla_2024.provinsi_direct[req.query.provinceName];
//           columnName = 'provinsi';
//         }
//       } else if (tableName === 'rawan_limpasan') {
//         if (REFERENCE_MAPPING.rawan_limpasan?.provinsi_to_wil_kerja) {
//           filterValue = REFERENCE_MAPPING.rawan_limpasan.provinsi_to_wil_kerja[req.query.provinceName];
//           columnName = 'wil_kerja';
//         }
//       } else if (tableName === 'areal_karhutla_2024') {
//         // Untuk areal_karhutla_2024, bisa menggunakan mapping yang sama dengan rawan_karhutla_2024
//         if (REFERENCE_MAPPING.rawan_karhutla_2024?.provinsi_direct) {
//           filterValue = REFERENCE_MAPPING.rawan_karhutla_2024.provinsi_direct[req.query.provinceName];
//           columnName = 'provinsi';
//         }
//       }

//       if (filterValue && columnName) {
//         query += buildWhereClause(columnName, filterValue, params);
//         appliedFilter = `province: ${req.query.provinceName} -> ${columnName}: ${JSON.stringify(filterValue)}`;
//       } else {
//         return res.json([]); // Return empty if no mapping
//       }
//     }

//     if (req.query.filterType === 'das' && req.query.dasName) {

//       let filterValue = null;
//       let columnName = null;

//       // Gunakan REFERENCE_MAPPING yang sudah ada
//       if (tableName === 'lahan_kritis') {
//         if (REFERENCE_MAPPING.lahan_kritis?.das_to_bpdas) {
//           filterValue = REFERENCE_MAPPING.lahan_kritis.das_to_bpdas[req.query.dasName];
//           columnName = 'bpdas';
//         }
//       } else if (tableName === 'penutupan_lahan_2024') {
//         if (REFERENCE_MAPPING.penutupan_lahan_2024?.das_to_kode_prov) {
//           filterValue = REFERENCE_MAPPING.penutupan_lahan_2024.das_to_kode_prov[req.query.dasName];
//           columnName = 'kode_prov';
//         }
//       } else if (tableName === 'rawan_erosi') {
//         if (REFERENCE_MAPPING.rawan_erosi?.das_to_n_bpdas) {
//           filterValue = REFERENCE_MAPPING.rawan_erosi.das_to_n_bpdas[req.query.dasName];
//           columnName = 'n_bpdas';
//         }
//       } else if (tableName === 'rawan_karhutla_2024') {
//         if (REFERENCE_MAPPING.rawan_karhutla_2024?.das_to_provinsi) {
//           filterValue = REFERENCE_MAPPING.rawan_karhutla_2024.das_to_provinsi[req.query.dasName];
//           columnName = 'provinsi';
//         }
//       } else if (tableName === 'rawan_limpasan') {
//         if (REFERENCE_MAPPING.rawan_limpasan?.das_to_wil_kerja) {
//           filterValue = REFERENCE_MAPPING.rawan_limpasan.das_to_wil_kerja[req.query.dasName];
//           columnName = 'wil_kerja';
//         }
//       } else if (tableName === 'areal_karhutla_2024') {
//         // Untuk areal_karhutla_2024, bisa menggunakan mapping yang sama dengan rawan_karhutla_2024
//         if (REFERENCE_MAPPING.rawan_karhutla_2024?.das_to_provinsi) {
//           filterValue = REFERENCE_MAPPING.rawan_karhutla_2024.das_to_provinsi[req.query.dasName];
//           columnName = 'provinsi';
//         }
//       }

//       if (filterValue && columnName) {
//         query += buildWhereClause(columnName, filterValue, params);
//         appliedFilter = `das: ${req.query.dasName} -> ${columnName}: ${JSON.stringify(filterValue)}`;
//       } else {
//         return res.json([]); // Return empty if no mapping
//       }
//     }

//     query += ' LIMIT 1000';

//     const result = await client.query(query, params);

//     if (result.rows.length === 0) {
//       return res.json([]);
//     }

//     const features = createFeatures(result.rows, tableName);

//     res.json(features);
//   } catch (error) {
//     console.error(`Error fetching ${req.params.tableName}:`, error);
//     console.error('Error stack:', error.stack);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message,
//       endpoint: req.params.tableName
//     });
//   }
// });

// // Endpoint untuk mendapatkan informasi semua tabel dengan tahun dari column tahun_data
// app.get('/api/tables-info', async (req, res) => {
//   try {
//     const tablesQuery = `
//       SELECT
//         t.table_name,
//         pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name)::regclass)) as ukuran,
//         pg_total_relation_size(quote_ident(t.table_name)::regclass) as ukuran_bytes
//       FROM information_schema.tables t
//       WHERE t.table_schema = DATABASE()
//         AND t.table_type = 'BASE TABLE'
//         AND t.table_name NOT IN ('file', 'kejadian', 'spatial_ref_sys')
//         AND t.table_name NOT LIKE 'pg_%'
//         AND t.table_name NOT LIKE 'sql_%'
//       ORDER BY t.table_name ASC
//     `;

//     const tablesResult = await client.query(tablesQuery);

//     // Untuk setiap tabel, dapatkan jumlah row dan tahun_data yang tersedia
//     const tablesInfo = await Promise.all(
//       tablesResult.rows.map(async (table) => {
//         try {
//           // Query untuk menghitung jumlah row
//           const countQuery = `SELECT COUNT(*) as jumlah_row FROM ${table.table_name}`;
//           const countResult = await client.query(countQuery);

//           // Query untuk mendapatkan tahun_data yang unik (jika column ada)
//           let tahunTersedia = [];
//           try {
//             const tahunQuery = `
//               SELECT DISTINCT tahun_data
//               FROM ${table.table_name}
//               WHERE tahun_data IS NOT NULL
//               ORDER BY tahun_data ASC
//             `;
//             const tahunResult = await client.query(tahunQuery);
//             tahunTersedia = tahunResult.rows.map(row => parseInt(row.tahun_data));
//           } catch (tahunError) {
//             // Jika column tahun_data tidak ada, gunakan default
//             console.warn(`Table ${table.table_name} does not have tahun_data column`);
//             tahunTersedia = []; // Fallback
//           }

//           return {
//             nama_table: table.table_name,
//             ukuran: table.ukuran,
//             jumlah_row: parseInt(countResult.rows[0].jumlah_row),
//             tahun_tersedia: tahunTersedia
//           };
//         } catch (error) {
//           console.error(`Error processing table ${table.table_name}:`, error);
//           return {
//             nama_table: table.table_name,
//             ukuran: table.ukuran,
//             jumlah_row: 0,
//             tahun_tersedia: []
//           };
//         }
//       })
//     );

//     res.json(tablesInfo);

//   } catch (error) {
//     console.error('Error fetching tables info:', error);
//     res.status(500).json({
//       error: 'Failed to fetch tables information',
//       message: error.message
//     });
//   }
// });

// // NEW ENDPOINT: Get layer data by table name and year
// app.get('/api/shp-layers/:tableName/year/:year', async (req, res) => {
//   try {
//     const { tableName, year } = req.params;

//     console.log('ðŸ“¥ GET Layer by year request:', { tableName, year });

//     // STEP 1: Validasi table name untuk keamanan - cek apakah tabel benar-benar ada di database
//     const tableCheckQuery = `
//       SELECT table_name
//       FROM information_schema.tables
//       WHERE table_schema = DATABASE()
//         AND table_name = $1
//         AND table_type = 'BASE TABLE'
//         AND table_name NOT IN ('file', 'kejadian', 'spatial_ref_sys')
//         AND table_name NOT LIKE 'pg_%'
//         AND table_name NOT LIKE 'sql_%'
//     `;

//     const tableCheck = await client.query(tableCheckQuery, [tableName]);

//     if (tableCheck.rows.length === 0) {
//       console.error('âŒ Table not found or not accessible:', tableName);
//       return res.status(404).json({
//         error: 'Table not found',
//         message: `Table '${tableName}' does not exist or is not accessible`
//       });
//     }

//     console.log('âœ… Table validation passed:', tableName);

//     let query = `
//       SELECT
//         *, ST_AsGeoJSON(ST_Transform(geom, 4326)) as geometry_json
//       FROM ${tableName}
//     `;

//     const params = [];

//     // Filter berdasarkan tahun_data jika column ada
//     try {
//       const checkColumnQuery = `
//         SELECT column_name
//         FROM information_schema.columns
//         WHERE table_name = $1 AND column_name = 'tahun_data'
//       `;
//       const columnCheck = await client.query(checkColumnQuery, [tableName]);

//       if (columnCheck.rows.length > 0) {
//         query += ` WHERE tahun_data = $1`;
//         params.push(parseInt(year));
//       }
//     } catch (checkError) {
//       console.warn(`Could not check for tahun_data column in ${tableName}`);
//     }

//     // Apply additional filters if provided
//     if (req.query.filterType && req.query.filterName) {
//       const filterConnector = params.length > 0 ? 'AND' : 'WHERE';

//       if (req.query.filterType === 'province') {
//         query += ` ${filterConnector} provinsi = $${params.length + 1}`;
//         params.push(req.query.filterName);
//       } else if (req.query.filterType === 'das') {
//         query += ` ${filterConnector} das = $${params.length + 1}`;
//         params.push(req.query.filterName);
//       }
//     }

//     query += ' LIMIT 1000';

//     const result = await client.query(query, params);

//     if (result.rows.length === 0) {
//       return res.json([]);
//     }

//     const features = createFeatures(result.rows, tableName);

//     res.json(features);
//   } catch (error) {
//     console.error(`Error fetching ${req.params.tableName} for year ${req.params.year}:`, error);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message
//     });
//   }
// });

// // ================= ENDPOINT BARU #6 ================
// // app.get('/api/layers/:tableName/year/:year', async (req, res) => {
// //   const { tableName, year } = req.params;
// //   const { bbox, filterType, provinceName, dasName } = req.query;

// //   try {
// //     console.log(`ðŸ” Fetching layer ${tableName} for year ${year}`);

// //     let query = `
// //       SELECT
// //         id,
// //         ST_AsGeoJSON(geom) as geometry,
// //         *
// //       FROM ${tableName}
// //       WHERE tahun_data = $1
// //     `;

// //     const params = [year];

// //     // Gunakan reference_mapping untuk filter provinsi
// //     if (filterType === 'province' && provinceName) {
// //       const mappingQuery = `
// //         SELECT target_value
// //         FROM reference_mapping
// //         WHERE target_table = $1
// //           AND target_column = 'provinsi'
// //           AND UPPER(source_value) = UPPER($2)
// //       `;
// //       const mappingResult = await client.query(mappingQuery, [tableName, provinceName]);

// //       if (mappingResult.rows.length > 0) {
// //         const targetValue = mappingResult.rows[0].target_value;
// //         params.push(targetValue);
// //         query += ` AND UPPER(provinsi) = UPPER($${params.length})`;
// //       } else {
// //         params.push(provinceName);
// //         query += ` AND UPPER(provinsi) = UPPER($${params.length})`;
// //       }
// //     }

// //     // Gunakan reference_mapping untuk filter das
// //     if (filterType === 'das' && dasName) {
// //       const mappingQuery = `
// //         SELECT target_value
// //         FROM reference_mapping
// //         WHERE target_table = $1
// //           AND target_column = 'nama_das'
// //           AND UPPER(source_value) = UPPER($2)
// //       `;
// //       const mappingResult = await client.query(mappingQuery, [tableName, dasName]);

// //       if (mappingResult.rows.length > 0) {
// //         const targetValue = mappingResult.rows[0].target_value;
// //         params.push(targetValue);
// //         query += ` AND UPPER(nama_das) = UPPER($${params.length})`;
// //       } else {
// //         params.push(dasName);
// //         query += ` AND UPPER(nama_das) = UPPER($${params.length})`;
// //       }
// //     }

// //     if (bbox) {
// //       const [minX, minY, maxX, maxY] = bbox.split(',').map(Number);
// //       params.push(minX, minY, maxX, maxY);
// //       query += ` AND ST_Intersects(geom, ST_MakeEnvelope($${params.length-3}, $${params.length-2}, $${params.length-1}, $${params.length}, 4326))`;
// //     }

// //     const result = await client.query(query, params);

// //     const features = result.rows.map(row => ({
// //       type: 'Feature',
// //       geometry: JSON.parse(row.geometry),
// //       properties: Object.keys(row)
// //         .filter(key => key !== 'geometry' && key !== 'geom')
// //         .reduce((obj, key) => {
// //           obj[key] = row[key];
// //           return obj;
// //         }, {})
// //     }));

// //     console.log(`âœ… Found ${features.length} features in ${tableName} for year ${year}`);

// //     res.json({
// //       type: 'FeatureCollection',
// //       features: features,
// //       metadata: {
// //         table: tableName,
// //         year: parseInt(year),
// //         count: features.length
// //       }
// //     });
// //   } catch (error) {
// //     console.error(`âŒ Error fetching layer ${tableName}:`, error);
// //     res.status(500).json({ error: error.message });
// //   }
// // });

// // app.get('/api/layers/:tableName/year/:year', async (req, res) => {
// //   const { tableName, year } = req.params;
// //   const { filterType, provinceName, dasName } = req.query;

// //   console.log(`ðŸ” Fetching layer ${tableName} for year ${year}`);

// //   try {
// //     // âœ… FIX 1: Parse year ke INTEGER
// //     const yearInt = parseInt(year, 10);
// //     if (isNaN(yearInt)) {
// //       return res.status(400).json({ error: 'Invalid year parameter' });
// //     }

// //     // --- Ambil daftar kolom tabel ---
// //     const columnsRes = await client.query(`
// //       SELECT column_name
// //       FROM information_schema.columns
// //       WHERE table_name = $1
// //     `, [tableName]);
// //     const columns = columnsRes.rows.map(r => r.column_name.toLowerCase());

// //     // Check if tahun_data exists
// //     if (!columns.includes('tahun_data')) {
// //       console.warn(`âš ï¸ Table ${tableName} does not have tahun_data column`);
// //       return res.status(400).json({
// //         error: `Table ${tableName} does not have tahun_data column`
// //       });
// //     }

// //     // --- Deteksi kolom ID dan Nama ---
// //     const idColumn = columns.includes('gid') ? 'gid' :
// //                      columns.includes('fid') ? 'fid' : 'id';

// //     const nameColumn = await resolveNameColumn(tableName);

// //     // âœ… FIX 2: Query dengan INTEGER comparison
// //     let query = `
// //       SELECT
// //         ${idColumn} AS id,
// //         ${nameColumn} AS name,
// //         tahun_data,
// //         ST_AsGeoJSON(geom) AS geometry
// //       FROM ${tableName}
// //       WHERE tahun_data = $1
// //         AND geom IS NOT NULL
// //     `;

// //     const params = [yearInt];  // âœ… Use integer, not string

// //     // --- Filter provinsi (jika ada) ---
// //     if (filterType === 'province' && provinceName) {
// //       // Check if provinsi column exists
// //       if (!columns.includes('provinsi')) {
// //         console.warn(`âš ï¸ Table ${tableName} does not have provinsi column`);
// //       } else {
// //         let mappedName = provinceName;

// //         // Try to map province name
// //         try {
// //           const mappingQuery = `
// //             SELECT target_value
// //             FROM reference_mapping
// //             WHERE target_table = $1
// //               AND target_column = 'provinsi'
// //               AND UPPER(source_value) = UPPER($2)
// //           `;
// //           const mappingResult = await client.query(mappingQuery, [tableName, provinceName]);

// //           if (mappingResult.rows.length > 0) {
// //             mappedName = mappingResult.rows[0].target_value;
// //             console.log(`ðŸ“ Mapped province: ${provinceName} â†’ ${mappedName}`);
// //           }
// //         } catch (err) {
// //           console.warn('âš ï¸ Province mapping lookup failed, using original name');
// //         }

// //         params.push(mappedName);
// //         query += ` AND UPPER(provinsi) = UPPER($${params.length})`;
// //       }
// //     }

// //     // --- Filter DAS (jika ada) ---
// //     if (filterType === 'das' && dasName) {
// //       if (!columns.includes('nama_das')) {
// //         console.warn(`âš ï¸ Table ${tableName} does not have nama_das column`);
// //       } else {
// //         let mappedName = dasName;

// //         // Try to map DAS name
// //         try {
// //           const mappingQuery = `
// //             SELECT target_value
// //             FROM reference_mapping
// //             WHERE target_table = $1
// //               AND target_column = 'nama_das'
// //               AND UPPER(source_value) = UPPER($2)
// //           `;
// //           const mappingResult = await client.query(mappingQuery, [tableName, dasName]);

// //           if (mappingResult.rows.length > 0) {
// //             mappedName = mappingResult.rows[0].target_value;
// //             console.log(`ðŸ“ Mapped DAS: ${dasName} â†’ ${mappedName}`);
// //           }
// //         } catch (err) {
// //           console.warn('âš ï¸ DAS mapping lookup failed, using original name');
// //         }

// //         params.push(mappedName);
// //         query += ` AND UPPER(nama_das) = UPPER($${params.length})`;
// //       }
// //     }

// //     query += ` ORDER BY ${nameColumn}`;

// //     console.log('ðŸ“ Executing query with params:', params);
// //     let result = await client.query(query, params);
// //     let rows = result.rows;

// //     // --- Jika kosong, coba fallback ke tahun terdekat ---
// //     if (!rows || rows.length === 0) {
// //       console.log(`âš ï¸ No records found for ${tableName} in year ${yearInt}, trying closest lower year`);

// //       const fallbackRes = await client.query(
// //         `SELECT DISTINCT tahun_data
// //          FROM ${tableName}
// //          WHERE tahun_data < $1
// //            AND geom IS NOT NULL
// //          ORDER BY tahun_data DESC
// //          LIMIT 1`,
// //         [yearInt]
// //       );

// //       if (fallbackRes.rows.length > 0) {
// //         const fallbackYear = fallbackRes.rows[0].tahun_data;
// //         console.log(`â†©ï¸ Using fallback year ${fallbackYear} for ${tableName}`);

// //         // Re-run query with fallback year
// //         const fallbackParams = [fallbackYear];
// //         let fallbackQuery = `
// //           SELECT
// //             ${idColumn} AS id,
// //             ${nameColumn} AS name,
// //             tahun_data,
// //             ST_AsGeoJSON(geom) AS geometry
// //           FROM ${tableName}
// //           WHERE tahun_data = $1
// //             AND geom IS NOT NULL
// //         `;

// //         // Add filters again if needed
// //         if (filterType === 'province' && provinceName && columns.includes('provinsi')) {
// //           fallbackParams.push(provinceName);
// //           fallbackQuery += ` AND UPPER(provinsi) = UPPER($${fallbackParams.length})`;
// //         }

// //         if (filterType === 'das' && dasName && columns.includes('nama_das')) {
// //           fallbackParams.push(dasName);
// //           fallbackQuery += ` AND UPPER(nama_das) = UPPER($${fallbackParams.length})`;
// //         }

// //         fallbackQuery += ` ORDER BY ${nameColumn}`;

// //         const fallbackResult = await client.query(fallbackQuery, fallbackParams);
// //         rows = fallbackResult.rows;
// //         console.log(`âœ… Found ${rows.length} fallback record(s) in ${tableName} for year ${fallbackYear}`);
// //       } else {
// //         console.log(`âš ï¸ No fallback year found for ${tableName}`);
// //       }
// //     } else {
// //       console.log(`âœ… Found ${rows.length} record(s) in ${tableName} for year ${yearInt}`);
// //     }

// //     // --- Transform to GeoJSON features ---
// //     const features = rows.map(row => ({
// //       type: 'Feature',
// //       geometry: JSON.parse(row.geometry),
// //       properties: {
// //         id: row.id,
// //         name: row.name,
// //         tahun_data: row.tahun_data
// //       }
// //     }));

// //     // --- Return GeoJSON FeatureCollection ---
// //     res.json({
// //       type: 'FeatureCollection',
// //       features: features,
// //       metadata: {
// //         table: tableName,
// //         year: yearInt,
// //         count: features.length
// //       }
// //     });

// //   } catch (error) {
// //     console.error(`âŒ Error fetching layer ${tableName}:`, error);
// //     res.status(500).json({
// //       error: error.message,
// //       table: tableName,
// //       year: year
// //     });
// //   }
// // });

// const shapefile = require('shapefile');
// const simplify = require('simplify-js');
// const turf = require('@turf/turf');
// const dbfParser = require('dbf-parser');

// // Helper function to get all coordinates from geometry
// function getAllCoordinates(geometry) {
//   let coords = [];

//   if (geometry.type === 'Point') {
//     coords = [geometry.coordinates];
//   } else if (geometry.type === 'LineString') {
//     coords = geometry.coordinates;
//   } else if (geometry.type === 'Polygon') {
//     geometry.coordinates.forEach(ring => {
//       coords = coords.concat(ring);
//     });
//   } else if (geometry.type === 'MultiPoint') {
//     coords = geometry.coordinates;
//   } else if (geometry.type === 'MultiLineString') {
//     geometry.coordinates.forEach(line => {
//       coords = coords.concat(line);
//     });
//   } else if (geometry.type === 'MultiPolygon') {
//     geometry.coordinates.forEach(polygon => {
//       polygon.forEach(ring => {
//         coords = coords.concat(ring);
//       });
//     });
//   }

//   return coords;
// }

// function calculateReductionPercentage(originalPoints, simplifiedPoints) {
//   if (originalPoints === 0) return 0;
//   return ((originalPoints - simplifiedPoints) / originalPoints) * 100;
// }

// // âœ… FUNGSI BARU 2: Apply Douglas-Peucker dengan tolerance
// function applyDouglasPeucker(geometry, tolerance, preventRemoval) {
//   if (!geometry || !geometry.type) return geometry;

//   if (geometry.type === 'Point') {
//     return geometry;
//   }

//   if (geometry.type === 'LineString') {
//     const points = geometry.coordinates.map(c => ({ x: c[0], y: c[1] }));
//     const simplified = simplify(points, tolerance, true);

//     if (preventRemoval && simplified.length < 3) {
//       return geometry;
//     }

//     return {
//       type: 'LineString',
//       coordinates: simplified.map(p => [p.x, p.y])
//     };
//   }

//   if (geometry.type === 'Polygon') {
//     const simplifiedRings = geometry.coordinates.map((ring) => {
//       const points = ring.map(c => ({ x: c[0], y: c[1] }));
//       const simplified = simplify(points, tolerance, true);

//       if (preventRemoval && simplified.length < 4) {
//         return ring;
//       }

//       const coords = simplified.map(p => [p.x, p.y]);

//       // Ensure ring is closed
//       if (coords.length > 0 &&
//           (coords[0][0] !== coords[coords.length-1][0] ||
//            coords[0][1] !== coords[coords.length-1][1])) {
//         coords.push(coords[0]);
//       }

//       if (coords.length < 4) {
//         return ring;
//       }

//       return coords;
//     });

//     return {
//       type: 'Polygon',
//       coordinates: simplifiedRings
//     };
//   }

//   if (geometry.type === 'MultiPolygon') {
//     const simplifiedPolygons = geometry.coordinates.map((polygon) => {
//       return polygon.map((ring) => {
//         const points = ring.map(c => ({ x: c[0], y: c[1] }));
//         const simplified = simplify(points, tolerance, true);

//         if (preventRemoval && simplified.length < 4) {
//           return ring;
//         }

//         const coords = simplified.map(p => [p.x, p.y]);

//         if (coords.length > 0 &&
//             (coords[0][0] !== coords[coords.length-1][0] ||
//              coords[0][1] !== coords[coords.length-1][1])) {
//           coords.push(coords[0]);
//         }

//         if (coords.length < 4) {
//           return ring;
//         }

//         return coords;
//       });
//     });

//     return {
//       type: 'MultiPolygon',
//       coordinates: simplifiedPolygons
//     };
//   }

//   return geometry;
// }

// // âœ… FUNGSI BARU 3: Simplify dengan target persentase (BINARY SEARCH)
// function simplifyDouglasPeuckerWithTargetPercentage(geometry, targetPercentage, preventRemoval) {
//   try {
//     if (!geometry || !geometry.type) {
//       console.warn('Invalid geometry for Douglas-Peucker');
//       return geometry;
//     }

//     if (geometry.type === 'Point') {
//       return geometry;
//     }

//     const originalCoords = getAllCoordinates(geometry);
//     const originalPoints = originalCoords.length;

//     // Hitung target jumlah points
//     const reductionFraction = targetPercentage / 100;
//     const targetPoints = Math.ceil(originalPoints * (1 - reductionFraction));

//     // Binary search untuk tolerance yang tepat
//     let toleranceLow = 0.0001;
//     let toleranceHigh = 1.0;
//     let bestTolerance = toleranceLow;
//     let bestGeometry = geometry;
//     let iterations = 0;
//     const maxIterations = 20;

//     while (iterations < maxIterations && (toleranceHigh - toleranceLow) > 0.00001) {
//       iterations++;
//       const toleranceMid = (toleranceLow + toleranceHigh) / 2;

//       const testGeometry = applyDouglasPeucker(geometry, toleranceMid, preventRemoval);
//       const testCoords = getAllCoordinates(testGeometry);
//       const testPoints = testCoords.length;

//       if (testPoints < targetPoints) {
//         toleranceHigh = toleranceMid;
//       } else if (testPoints > targetPoints) {
//         toleranceLow = toleranceMid;
//         bestTolerance = toleranceMid;
//         bestGeometry = testGeometry;
//       } else {
//         bestTolerance = toleranceMid;
//         bestGeometry = testGeometry;
//         break;
//       }
//     }

//     const finalCoords = getAllCoordinates(bestGeometry);
//     const finalPoints = finalCoords.length;
//     const actualReduction = calculateReductionPercentage(originalPoints, finalPoints);

//     // Jika hasil melebihi target dan preventRemoval aktif
//     if (actualReduction > targetPercentage && preventRemoval) {
//       return geometry;
//     }

//     return bestGeometry;

//   } catch (error) {
//     console.error('Error in Douglas-Peucker with target percentage:', error);
//     return geometry;
//   }
// }

// // Helper function: Visvalingam simplification (using turf)
// function simplifyVisvalingam(geometry, tolerance, preventRemoval) {
//   try {
//     // Use turf.js for Visvalingam simplification
//     const feature = turf.feature(geometry);
//     const simplified = turf.simplify(feature, {
//       tolerance: tolerance,
//       highQuality: true,
//       mutate: false
//     });

//     if (preventRemoval) {
//       const originalCoords = getAllCoordinates(geometry);
//       const simplifiedCoords = getAllCoordinates(simplified.geometry);

//       // If too much simplification, return original
//       if (simplifiedCoords.length < originalCoords.length * 0.1) {
//         return geometry;
//       }
//     }

//     return simplified.geometry;
//   } catch (error) {
//     console.error('Error in Visvalingam:', error);
//     return geometry;
//   }
// }

// app.post('/api/shp/simplify', multer({
//   storage: multer.diskStorage({
//     destination: uploadDir,
//     filename: (req, file, cb) => {
//       cb(null, Date.now() + '-' + file.originalname);
//     }
//   })
// }).array('shpFiles'), async (req, res) => {
//   let uploadedFilePaths = [];

//   try {
//     const { method, percentage, preventShapeRemoval } = req.body;
//     const files = req.files;

//     console.log('ðŸ”„ Simplification request:', {
//       method,
//       percentage: `${percentage}%`,
//       preventShapeRemoval,
//       filesReceived: files?.length || 0
//     });

//     if (!files || files.length === 0) {
//       return res.status(400).json({ error: 'No files uploaded' });
//     }

//     uploadedFilePaths = files.map(f => f.path);

//     const shpFile = files.find(f => f.originalname.toLowerCase().endsWith('.shp'));
//     const dbfFile = files.find(f => f.originalname.toLowerCase().endsWith('.dbf'));

//     if (!shpFile) {
//       return res.status(400).json({ error: 'No .shp file found' });
//     }

//     console.log('ðŸ“‚ Processing files:', {
//       shp: shpFile.filename,
//       dbf: dbfFile?.filename || 'none'
//     });

//     const targetPercentage = parseFloat(percentage); // âœ… Gunakan langsung sebagai target persentase
//     const statistics = [];

//     const source = dbfFile
//       ? await shapefile.open(shpFile.path, dbfFile.path)
//       : await shapefile.open(shpFile.path);

//     let result = await source.read();
//     let featureIndex = 0;

//     console.log('ðŸ“– Reading and simplifying features...');
//     console.log(`ðŸŽ¯ Target simplification: ${targetPercentage}% maximum reduction per feature`);

//     while (!result.done) {
//       const feature = result.value;

//       if (feature && feature.geometry) {
//         const originalCoords = getAllCoordinates(feature.geometry);
//         const originalPoints = originalCoords.length;

//         let simplifiedGeometry;

//         // âœ… GUNAKAN FUNGSI BARU dengan target persentase
//         if (method === 'douglas-peucker') {
//           simplifiedGeometry = simplifyDouglasPeuckerWithTargetPercentage(
//             feature.geometry,
//             targetPercentage,
//             preventShapeRemoval === 'true'
//           );
//         } else if (method === 'visvalingam-effective' || method === 'visvalingam-weighted') {
//           // TODO: Implement Visvalingam dengan target persentase
//           simplifiedGeometry = simplifyVisvalingam(
//             feature.geometry,
//             (100 - targetPercentage) / 1000,
//             preventShapeRemoval === 'true'
//           );
//         } else {
//           simplifiedGeometry = feature.geometry;
//         }

//         const simplifiedCoords = getAllCoordinates(simplifiedGeometry);
//         const simplifiedPoints = simplifiedCoords.length;
//         const actualReduction = calculateReductionPercentage(originalPoints, simplifiedPoints);

//         const featureName = feature.properties
//           ? (feature.properties.name || feature.properties.PROVINSI || feature.properties.nama ||
//              feature.properties.NAMOBJ || feature.properties.kab_kota || feature.properties.kecamatan ||
//              `Feature ${featureIndex + 1}`)
//           : `Feature ${featureIndex + 1}`;

//         statistics.push({
//           feature_name: featureName,
//           original_points: originalPoints,
//           simplified_points: simplifiedPoints,
//           reduction: actualReduction.toFixed(1) + '%',
//           target_percentage: targetPercentage + '%',
//           within_target: actualReduction <= targetPercentage
//         });

//         if (featureIndex % 10 === 0) {
//           console.log(`âœ… Processed ${featureIndex + 1} features...`);
//         }
//       }

//       result = await source.read();
//       featureIndex++;
//     }

//     console.log(`âœ… Simplification completed: ${statistics.length} features processed`);

//     // Summary statistics
//     const totalOriginal = statistics.reduce((sum, s) => sum + s.original_points, 0);
//     const totalSimplified = statistics.reduce((sum, s) => sum + s.simplified_points, 0);
//     const overallReduction = calculateReductionPercentage(totalOriginal, totalSimplified);
//     const withinTargetCount = statistics.filter(s => s.within_target).length;

//     console.log(`ðŸ“Š Summary:`);
//     console.log(`   - Total original points: ${totalOriginal}`);
//     console.log(`   - Total simplified points: ${totalSimplified}`);
//     console.log(`   - Overall reduction: ${overallReduction.toFixed(1)}%`);
//     console.log(`   - Features within target: ${withinTargetCount}/${statistics.length}`);

//     // âœ… PENTING: Store simplified data information untuk tracking
//     const tempId = Date.now().toString();
//     const tempData = {
//       method,
//       percentage: targetPercentage,
//       preventShapeRemoval,
//       statistics,
//       originalFiles: files.map(f => f.filename),
//       targetPercentage,  // Tambahkan untuk clarity
//       summary: {
//         totalOriginalPoints: totalOriginal,
//         totalSimplifiedPoints: totalSimplified,
//         overallReduction: overallReduction.toFixed(1) + '%',
//         featuresWithinTarget: withinTargetCount,
//         totalFeatures: statistics.length
//       }
//     };

//     const tempPath = path.join(uploadDir, `simplified_${tempId}.json`);
//     fs.writeFileSync(tempPath, JSON.stringify(tempData, null, 2));

//     console.log('ðŸ’¾ Saved simplification metadata:', tempPath);

//     res.json({
//       statistics,
//       tempId,
//       message: `Simplification completed with ${targetPercentage}% maximum reduction target`,
//       totalFeatures: statistics.length,
//       summary: tempData.summary
//     });

//   } catch (error) {
//     console.error('âŒ Error during simplification:', error);
//     console.error('Stack:', error.stack);

//     uploadedFilePaths.forEach(filePath => {
//       try {
//         if (fs.existsSync(filePath)) {
//           fs.unlinkSync(filePath);
//         }
//       } catch (cleanupError) {
//         console.error('Error cleaning up file:', cleanupError);
//       }
//     });

//     res.status(500).json({
//       error: 'Failed to simplify geometry',
//       details: error.message,
//       stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
//     });
//   }
// });

// if (!global.progressClients) {
//   global.progressClients = {};
// }

// // Helper function untuk send progress ke client
// function sendProgress(sessionId, data) {
//   const client = global.progressClients?.[sessionId];
//   if (client) {
//     try {
//       client.write(`data: ${JSON.stringify(data)}\n\n`);
//     } catch (err) {
//       console.error('Error sending progress:', err);
//       delete global.progressClients[sessionId];
//     }
//   }
// }

// app.get('/api/upload-progress/:sessionId', (req, res) => {
//   const { sessionId } = req.params;

//   res.setHeader('Content-Type', 'text/event-stream');
//   res.setHeader('Cache-Control', 'no-cache');
//   res.setHeader('Connection', 'keep-alive');
//   res.flushHeaders();

//   // Store client connection
//   if (!global.progressClients) {
//     global.progressClients = {};
//   }
//   global.progressClients[sessionId] = res;

//   req.on('close', () => {
//     delete global.progressClients[sessionId];
//   });
// });

// // NEW ENDPOINT: Upload to database after simplification
// // NEW ENDPOINT: Upload to database after simplification
// app.post('/api/shp/upload-to-db', multer({
//   storage: multer.diskStorage({
//     destination: uploadDir,
//     filename: (req, file, cb) => {
//       cb(null, Date.now() + '-' + file.originalname);
//     }
//   })
// }).array('shpFiles'), async (req, res) => {
//   let uploadedFilePaths = [];

//   try {
//     const sessionId = req.headers['x-session-id'];
//     const {
//       tableName,
//       year,
//       columnMapping,
//       simplificationApplied,
//       method,
//       percentage,              // â† Nilai dari slider (misal: "70")
//       preventShapeRemoval
//     } = req.body;

//     const files = req.files;

//     console.log('ðŸ“¤ Upload to DB request:', {
//       tableName,
//       year,
//       simplificationApplied,
//       method,
//       percentage: `${percentage}%`,
//       filesCount: files?.length || 0
//     });

//     if (!files || files.length === 0) {
//       return res.status(400).json({ error: 'No files uploaded' });
//     }

//     // Track uploaded files for cleanup
//     uploadedFilePaths = files.map(f => f.path);

//     const mapping = JSON.parse(columnMapping);

//     // Find .shp and .dbf files
//     const shpFile = files.find(f => f.originalname.toLowerCase().endsWith('.shp'));
//     const dbfFile = files.find(f => f.originalname.toLowerCase().endsWith('.dbf'));

//     if (!shpFile || !dbfFile) {
//       return res.status(400).json({ error: 'Missing required .shp or .dbf file' });
//     }

//     console.log('ðŸ“‚ Files found:', {
//       shp: shpFile.filename,
//       dbf: dbfFile.filename
//     });

//     // âœ… PERUBAHAN UTAMA: Konversi percentage ke targetPercentage
//     const targetPercentage = simplificationApplied === 'true' && percentage
//       ? parseFloat(percentage)
//       : 0;

//     console.log('ðŸ”§ Simplification settings:', {
//       applied: simplificationApplied === 'true',
//       method: method || 'none',
//       targetPercentage: targetPercentage > 0 ? `${targetPercentage}%` : 'N/A'
//     });

//     // Read shapefile
//     const source = await shapefile.open(shpFile.path, dbfFile.path);
//     // First pass: count total features
//     let totalFeatures = 0;
//     let countResult = await source.read();
//     while (!countResult.done) {
//       totalFeatures++;
//       countResult = await source.read();
//     }

//     console.log(`ðŸ“Š Total features to process: ${totalFeatures}`);

//     // Send initial progress
//     sendProgress(sessionId, {
//       type: 'start',
//       total: totalFeatures,
//       inserted: 0,
//       percentage: 0,
//       message: 'Memulai proses insert ke database...'
//     });

//     // Re-open shapefile untuk actual processing
//     const sourceForInsert = await shapefile.open(shpFile.path, dbfFile.path);
//     let result = await sourceForInsert.read();

//     let insertedCount = 0;
//     let simplifiedCount = 0;
//     let errors = [];

//     // Track simplification stats untuk summary
//     let totalOriginalPoints = 0;
//     let totalSimplifiedPoints = 0;

//     while (!result.done) {
//       const feature = result.value;

//       if (feature && feature.geometry && feature.properties) {
//         try {
//           // Apply simplification if enabled
//           let geometryToInsert = feature.geometry;

//           // âœ… PERUBAHAN: Gunakan fungsi baru dengan target persentase
//           if (simplificationApplied === 'true' && method && targetPercentage > 0) {
//             const originalPoints = getAllCoordinates(feature.geometry).length;
//             totalOriginalPoints += originalPoints;

//             if (method === 'douglas-peucker') {
//               // âœ… Gunakan fungsi baru dengan target persentase
//               geometryToInsert = simplifyDouglasPeuckerWithTargetPercentage(
//                 feature.geometry,
//                 targetPercentage,  // â† Gunakan targetPercentage langsung
//                 preventShapeRemoval === 'true'
//               );
//             } else if (method === 'visvalingam-effective' || method === 'visvalingam-weighted') {
//               // TODO: Nanti akan diperbaiki dengan target percentage
//               // Sementara gunakan tolerance-based
//               const tolerance = (100 - targetPercentage) / 1000;
//               geometryToInsert = simplifyVisvalingam(
//                 feature.geometry,
//                 tolerance,
//                 preventShapeRemoval === 'true'
//               );
//             }

//             const simplifiedPoints = getAllCoordinates(geometryToInsert).length;
//             totalSimplifiedPoints += simplifiedPoints;

//             if (simplifiedPoints < originalPoints) {
//               simplifiedCount++;

//               // Log untuk debug (setiap 10 feature)
//               if (simplifiedCount % 10 === 0) {
//                 const reduction = ((originalPoints - simplifiedPoints) / originalPoints * 100).toFixed(1);
//                 console.log(`  ðŸ”¸ Feature ${insertedCount}: ${originalPoints} â†’ ${simplifiedPoints} points (${reduction}% reduction)`);
//               }
//             }
//           }

//           // Build insert query based on column mapping
//           const columns = [];
//           const values = [];
//           const placeholders = [];
//           let paramIndex = 1;

//           for (const [dbCol, mapConfig] of Object.entries(mapping)) {
//             if (dbCol === 'geom' || !mapConfig.source || mapConfig.type === 'skip') continue;

//             columns.push(dbCol);

//             if (mapConfig.type === 'shp_column') {
//               values.push(feature.properties[mapConfig.source]);
//               placeholders.push(`$${paramIndex++}`);
//             } else if (mapConfig.type === 'year_dropdown') {
//               values.push(parseInt(year));
//               placeholders.push(`$${paramIndex++}`);
//             } else if (mapConfig.type === 'null') {
//               values.push(null);
//               placeholders.push(`$${paramIndex++}`);
//             } else if (mapConfig.type === 'auto_generate') {
//               if (mapConfig.config.mode === 'sequence') {
//                 values.push(mapConfig.config.startFrom + insertedCount * mapConfig.config.increment);
//                 placeholders.push(`$${paramIndex++}`);
//               } else if (mapConfig.config.mode === 'continue') {
//                 const maxQuery = `SELECT COALESCE(MAX(${dbCol}), 0) as max_val FROM ${tableName}`;
//                 const maxResult = await client.query(maxQuery);
//                 const maxVal = maxResult.rows[0].max_val;
//                 values.push(maxVal + mapConfig.config.increment);
//                 placeholders.push(`$${paramIndex++}`);
//               } else if (mapConfig.config.mode === 'random') {
//                 const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
//                 let randomStr = '';
//                 for (let i = 0; i < mapConfig.config.length; i++) {
//                   randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
//                 }
//                 values.push(randomStr);
//                 placeholders.push(`$${paramIndex++}`);
//               } else {
//                 values.push(null);
//                 placeholders.push(`$${paramIndex++}`);
//               }
//             } else if (mapConfig.type === 'manual_table') {
//                 // Manual table data adalah array of objects dengan _rowId
//                 console.log(`ðŸ”§ Processing manual_table for column: ${dbCol}`);
//                 console.log(`ðŸ“Š Manual data exists:`, !!mapConfig.data);
//                 console.log(`ðŸ“Š Manual data is array:`, Array.isArray(mapConfig.data));
//                 console.log(`ðŸ“Š Manual data length:`, mapConfig.data?.length || 0);
//                 console.log(`ðŸ“Š Current insertedCount:`, insertedCount);

//                 if (mapConfig.data && Array.isArray(mapConfig.data)) {
//                   // Coba cari berdasarkan _rowId
//                   const rowData = mapConfig.data.find(row => row._rowId === insertedCount);
//                   console.log(`ðŸ” Found row by _rowId (${insertedCount}):`, !!rowData);

//                   if (rowData && rowData[dbCol] !== undefined) {
//                     console.log(`âœ… Using value from _rowId match: "${rowData[dbCol]}"`);
//                     values.push(rowData[dbCol]);
//                   } else {
//                     // Fallback: coba akses langsung by index
//                     const directData = mapConfig.data[insertedCount];
//                     console.log(`ðŸ” Trying direct index access [${insertedCount}]:`, !!directData);

//                     if (directData && directData[dbCol] !== undefined) {
//                       console.log(`âœ… Using value from direct index: "${directData[dbCol]}"`);
//                       values.push(directData[dbCol]);
//                     } else {
//                       console.log(`âš ï¸ No data found for column ${dbCol}, using null`);
//                       values.push(null);
//                     }
//                   }
//                 } else {
//                   console.log(`âŒ mapConfig.data is not valid array, using null`);
//                   values.push(null);
//                 }
//                 placeholders.push(`$${paramIndex++}`);
//               } else {
//                 values.push(null);
//                 placeholders.push(`$${paramIndex++}`);
//               }
//           }

//           // Add geometry (simplified or original)
//           columns.push('geom');
//           values.push(JSON.stringify(geometryToInsert));
//           placeholders.push(`ST_SetSRID(ST_GeomFromGeoJSON($${paramIndex}::json), 4326)`);

//           const insertQuery = `
//             INSERT INTO ${tableName} (${columns.join(', ')})
//             VALUES (${placeholders.join(', ')})
//           `;

//           // Debug log for first insert
//           if (insertedCount === 0) {
//             console.log('ðŸ” First insert debug:', {
//               columns: columns.length,
//               values: values.length,
//               simplified: simplificationApplied === 'true',
//               geometryType: geometryToInsert.type,
//               targetPercentage: targetPercentage > 0 ? `${targetPercentage}%` : 'N/A'
//             });
//           }

//           await client.query(insertQuery, values);
//           insertedCount++;

//           const progressInterval = Math.max(10, Math.floor(totalFeatures / 20)); // Update setiap 5% atau min 10 rows
//           if (insertedCount % progressInterval === 0 || insertedCount === totalFeatures) {
//             const progressPercentage = (insertedCount / totalFeatures) * 100;
//             sendProgress(sessionId, {
//               type: 'progress',
//               total: totalFeatures,
//               inserted: insertedCount,
//               percentage: progressPercentage,
//               message: `Memasukkan data ke database... ${insertedCount}/${totalFeatures}`
//             });

//             console.log(`âœ… Progress: ${insertedCount}/${totalFeatures} (${progressPercentage.toFixed(1)}%)`);
//           }

//         } catch (insertError) {
//           console.error(`âŒ Error inserting feature ${insertedCount}:`, insertError.message);
//           errors.push({
//             feature: insertedCount,
//             error: insertError.message
//           });

//           // Stop after first error for debugging
//           if (insertedCount === 0) {
//             throw insertError;
//           }
//         }
//       }

//       result = await source.read();
//     }

//     // Clean up uploaded files
//     uploadedFilePaths.forEach(filePath => {
//       try {
//         if (fs.existsSync(filePath)) {
//           fs.unlinkSync(filePath);
//         }
//       } catch (cleanupError) {
//         console.error('Error cleaning up file:', cleanupError);
//       }
//     });

//     // âœ… TAMBAHAN: Hitung overall reduction jika ada simplifikasi
//     let overallReduction = 0;
//     if (simplificationApplied === 'true' && totalOriginalPoints > 0) {
//       overallReduction = ((totalOriginalPoints - totalSimplifiedPoints) / totalOriginalPoints * 100);
//     }

//     console.log(`âœ… Upload complete:`, {
//       inserted: insertedCount,
//       simplified: simplifiedCount,
//       errors: errors.length,
//       ...(simplificationApplied === 'true' && {
//         simplificationStats: {
//           targetPercentage: `${targetPercentage}%`,
//           totalOriginalPoints,
//           totalSimplifiedPoints,
//           overallReduction: `${overallReduction.toFixed(1)}%`
//         }
//       })
//     });

//     sendProgress(sessionId, {
//       type: 'complete',
//       total: totalFeatures,
//       inserted: insertedCount,
//       percentage: 100,
//       message: 'Upload selesai!'
//     });

//     // Small delay to ensure message is sent
//     await new Promise(resolve => setTimeout(resolve, 100));

//     // Cleanup SSE connection
//     if (global.progressClients[sessionId]) {
//       delete global.progressClients[sessionId];
//     }

//     // âœ… PERUBAHAN: Response dengan info lebih detail
//     const responseMessage = simplificationApplied === 'true'
//       ? `Successfully uploaded ${insertedCount} features to ${tableName} (${simplifiedCount} features simplified with target ${targetPercentage}% max reduction, actual overall reduction: ${overallReduction.toFixed(1)}%)`
//       : `Successfully uploaded ${insertedCount} features to ${tableName}`;

//     res.json({
//       success: true,
//       message: responseMessage,
//       insertedCount,
//       simplifiedCount: simplificationApplied === 'true' ? simplifiedCount : 0,
//       simplificationApplied: simplificationApplied === 'true',
//       ...(simplificationApplied === 'true' && {
//         simplificationDetails: {
//           targetPercentage: `${targetPercentage}%`,
//           totalOriginalPoints,
//           totalSimplifiedPoints,
//           overallReduction: `${overallReduction.toFixed(1)}%`,
//           method
//         }
//       }),
//       errors: errors.length > 0 ? errors : undefined
//     });

//   } catch (error) {
//     console.error('âŒ Error during upload to database:', error);
//     console.error('Stack:', error.stack);

//     const sessionId = req.headers['x-session-id'];
//     if (sessionId) {
//       sendProgress(sessionId, {
//         type: 'error',
//         message: error.message,
//         details: error.stack
//       });

//       // Cleanup SSE connection
//       if (global.progressClients[sessionId]) {
//         delete global.progressClients[sessionId];
//       }
//     }

//     // Clean up uploaded files on error
//     uploadedFilePaths.forEach(filePath => {
//       try {
//         if (fs.existsSync(filePath)) {
//           fs.unlinkSync(filePath);
//         }
//       } catch (cleanupError) {
//         console.error('Error cleaning up file:', cleanupError);
//       }
//     });

//     res.status(500).json({
//       error: 'Failed to upload to database',
//       details: error.message
//     });
//   }
// });

// app.get('/api/tables-list', async (req, res) => {
//   try {
//     const query = `
//       SELECT table_name
//       FROM information_schema.tables
//       WHERE table_schema = DATABASE()
//         AND table_type = 'BASE TABLE'
//         AND table_name NOT IN ('file', 'kejadian', 'spatial_ref_sys')
//         AND table_name NOT LIKE 'pg_%'
//         AND table_name NOT LIKE 'sql_%'
//       ORDER BY table_name ASC
//     `;

//     const result = await client.query(query);
//     const tableNames = result.rows.map(row => row.table_name);

//     res.json(tableNames);
//   } catch (error) {
//     console.error('Error fetching tables list:', error);
//     res.status(500).json({ error: 'Failed to fetch tables list' });
//   }
// });

// // NEW ENDPOINT: Get columns for a specific table
// app.get('/api/table-columns/:tableName', async (req, res) => {
//   try {
//     const { tableName } = req.params;

//     // Validate table name to prevent SQL injection
//     const tableCheckQuery = `
//       SELECT table_name
//       FROM information_schema.tables
//       WHERE table_schema = DATABASE() AND table_name = $1
//     `;
//     const tableCheck = await client.query(tableCheckQuery, [tableName]);

//     if (tableCheck.rows.length === 0) {
//       return res.status(404).json({ error: 'Table not found' });
//     }

//     const query = `
//       SELECT
//         column_name as name,
//         data_type as type,
//         is_nullable,
//         column_default
//       FROM information_schema.columns
//       WHERE table_schema = DATABASE()
//         AND table_name = $1
//         AND column_name NOT IN ('geom', 'geometry', 'geometry_json')
//       ORDER BY ordinal_position
//     `;

//     const result = await client.query(query, [tableName]);

//     const columns = result.rows.map(col => ({
//       name: col.name,
//       type: col.type.includes('int') ? 'integer' :
//             col.type.includes('char') || col.type.includes('text') ? 'string' :
//             col.type.includes('numeric') || col.type.includes('decimal') ? 'decimal' :
//             col.type,
//       required: col.is_nullable === 'NO' && col.column_default === null,
//       hasDefault: col.column_default !== null,
//       shouldSkip: col.column_default !== null &&
//                   (col.column_default.includes('nextval') ||
//                    col.name === 'gid' ||
//                    col.name === 'id' ||
//                    col.name === 'fid')
//     }));

//     res.json(columns);
//   } catch (error) {
//     console.error('Error fetching table columns:', error);
//     res.status(500).json({ error: 'Failed to fetch table columns' });
//   }
// });

// // NEW ENDPOINT: Delete layer data by table name and year
// app.delete('/api/shp-layers/:tableName/year/:year', async (req, res) => {
//   try {
//     const { tableName, year } = req.params;

//     console.log('='.repeat(80));
//     console.log('ðŸ—‘ï¸ DELETE Layer Data Request');
//     console.log('='.repeat(80));
//     console.log('ðŸ“‹ Table:', tableName);
//     console.log('ðŸ“… Year:', year);
//     console.log('='.repeat(80));

//     // STEP 1: Validasi table name untuk keamanan - cek apakah tabel benar-benar ada di database
//     const tableCheckQuery = `
//       SELECT table_name
//       FROM information_schema.tables
//       WHERE table_schema = DATABASE()
//         AND table_name = $1
//         AND table_type = 'BASE TABLE'
//         AND table_name NOT IN ('file', 'kejadian', 'spatial_ref_sys')
//         AND table_name NOT LIKE 'pg_%'
//         AND table_name NOT LIKE 'sql_%'
//     `;

//     console.log('ðŸ” Checking if table exists...');
//     const tableCheck = await client.query(tableCheckQuery, [tableName]);

//     if (tableCheck.rows.length === 0) {
//       console.error('âŒ Table not found or not accessible:', tableName);
//       console.log('='.repeat(80));
//       return res.status(404).json({
//         error: 'Table not found',
//         message: `Table '${tableName}' does not exist or is not accessible`
//       });
//     }

//     console.log('âœ… Table exists:', tableName);

//     // Cek apakah tabel memiliki kolom tahun_data
//     const checkColumnQuery = `
//       SELECT column_name
//       FROM information_schema.columns
//       WHERE table_name = $1 AND column_name = 'tahun_data'
//     `;
//     const columnCheck = await client.query(checkColumnQuery, [tableName]);

//     if (columnCheck.rows.length === 0) {
//       console.error('âŒ Table does not have tahun_data column');
//       return res.status(400).json({
//         error: 'Table does not support year-based deletion',
//         message: `Table ${tableName} does not have tahun_data column`
//       });
//     }

//     // STEP 3: Cek berapa banyak tahun unik yang ada di tabel
//     const countYearsQuery = `
//       SELECT COUNT(DISTINCT tahun_data) as total_years
//       FROM ${tableName}
//       WHERE tahun_data IS NOT NULL
//     `;
//     const yearsResult = await client.query(countYearsQuery);
//     const totalYears = parseInt(yearsResult.rows[0].total_years);

//     console.log(`ðŸ“Š Total unique years in table: ${totalYears}`);

//     // STEP 4: Cek apakah tahun yang akan dihapus ada di tabel
//     const checkYearQuery = `
//       SELECT COUNT(*) as count
//       FROM ${tableName}
//       WHERE tahun_data = $1
//     `;
//     const checkYearResult = await client.query(checkYearQuery, [parseInt(year)]);
//     const rowsToDelete = parseInt(checkYearResult.rows[0].count);

//     if (rowsToDelete === 0) {
//       console.warn('âš ï¸ No data found for deletion');
//       console.log('='.repeat(80));
//       return res.status(404).json({
//         error: 'No data found',
//         message: `No data found in '${tableName}' for year ${year}`
//       });
//     }

//     console.log(`ðŸ“Š Rows to delete: ${rowsToDelete}`);

//     // âœ… FITUR BARU: Jika ini tahun terakhir, DROP TABLE instead of DELETE
//     if (totalYears === 1) {
//       console.log('='.repeat(80));
//       console.log('ðŸ”¥ THIS IS THE LAST YEAR IN TABLE!');
//       console.log('ðŸ—‘ï¸ Dropping entire table instead of deleting rows...');
//       console.log('='.repeat(80));

//       const dropTableQuery = `DROP TABLE IF EXISTS ${tableName} CASCADE`;

//       try {
//         await client.query(dropTableQuery);

//         console.log('='.repeat(80));
//         console.log(`âœ… TABLE DROPPED SUCCESSFULLY`);
//         console.log(`ðŸ“‹ Table: ${tableName}`);
//         console.log(`ðŸ“… Last year: ${year}`);
//         console.log(`ðŸ“Š Total rows removed: ${rowsToDelete}`);
//         console.log('='.repeat(80));

//         return res.json({
//           success: true,
//           message: `Table '${tableName}' has been dropped (was the last year: ${year})`,
//           action: 'table_dropped',
//           tableName,
//           year: parseInt(year),
//           deletedCount: rowsToDelete
//         });
//       } catch (dropError) {
//         console.error('âŒ Error dropping table:', dropError);
//         return res.status(500).json({
//           error: 'Failed to drop table',
//           message: dropError.message
//         });
//       }
//     }

//     // STEP 5: Jika bukan tahun terakhir, DELETE data seperti biasa
//     console.log('â„¹ï¸ Not the last year, deleting rows only...');

//     const deleteQuery = `
//       DELETE FROM ${tableName}
//       WHERE tahun_data = $1
//       RETURNING gid
//     `;

//     console.log('ðŸ—‘ï¸ Executing DELETE query...');
//     console.log('Query:', deleteQuery);
//     console.log('Param:', [parseInt(year)]);

//     const deleteResult = await client.query(deleteQuery, [parseInt(year)]);

//     if (deleteResult.rowCount === 0) {
//       console.warn('âš ï¸ No data found for deletion');
//       return res.status(404).json({
//         error: 'No data found',
//         message: `No data found in ${tableName} for year ${year}`
//       });
//     }

//     console.log(`âœ… Deleted ${deleteResult.rowCount} rows from ${tableName} for year ${year}`);

//     res.json({
//       success: true,
//       message: `Successfully deleted ${deleteResult.rowCount} rows from '${tableName}' for year ${year}`,
//       action: 'rows_deleted',
//       deletedCount: deleteResult.rowCount,
//       tableName,
//       year: parseInt(year),
//       remainingYears: totalYears - 1
//     });

//   } catch (error) {
//     console.error('âŒ Error deleting layer data:', error);
//     res.status(500).json({
//       error: 'Failed to delete layer data',
//       message: error.message
//     });
//   }
// });

// function getAllCoordinates(geometry) {
//   let coords = [];

//   if (!geometry || !geometry.type) {
//     console.warn('Invalid geometry object:', geometry);
//     return coords;
//   }

//   try {
//     if (geometry.type === 'Point') {
//       coords = [geometry.coordinates];
//     } else if (geometry.type === 'LineString') {
//       coords = geometry.coordinates || [];
//     } else if (geometry.type === 'Polygon') {
//       geometry.coordinates.forEach(ring => {
//         coords = coords.concat(ring);
//       });
//     } else if (geometry.type === 'MultiPoint') {
//       coords = geometry.coordinates || [];
//     } else if (geometry.type === 'MultiLineString') {
//       geometry.coordinates.forEach(line => {
//         coords = coords.concat(line);
//       });
//     } else if (geometry.type === 'MultiPolygon') {
//       geometry.coordinates.forEach(polygon => {
//         polygon.forEach(ring => {
//           coords = coords.concat(ring);
//         });
//       });
//     } else {
//       console.warn('Unknown geometry type:', geometry.type);
//     }
//   } catch (error) {
//     console.error('Error getting coordinates:', error);
//   }

//   return coords;
// }

// function simplifyDouglasPeucker(geometry, tolerance, preventRemoval) {
//   try {
//     if (!geometry || !geometry.type) {
//       console.warn('Invalid geometry for Douglas-Peucker');
//       return geometry;
//     }

//     if (geometry.type === 'Point') {
//       return geometry;
//     }

//     if (geometry.type === 'LineString') {
//       const points = geometry.coordinates.map(c => ({ x: c[0], y: c[1] }));
//       const simplified = simplify(points, tolerance, true);

//       // Prevent complete removal
//       if (preventRemoval && simplified.length < 3) {
//         console.log('Prevented removal - keeping original LineString');
//         return geometry;
//       }

//       return {
//         type: 'LineString',
//         coordinates: simplified.map(p => [p.x, p.y])
//       };
//     }

//     if (geometry.type === 'Polygon') {
//       const simplifiedRings = geometry.coordinates.map((ring, ringIdx) => {
//         const points = ring.map(c => ({ x: c[0], y: c[1] }));
//         const simplified = simplify(points, tolerance, true);

//         // Ensure ring is closed and has minimum points
//         if (preventRemoval && simplified.length < 4) {
//           console.log(`Ring ${ringIdx}: Prevented removal - keeping original`);
//           return ring;
//         }

//         // Ensure ring is closed
//         const coords = simplified.map(p => [p.x, p.y]);
//         if (coords.length > 0 && (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1])) {
//           coords.push(coords[0]);
//         }

//         // Validate minimum ring size
//         if (coords.length < 4) {
//           console.warn(`Ring ${ringIdx}: Too few points after simplification, keeping original`);
//           return ring;
//         }

//         return coords;
//       });

//       return {
//         type: 'Polygon',
//         coordinates: simplifiedRings
//       };
//     }

//     if (geometry.type === 'MultiPolygon') {
//       const simplifiedPolygons = geometry.coordinates.map((polygon, polyIdx) => {
//         return polygon.map((ring, ringIdx) => {
//           const points = ring.map(c => ({ x: c[0], y: c[1] }));
//           const simplified = simplify(points, tolerance, true);

//           if (preventRemoval && simplified.length < 4) {
//             console.log(`Polygon ${polyIdx}, Ring ${ringIdx}: Prevented removal`);
//             return ring;
//           }

//           const coords = simplified.map(p => [p.x, p.y]);
//           if (coords.length > 0 && (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1])) {
//             coords.push(coords[0]);
//           }

//           if (coords.length < 4) {
//             return ring;
//           }

//           return coords;
//         });
//       });

//       return {
//         type: 'MultiPolygon',
//         coordinates: simplifiedPolygons
//       };
//     }

//     console.log(`Unsupported geometry type for simplification: ${geometry.type}`);
//     return geometry;
//   } catch (error) {
//     console.error('Error in Douglas-Peucker:', error);
//     return geometry;
//   }
// }

// // NEW ENDPOINT: Parse DBF file to get column names AND data
// app.post('/api/shp/parse-dbf', multer({ storage: multer.memoryStorage() }).single('dbfFile'), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: 'No DBF file uploaded' });
//     }

//     // Save buffer to temporary file
//     const tempDir = path.join(__dirname, 'uploads', 'temp');
//     if (!fs.existsSync(tempDir)) {
//       fs.mkdirSync(tempDir, { recursive: true });
//     }

//     const tempFilePath = path.join(tempDir, `temp_${Date.now()}.dbf`);
//     fs.writeFileSync(tempFilePath, req.file.buffer);

//     // Read DBF using shapefile library
//     const source = await shapefile.openDbf(tempFilePath);
//     const firstResult = await source.read();

//     if (firstResult.done || !firstResult.value) {
//       // Clean up
//       fs.unlinkSync(tempFilePath);
//       return res.status(400).json({ error: 'DBF file is empty or invalid' });
//     }

//     // Get column names from first record
//     const columns = Object.keys(firstResult.value);

//     // Collect all data records
//     const allData = [firstResult.value]; // Start with first record
//     let nextResult = await source.read();

//     while (!nextResult.done) {
//       allData.push(nextResult.value);
//       nextResult = await source.read();
//     }

//     const recordCount = allData.length;

//     // Clean up temporary file
//     fs.unlinkSync(tempFilePath);

//     console.log('âœ… DBF parsed successfully');
//     console.log('ðŸ“‹ Columns:', columns);
//     console.log('ðŸ“Š Record count:', recordCount);
//     console.log('ðŸ“ Sample data (first 3):', allData.slice(0, 3));

//     res.json({
//       columns: columns,
//       recordCount: recordCount,
//       data: allData  // âœ… Return all data
//     });

//   } catch (error) {
//     console.error('âŒ Error in parse-dbf:', error);
//     res.status(500).json({
//       error: 'Failed to parse DBF file',
//       details: error.message
//     });
//   }
// });

//   // NEW ENDPOINT: Upload directly to database (without simplification)
//   app.post('/api/shp/upload-direct', multer({
//     storage: multer.diskStorage({
//       destination: uploadDir,
//       filename: (req, file, cb) => {
//         cb(null, Date.now() + '-' + file.originalname);
//       }
//     })
//   }).array('shpFiles'), async (req, res) => {
//     try {
//       const { tableName, year, columnMapping } = req.body;
//       const files = req.files;

//       console.log('ðŸ“¤ Upload Direct Request:');
//       console.log('- Table:', tableName);
//       console.log('- Year:', year);
//       console.log('- Files:', files?.length || 0);

//       if (!files || files.length === 0) {
//         return res.status(400).json({ error: 'No files uploaded' });
//       }

//       if (!tableName || !year || !columnMapping) {
//         return res.status(400).json({ error: 'Missing required parameters' });
//       }

//       const mapping = JSON.parse(columnMapping);

//       console.log('\n' + '='.repeat(80));
//       console.log('ðŸ—ºï¸ COLUMN MAPPING DETAIL:');
//       console.log('='.repeat(80));
//       for (const [dbCol, mapConfig] of Object.entries(mapping)) {
//         console.log(`\nðŸ“‹ Column: ${dbCol}`);
//         console.log(`   Type: ${mapConfig.type}`);
//         console.log(`   Source: ${mapConfig.source}`);
//         if (mapConfig.type === 'manual_table') {
//           console.log(`   Has data: ${!!mapConfig.data}`);
//           console.log(`   Data is array: ${Array.isArray(mapConfig.data)}`);
//           console.log(`   Data length: ${mapConfig.data?.length || 0}`);
//           if (mapConfig.data && mapConfig.data.length > 0) {
//             console.log(`   First row keys:`, Object.keys(mapConfig.data[0]));
//             console.log(`   First row sample:`, JSON.stringify(mapConfig.data[0]).substring(0, 200));
//           }
//         }
//         if (mapConfig.type === 'auto_generate') {
//           console.log(`   Config:`, mapConfig.config);
//         }
//       }
//       console.log('='.repeat(80) + '\n');

//       // Find .shp and .dbf files
//       const shpFile = files.find(f => f.originalname.toLowerCase().endsWith('.shp'));
//       const dbfFile = files.find(f => f.originalname.toLowerCase().endsWith('.dbf'));

//       if (!shpFile || !dbfFile) {
//         return res.status(400).json({ error: 'Missing required .shp or .dbf file' });
//       }

//       console.log('ðŸ“‚ Reading shapefile...');
//       console.log('ðŸ“‚ SHP file:', shpFile.path);
//       console.log('ðŸ“‚ DBF file:', dbfFile.path);

//       // Read shapefile
//       const source = await shapefile.open(shpFile.path, dbfFile.path);
//       let result = await source.read();
//       let insertedCount = 0;
//       let errors = [];

//       while (!result.done) {
//         const feature = result.value;

//         if (feature && feature.geometry && feature.properties) {
//           try {
//             // Build insert query based on column mapping
//             const columns = [];
//             const values = [];
//             const placeholders = [];
//             let paramIndex = 1;

//             for (const [dbCol, mapConfig] of Object.entries(mapping)) {
//               if (dbCol === 'geom' || !mapConfig.source || mapConfig.type === 'skip') continue;

//               columns.push(dbCol);

//               if (mapConfig.type === 'shp_column') {
//                 values.push(feature.properties[mapConfig.source]);
//                 placeholders.push(`$${paramIndex++}`);
//               } else if (mapConfig.type === 'year_dropdown') {
//                 values.push(parseInt(year));
//                 placeholders.push(`$${paramIndex++}`);
//               } else if (mapConfig.type === 'null') {
//                 values.push(null);
//                 placeholders.push(`$${paramIndex++}`);
//               } else if (mapConfig.type === 'auto_generate') {
//                 if (mapConfig.config.mode === 'sequence') {
//                   values.push(mapConfig.config.startFrom + insertedCount * mapConfig.config.increment);
//                   placeholders.push(`$${paramIndex++}`);
//                 } else if (mapConfig.config.mode === 'continue') {
//                   const maxQuery = `SELECT COALESCE(MAX(${dbCol}), 0) as max_val FROM ${tableName}`;
//                   const maxResult = await client.query(maxQuery);
//                   const maxVal = maxResult.rows[0].max_val;
//                   values.push(maxVal + mapConfig.config.increment);
//                   placeholders.push(`$${paramIndex++}`);
//                 } else if (mapConfig.config.mode === 'random') {
//                   const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
//                   let randomStr = '';
//                   for (let i = 0; i < mapConfig.config.length; i++) {
//                     randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
//                   }
//                   values.push(randomStr);
//                   placeholders.push(`$${paramIndex++}`);
//                 } else {
//                   values.push(null);
//                   placeholders.push(`$${paramIndex++}`);
//                 }
//               } else if (mapConfig.type === 'manual_table') {
//                 // Manual table data adalah array of objects dengan _rowId
//                 console.log(`ðŸ”§ Processing manual_table for column: ${dbCol}`);
//                 console.log(`ðŸ“Š Manual data exists:`, !!mapConfig.data);
//                 console.log(`ðŸ“Š Manual data is array:`, Array.isArray(mapConfig.data));
//                 console.log(`ðŸ“Š Manual data length:`, mapConfig.data?.length || 0);
//                 console.log(`ðŸ“Š Current insertedCount:`, insertedCount);

//                 if (mapConfig.data && Array.isArray(mapConfig.data)) {
//                   // Coba cari berdasarkan _rowId
//                   const rowData = mapConfig.data.find(row => row._rowId === insertedCount);
//                   console.log(`ðŸ” Found row by _rowId (${insertedCount}):`, !!rowData);

//                   if (rowData && rowData[dbCol] !== undefined) {
//                     console.log(`âœ… Using value from _rowId match: "${rowData[dbCol]}"`);
//                     values.push(rowData[dbCol]);
//                   } else {
//                     // Fallback: coba akses langsung by index
//                     const directData = mapConfig.data[insertedCount];
//                     console.log(`ðŸ” Trying direct index access [${insertedCount}]:`, !!directData);

//                     if (directData && directData[dbCol] !== undefined) {
//                       console.log(`âœ… Using value from direct index: "${directData[dbCol]}"`);
//                       values.push(directData[dbCol]);
//                     } else {
//                       console.log(`âš ï¸ No data found for column ${dbCol}, using null`);
//                       values.push(null);
//                     }
//                   }
//                 } else {
//                   console.log(`âŒ mapConfig.data is not valid array, using null`);
//                   values.push(null);
//                 }
//                 placeholders.push(`$${paramIndex++}`);
//               } else {
//                 values.push(null);
//                 placeholders.push(`$${paramIndex++}`);
//               }
//             }

//             // Add geometry column
//             columns.push('geom');
//             values.push(JSON.stringify(feature.geometry));
//             placeholders.push(`ST_SetSRID(ST_GeomFromGeoJSON($${paramIndex}::json), 4326)`);

//             const insertQuery = `
//               INSERT INTO ${tableName} (${columns.join(', ')})
//               VALUES (${placeholders.join(', ')})
//             `;

//             // Debug log untuk first insert
//             if (insertedCount === 0) {
//               console.log('='.repeat(80));
//               console.log('ðŸ” DEBUG INSERT QUERY:');
//               console.log('='.repeat(80));
//               console.log('ðŸ“‹ Table name:', tableName);
//               console.log('ðŸ“‹ Columns:', columns);
//               console.log('ðŸ“‹ Placeholders:', placeholders);
//               console.log('ðŸ“‹ Values count:', values.length);
//               console.log('ðŸ“‹ Query:', insertQuery);
//               console.log('ðŸ“‹ First geometry (200 chars):', JSON.stringify(feature.geometry).substring(0, 200));
//               console.log('='.repeat(80));
//             }

//             await client.query(insertQuery, values);
//             insertedCount++;

//             if (insertedCount % 10 === 0) {
//               console.log(`âœ… Inserted ${insertedCount} features...`);
//             }

//           } catch (insertError) {
//             console.error(`âŒ Error inserting feature ${insertedCount}:`, insertError.message);
//             console.error('Full error:', insertError);
//             errors.push({
//               feature: insertedCount,
//               error: insertError.message
//             });
//             // Stop after first error for debugging
//             if (insertedCount === 0) {
//               throw insertError;
//             }
//           }
//         }

//         result = await source.read();
//       }

//       // Clean up uploaded files
//       files.forEach(file => {
//         if (fs.existsSync(file.path)) {
//           fs.unlinkSync(file.path);
//         }
//       });

//       console.log(`âœ… Upload complete: ${insertedCount} features inserted`);
//       if (errors.length > 0) {
//         console.log(`âš ï¸ ${errors.length} errors occurred`);
//       }

//       res.json({
//         success: true,
//         message: `Successfully uploaded ${insertedCount} features to ${tableName}`,
//         insertedCount,
//         errors: errors.length > 0 ? errors : undefined
//       });

//     } catch (error) {
//       console.error('âŒ Error during direct upload:', error);
//       console.error('Stack:', error.stack);

//       // Clean up uploaded files on error
//       if (req.files) {
//         req.files.forEach(file => {
//           if (fs.existsSync(file.path)) {
//             fs.unlinkSync(file.path);
//           }
//         });
//       }

//       res.status(500).json({
//         error: 'Failed to upload to database',
//         details: error.message
//       });
//     }
//   });

//   app.post('/api/cleanup-temp-files', express.json(), async (req, res) => {
//     try {
//       const { filenames } = req.body;

//       if (!filenames || !Array.isArray(filenames) || filenames.length === 0) {
//         return res.status(400).json({ error: 'No filenames provided' });
//       }

//       console.log('ðŸ—‘ï¸ Cleanup request for files:', filenames);

//       let deletedCount = 0;
//       let notFoundCount = 0;
//       let errors = [];

//       // Baca semua file di folder uploads
//       const uploadedFiles = fs.readdirSync(uploadDir);

//       filenames.forEach(originalFilename => {
//         // Cari file yang mengandung nama original atau sama extension
//         const matchingFiles = uploadedFiles.filter(uploadedFile => {
//           // Match by original filename atau extension
//           return uploadedFile.includes(path.parse(originalFilename).name) ||
//                 (uploadedFile.endsWith(path.extname(originalFilename)) &&
//                   uploadedFile.includes('17608')); // Prefix timestamp pattern
//         });

//         if (matchingFiles.length === 0) {
//           notFoundCount++;
//           console.warn(`âš ï¸ No matching files found for: ${originalFilename}`);
//           return;
//         }

//         matchingFiles.forEach(filename => {
//           const filePath = path.join(uploadDir, filename);

//           try {
//             const stats = fs.statSync(filePath);

//             // Pastikan file dan extensionnya allowed (SHP related)
//             if (stats.isFile()) {
//               const ext = path.extname(filename).toLowerCase();
//               const allowedExtensions = ['.shp', '.shx', '.dbf', '.prj', '.cpg', '.sbn', '.sbx'];

//               if (allowedExtensions.includes(ext)) {
//                 fs.unlinkSync(filePath);
//                 deletedCount++;
//                 console.log(`ðŸ—‘ï¸ Deleted: ${filename}`);
//               } else {
//                 console.warn(`âš ï¸ Skipped (not SHP file): ${filename}`);
//               }
//             }
//           } catch (fileError) {
//             errors.push({
//               filename,
//               error: fileError.message
//             });
//             console.error(`âŒ Failed to delete ${filename}:`, fileError.message);
//           }
//         });
//       });

//       console.log(`âœ… Cleanup summary: ${deletedCount} deleted, ${notFoundCount} not found, ${errors.length} errors`);

//       res.json({
//         success: true,
//         message: `Cleanup complete: ${deletedCount} file(s) deleted`,
//         deletedCount,
//         notFoundCount,
//         errors: errors.length > 0 ? errors : undefined
//       });

//     } catch (error) {
//       console.error('âŒ Error during cleanup:', error);
//       res.status(500).json({
//         error: 'Failed to cleanup files',
//         message: error.message
//       });
//     }
//   });

//   function detectColumnType(columnName, sampleValues) {
//   const lowerName = columnName.toLowerCase();

//   // âœ… PERBAIKAN 1: Kolom khusus yang PASTI bukan serial
//   // Kolom ID dari SHP adalah INTEGER biasa, bukan auto-increment
//   if (lowerName.includes('objectid') || lowerName.includes('fid') || lowerName === 'id') {
//     return 'integer';  // Bukan serial!
//   }

//   // âœ… PERBAIKAN 2: GlobalID/UUID selalu VARCHAR (bahkan jika sample-nya angka)
//   if (lowerName.includes('globalid') || lowerName.includes('uuid') || lowerName.includes('guid')) {
//     return 'varchar(255)';  // UUID bisa jadi string atau angka di SHP
//   }

//   // Kolom tahun
//   if (lowerName.includes('tahun') || lowerName === 'year') {
//     return 'integer';
//   }

//   // Kolom measurement (luas, panjang, area, dll)
//   if (lowerName.includes('luas') || lowerName.includes('area') ||
//       lowerName.includes('panjang') || lowerName.includes('length') ||
//       lowerName.includes('shape_')) {
//     return 'numeric(15,2)';
//   }

//   // âœ… PERBAIKAN 3: Analisis sample values dengan hati-hati
//   if (!sampleValues || sampleValues.length === 0) {
//     return 'text';
//   }

//   const nonNullValues = sampleValues.filter(v => v !== null && v !== undefined && v !== '');

//   if (nonNullValues.length === 0) {
//     return 'text';
//   }

//   // Cek apakah ada nilai string panjang (>50 char) â†’ pasti text/varchar
//   const hasLongString = nonNullValues.some(v => String(v).length > 50);
//   if (hasLongString) {
//     const maxLength = Math.max(...nonNullValues.map(v => String(v).length));
//     const varcharLength = Math.min(maxLength + 50, 1000);
//     return `varchar(${varcharLength})`;
//   }

//   // Cek apakah semua nilai adalah integer
//   const allIntegers = nonNullValues.every(v => {
//     const num = Number(v);
//     return !isNaN(num) && Number.isInteger(num);
//   });

//   if (allIntegers) {
//     return 'integer';  // INTEGER biasa, BUKAN serial
//   }

//   // Cek apakah semua nilai adalah numeric (float/decimal)
//   const allNumeric = nonNullValues.every(v => !isNaN(Number(v)));

//   if (allNumeric) {
//     return 'numeric(15,2)';
//   }

//   // Default: varchar dengan panjang dinamis
//   const maxLength = Math.max(...nonNullValues.map(v => String(v).length));
//   const varcharLength = Math.min(Math.max(maxLength + 50, 100), 500);

//   return `varchar(${varcharLength})`;
// }

// // ============================================================
// // ENDPOINT 1: Analyze SHP structure untuk create table
// // ============================================================
// app.post('/api/shp/analyze-structure', multer({
//   storage: multer.memoryStorage()
// }).single('dbfFile'), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: 'No DBF file uploaded' });
//     }

//     const tempDir = path.join(__dirname, 'uploads', 'temp');
//     if (!fs.existsSync(tempDir)) {
//       fs.mkdirSync(tempDir, { recursive: true });
//     }

//     const tempFilePath = path.join(tempDir, `temp_${Date.now()}.dbf`);
//     fs.writeFileSync(tempFilePath, req.file.buffer);

//     const source = await shapefile.openDbf(tempFilePath);

//     // Read sample data (first 100 records)
//     const sampleData = [];
//     let result = await source.read();
//     let count = 0;

//     while (!result.done && count < 100) {
//       sampleData.push(result.value);
//       result = await source.read();
//       count++;
//     }

//     if (sampleData.length === 0) {
//       fs.unlinkSync(tempFilePath);
//       return res.status(400).json({ error: 'DBF file is empty' });
//     }

//     // Analyze columns
//     const columns = Object.keys(sampleData[0]);
//     const columnDefinitions = columns.map(colName => {
//       const sampleValues = sampleData.map(row => row[colName]).slice(0, 20);
//       const dataType = detectColumnType(colName, sampleValues);

//       return {
//         name: colName.toLowerCase(),
//         originalName: colName,
//         type: dataType,
//         nullable: true
//       };
//     });

//     fs.unlinkSync(tempFilePath);

//     console.log('âœ… Analyzed DBF structure:', columnDefinitions);

//     res.json({
//       columns: columnDefinitions,
//       sampleCount: sampleData.length,
//       totalColumns: columns.length
//     });

//   } catch (error) {
//     console.error('âŒ Error analyzing DBF structure:', error);
//     res.status(500).json({
//       error: 'Failed to analyze DBF structure',
//       details: error.message
//     });
//   }
// });

// // ============================================================
// // ENDPOINT 2: Create table baru di database
// // ============================================================
// app.post('/api/tables/create', express.json(), async (req, res) => {
//   try {
//     const { tableName, columns, addDefaultColumns } = req.body;

//     console.log('ðŸ“‹ Create table request:', {
//       tableName,
//       columnsCount: columns?.length || 0,
//       addDefaultColumns
//     });

//     if (!tableName || !columns || columns.length === 0) {
//       return res.status(400).json({ error: 'Missing required parameters' });
//     }

//     // Validasi nama tabel
//     const validPattern = /^[a-z][a-z0-9_]*$/;
//     if (!validPattern.test(tableName)) {
//       return res.status(400).json({
//         error: 'Invalid table name format. Must be lowercase, start with letter, contain only letters, numbers, and underscores.'
//       });
//     }

//     // Cek apakah tabel sudah ada
//     const checkQuery = `
//       SELECT table_name
//       FROM information_schema.tables
//       WHERE table_schema = DATABASE() AND table_name = $1
//     `;
//     const existing = await client.query(checkQuery, [tableName]);

//     if (existing.rows.length > 0) {
//       return res.status(400).json({
//         error: `Table '${tableName}' already exists`
//       });
//     }

//     // Build CREATE TABLE query
//     let columnDefs = [];

//     // Add default columns jika diminta
//     if (addDefaultColumns) {
//       columnDefs.push('gid serial PRIMARY KEY');
//     }

//     // Add columns dari SHP
//     columns.forEach(col => {
//       const colDef = `${col.name} ${col.type}${col.nullable ? '' : ' NOT NULL'}`;
//       columnDefs.push(colDef);
//     });

//     // Add geometry column
//     columnDefs.push('geom geometry(Geometry, 4326)');

//     const createTableQuery = `
//       CREATE TABLE ${tableName} (
//         ${columnDefs.join(',\n        ')}
//       )
//     `;

//     console.log('ðŸ”¨ Creating table with query:');
//     console.log(createTableQuery);

//     await client.query(createTableQuery);

//     // Create spatial index
//     const createIndexQuery = `
//       CREATE INDEX ${tableName}_geom_idx
//       ON ${tableName} USING GIST (geom)
//     `;

//     await client.query(createIndexQuery);

//     console.log(`âœ… Table '${tableName}' created successfully with spatial index`);

//     res.json({
//       success: true,
//       message: `Table '${tableName}' created successfully`,
//       tableName,
//       columnsCreated: columnDefs.length
//     });

//   } catch (error) {
//     console.error('âŒ Error creating table:', error);
//     res.status(500).json({
//       error: 'Failed to create table',
//       details: error.message
//     });
//   }
// });

// // ============================================================
// // ENDPOINT 3: Create table + Upload SHP (Direct)
// // ============================================================
// app.post('/api/shp/create-table-and-upload', multer({
//   storage: multer.diskStorage({
//     destination: uploadDir,
//     filename: (req, file, cb) => {
//       cb(null, Date.now() + '-' + file.originalname);
//     }
//   })
// }).array('shpFiles'), async (req, res) => {
//   let uploadedFilePaths = [];
//   let tableCreated = false;

//   try {
//     const { tableName, year, columnMapping, isNewTable } = req.body;
//     const files = req.files;

//     console.log('ðŸ†• Create table + upload request:', {
//       tableName,
//       year,
//       isNewTable,
//       filesCount: files?.length || 0
//     });

//     if (!files || files.length === 0) {
//       return res.status(400).json({ error: 'No files uploaded' });
//     }

//     uploadedFilePaths = files.map(f => f.path);

//     const mapping = JSON.parse(columnMapping);

//     const shpFile = files.find(f => f.originalname.toLowerCase().endsWith('.shp'));
//     const dbfFile = files.find(f => f.originalname.toLowerCase().endsWith('.dbf'));

//     if (!shpFile || !dbfFile) {
//       return res.status(400).json({ error: 'Missing required .shp or .dbf file' });
//     }

//     // STEP 1: Jika tabel baru, create table dulu
//     if (isNewTable === 'true') {
//       console.log('ðŸ”¨ Creating new table:', tableName);

//       // Analyze DBF untuk detect column types
//       const source = await shapefile.openDbf(dbfFile.path);
//       const firstResult = await source.read();

//       if (firstResult.done || !firstResult.value) {
//         return res.status(400).json({ error: 'DBF file is empty' });
//       }

//       // Collect sample data
//       const sampleData = [firstResult.value];
//       let nextResult = await source.read();
//       let sampleCount = 1;

//       while (!nextResult.done && sampleCount < 20) {
//         sampleData.push(nextResult.value);
//         nextResult = await source.read();
//         sampleCount++;
//       }

//       // Build column definitions
//       const columnDefs = [];

//       for (const [dbCol, mapConfig] of Object.entries(mapping)) {
//         if (dbCol === 'geom' || mapConfig.type === 'skip') continue;

//         let colType = 'text';

//         if (mapConfig.type === 'shp_column') {
//           const sampleValues = sampleData.map(row => row[mapConfig.source]);
//           colType = detectColumnType(mapConfig.source, sampleValues);
//         } else if (mapConfig.type === 'year_dropdown') {
//           colType = 'integer';
//         } else if (mapConfig.type === 'auto_generate') {
//           if (mapConfig.config.mode === 'sequence' || mapConfig.config.mode === 'continue') {
//             colType = 'integer';
//           } else {
//             colType = 'varchar(50)';
//           }
//         }

//         columnDefs.push(`${dbCol} ${colType}`);
//       }

//       // Add geometry column
//       columnDefs.push('geom geometry(Geometry, 4326)');

//       const createTableQuery = `
//         CREATE TABLE ${tableName} (
//           gid serial PRIMARY KEY,
//           ${columnDefs.join(',\n          ')}
//         )
//       `;

//       console.log('ðŸ“‹ Creating table:', createTableQuery);

//       await client.query(createTableQuery);
//       tableCreated = true;

//       // Create spatial index
//       await client.query(`
//         CREATE INDEX ${tableName}_geom_idx
//         ON ${tableName} USING GIST (geom)
//       `);

//       console.log(`âœ… Table '${tableName}' created successfully`);
//     }

//     // STEP 2: Upload data ke table
//     console.log('ðŸ“¤ Uploading data to table:', tableName);

//     const source = await shapefile.open(shpFile.path, dbfFile.path);
//     let result = await source.read();
//     let insertedCount = 0;
//     let errors = [];

//     while (!result.done) {
//       const feature = result.value;

//       if (feature && feature.geometry && feature.properties) {
//         try {
//           const columns = [];
//           const values = [];
//           const placeholders = [];
//           let paramIndex = 1;

//           for (const [dbCol, mapConfig] of Object.entries(mapping)) {
//             if (dbCol === 'geom' || !mapConfig.source || mapConfig.type === 'skip') continue;

//             columns.push(dbCol);

//             if (mapConfig.type === 'shp_column') {
//               values.push(feature.properties[mapConfig.source]);
//               placeholders.push(`$${paramIndex++}`);
//             } else if (mapConfig.type === 'year_dropdown') {
//               values.push(parseInt(year));
//               placeholders.push(`$${paramIndex++}`);
//             } else if (mapConfig.type === 'null') {
//               values.push(null);
//               placeholders.push(`$${paramIndex++}`);
//             } else if (mapConfig.type === 'auto_generate') {
//               if (mapConfig.config.mode === 'sequence') {
//                 values.push(mapConfig.config.startFrom + insertedCount * mapConfig.config.increment);
//                 placeholders.push(`$${paramIndex++}`);
//               } else if (mapConfig.config.mode === 'continue') {
//                 const maxQuery = `SELECT COALESCE(MAX(${dbCol}), 0) as max_val FROM ${tableName}`;
//                 const maxResult = await client.query(maxQuery);
//                 const maxVal = maxResult.rows[0].max_val;
//                 values.push(maxVal + mapConfig.config.increment);
//                 placeholders.push(`$${paramIndex++}`);
//               } else if (mapConfig.config.mode === 'random') {
//                 const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
//                 let randomStr = '';
//                 for (let i = 0; i < mapConfig.config.length; i++) {
//                   randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
//                 }
//                 values.push(randomStr);
//                 placeholders.push(`$${paramIndex++}`);
//               } else {
//                 values.push(null);
//                 placeholders.push(`$${paramIndex++}`);
//               }
//             } else {
//               values.push(null);
//               placeholders.push(`$${paramIndex++}`);
//             }
//           }

//           // Add geometry
//           columns.push('geom');
//           values.push(JSON.stringify(feature.geometry));
//           placeholders.push(`ST_SetSRID(ST_GeomFromGeoJSON($${paramIndex}::json), 4326)`);

//           const insertQuery = `
//             INSERT INTO ${tableName} (${columns.join(', ')})
//             VALUES (${placeholders.join(', ')})
//           `;

//           if (insertedCount === 0) {
//             console.log('='.repeat(80));
//             console.log('ðŸ” DEBUG INSERT QUERY:');
//             console.log('='.repeat(80));
//             console.log('ðŸ“‹ Table name:', tableName);
//             console.log('ðŸ“‹ Columns:', columns);
//             console.log('ðŸ“‹ Placeholders:', placeholders);
//             console.log('ðŸ“‹ Values types:', values.map((v, i) => `[${i}] ${typeof v}`));
//             console.log('ðŸ“‹ Values preview:', values.map((v, i) => {
//               if (typeof v === 'string' && v.length > 100) {
//                 return `[${i}] ${v.substring(0, 100)}... (${v.length} chars)`;
//               }
//               return `[${i}] ${v}`;
//             }));
//             console.log('ðŸ“‹ Query:', insertQuery);
//             console.log('='.repeat(80));
//           }

//           await client.query(insertQuery, values);
//           insertedCount++;

//           if (insertedCount % 10 === 0) {
//             console.log(`âœ… Inserted ${insertedCount} features...`);
//           }

//         } catch (insertError) {
//           console.error(`âŒ Error inserting feature ${insertedCount}:`, insertError.message);
//           errors.push({
//             feature: insertedCount,
//             error: insertError.message
//           });

//           if (insertedCount === 0) {
//             throw insertError;
//           }
//         }
//       }

//       result = await source.read();
//     }

//     // Clean up files
//     uploadedFilePaths.forEach(filePath => {
//       try {
//         if (fs.existsSync(filePath)) {
//           fs.unlinkSync(filePath);
//         }
//       } catch (cleanupError) {
//         console.error('Error cleaning up file:', cleanupError);
//       }
//     });

//     console.log(`âœ… Upload complete: ${insertedCount} features inserted`);

//     res.json({
//       success: true,
//       message: isNewTable === 'true'
//         ? `Table '${tableName}' created and ${insertedCount} features uploaded successfully`
//         : `Successfully uploaded ${insertedCount} features to ${tableName}`,
//       tableName,
//       tableCreated: isNewTable === 'true',
//       insertedCount,
//       errors: errors.length > 0 ? errors : undefined
//     });

//   } catch (error) {
//     console.error('âŒ Error during create table + upload:', error);

//     // Rollback: Drop table jika sudah dibuat
//     if (tableCreated && req.body.tableName) {
//       try {
//         await client.query(`DROP TABLE IF EXISTS ${req.body.tableName} CASCADE`);
//         console.log(`ðŸ”„ Rolled back: dropped table ${req.body.tableName}`);
//       } catch (rollbackError) {
//         console.error('Error during rollback:', rollbackError);
//       }
//     }

//     // Clean up files
//     uploadedFilePaths.forEach(filePath => {
//       try {
//         if (fs.existsSync(filePath)) {
//           fs.unlinkSync(filePath);
//         }
//       } catch (cleanupError) {
//         console.error('Error cleaning up file:', cleanupError);
//       }
//     });

//     res.status(500).json({
//       error: 'Failed to create table and upload',
//       details: error.message
//     });
//   }
// });

// // ============================================================
// // ENDPOINT 4: Create table + Upload dengan Simplifikasi
// // ============================================================
// app.post('/api/shp/create-table-and-simplify', multer({
//   storage: multer.diskStorage({
//     destination: uploadDir,
//     filename: (req, file, cb) => {
//       cb(null, Date.now() + '-' + file.originalname);
//     }
//   })
// }).array('shpFiles'), async (req, res) => {
//   let uploadedFilePaths = [];
//   let tableCreated = false;

//   try {
//     const {
//       tableName,
//       year,
//       columnMapping,
//       isNewTable,
//       simplificationApplied,
//       method,
//       percentage,
//       preventShapeRemoval
//     } = req.body;

//     const files = req.files;

//     console.log('ðŸ†• Create table + simplify + upload request:', {
//       tableName,
//       year,
//       isNewTable,
//       simplificationApplied,
//       method,
//       percentage: `${percentage}%`,
//       filesCount: files?.length || 0
//     });

//     if (!files || files.length === 0) {
//       return res.status(400).json({ error: 'No files uploaded' });
//     }

//     uploadedFilePaths = files.map(f => f.path);

//     const mapping = JSON.parse(columnMapping);

//     const shpFile = files.find(f => f.originalname.toLowerCase().endsWith('.shp'));
//     const dbfFile = files.find(f => f.originalname.toLowerCase().endsWith('.dbf'));

//     if (!shpFile || !dbfFile) {
//       return res.status(400).json({ error: 'Missing required .shp or .dbf file' });
//     }

//     // STEP 1: Jika tabel baru, create table dulu (sama seperti endpoint sebelumnya)
//     if (isNewTable === 'true') {
//       console.log('ðŸ”¨ Creating new table:', tableName);

//       const source = await shapefile.openDbf(dbfFile.path);
//       const firstResult = await source.read();

//       if (firstResult.done || !firstResult.value) {
//         return res.status(400).json({ error: 'DBF file is empty' });
//       }

//       const sampleData = [firstResult.value];
//       let nextResult = await source.read();
//       let sampleCount = 1;

//       while (!nextResult.done && sampleCount < 20) {
//         sampleData.push(nextResult.value);
//         nextResult = await source.read();
//         sampleCount++;
//       }

//       const columnDefs = [];

//       for (const [dbCol, mapConfig] of Object.entries(mapping)) {
//         if (dbCol === 'geom' || mapConfig.type === 'skip') continue;

//         let colType = 'text';

//         if (mapConfig.type === 'shp_column') {
//           const sampleValues = sampleData.map(row => row[mapConfig.source]);
//           colType = detectColumnType(mapConfig.source, sampleValues);
//         } else if (mapConfig.type === 'year_dropdown') {
//           colType = 'integer';
//         } else if (mapConfig.type === 'auto_generate') {
//           if (mapConfig.config.mode === 'sequence' || mapConfig.config.mode === 'continue') {
//             colType = 'integer';
//           } else {
//             colType = 'varchar(50)';
//           }
//         }

//         columnDefs.push(`${dbCol} ${colType}`);
//       }

//       columnDefs.push('geom geometry(Geometry, 4326)');

//       const createTableQuery = `
//         CREATE TABLE ${tableName} (
//           gid serial PRIMARY KEY,
//           ${columnDefs.join(',\n          ')}
//         )
//       `;

//       console.log('ðŸ“‹ Creating table:', createTableQuery);

//       await client.query(createTableQuery);
//       tableCreated = true;

//       await client.query(`
//         CREATE INDEX ${tableName}_geom_idx
//         ON ${tableName} USING GIST (geom)
//       `);

//       console.log(`âœ… Table '${tableName}' created successfully`);
//     }

//     // STEP 2: Upload data dengan simplifikasi
//     console.log('ðŸ“¤ Uploading data with simplification to table:', tableName);

//     const targetPercentage = simplificationApplied === 'true' && percentage
//       ? parseFloat(percentage)
//       : 0;

//     const source = await shapefile.open(shpFile.path, dbfFile.path);
//     let result = await source.read();
//     let insertedCount = 0;
//     let simplifiedCount = 0;
//     let errors = [];

//     let totalOriginalPoints = 0;
//     let totalSimplifiedPoints = 0;

//     while (!result.done) {
//       const feature = result.value;

//       if (feature && feature.geometry && feature.properties) {
//         try {
//           let geometryToInsert = feature.geometry;

//           // Apply simplification
//           if (simplificationApplied === 'true' && method && targetPercentage > 0) {
//             const originalPoints = getAllCoordinates(feature.geometry).length;
//             totalOriginalPoints += originalPoints;

//             if (method === 'douglas-peucker') {
//               geometryToInsert = simplifyDouglasPeuckerWithTargetPercentage(
//                 feature.geometry,
//                 targetPercentage,
//                 preventShapeRemoval === 'true'
//               );
//             } else if (method === 'visvalingam-effective' || method === 'visvalingam-weighted') {
//               const tolerance = (100 - targetPercentage) / 1000;
//               geometryToInsert = simplifyVisvalingam(
//                 feature.geometry,
//                 tolerance,
//                 preventShapeRemoval === 'true'
//               );
//             }

//             const simplifiedPoints = getAllCoordinates(geometryToInsert).length;
//             totalSimplifiedPoints += simplifiedPoints;

//             if (simplifiedPoints < originalPoints) {
//               simplifiedCount++;
//             }
//           }

//           const columns = [];
//           const values = [];
//           const placeholders = [];
//           let paramIndex = 1;

//           for (const [dbCol, mapConfig] of Object.entries(mapping)) {
//             if (dbCol === 'geom' || !mapConfig.source || mapConfig.type === 'skip') continue;

//             columns.push(dbCol);

//             if (mapConfig.type === 'shp_column') {
//               values.push(feature.properties[mapConfig.source]);
//               placeholders.push(`$${paramIndex++}`);
//             } else if (mapConfig.type === 'year_dropdown') {
//               values.push(parseInt(year));
//               placeholders.push(`$${paramIndex++}`);
//             } else if (mapConfig.type === 'null') {
//               values.push(null);
//               placeholders.push(`$${paramIndex++}`);
//             } else if (mapConfig.type === 'auto_generate') {
//               if (mapConfig.config.mode === 'sequence') {
//                 values.push(mapConfig.config.startFrom + insertedCount * mapConfig.config.increment);
//                 placeholders.push(`$${paramIndex++}`);
//               } else if (mapConfig.config.mode === 'continue') {
//                 const maxQuery = `SELECT COALESCE(MAX(${dbCol}), 0) as max_val FROM ${tableName}`;
//                 const maxResult = await client.query(maxQuery);
//                 const maxVal = maxResult.rows[0].max_val;
//                 values.push(maxVal + mapConfig.config.increment);
//                 placeholders.push(`$${paramIndex++}`);
//               } else if (mapConfig.config.mode === 'random') {
//                 const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
//                 let randomStr = '';
//                 for (let i = 0; i < mapConfig.config.length; i++) {
//                   randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
//                 }
//                 values.push(randomStr);
//                 placeholders.push(`$${paramIndex++}`);
//               } else {
//                 values.push(null);
//                 placeholders.push(`$${paramIndex++}`);
//               }
//             } else {
//               values.push(null);
//               placeholders.push(`$${paramIndex++}`);
//             }
//           }

//           columns.push('geom');
//           values.push(JSON.stringify(geometryToInsert));
//           placeholders.push(`ST_SetSRID(ST_GeomFromGeoJSON($${paramIndex}::json), 4326)`);

//           const insertQuery = `
//             INSERT INTO ${tableName} (${columns.join(', ')})
//             VALUES (${placeholders.join(', ')})
//           `;

//           await client.query(insertQuery, values);
//           insertedCount++;

//           if (insertedCount % 10 === 0) {
//             console.log(`âœ… Inserted ${insertedCount} features...`);
//           }

//         } catch (insertError) {
//           console.error(`âŒ Error inserting feature ${insertedCount}:`, insertError.message);
//           errors.push({
//             feature: insertedCount,
//             error: insertError.message
//           });

//           if (insertedCount === 0) {
//             throw insertError;
//           }
//         }
//       }

//       result = await source.read();
//     }

//     // Clean up files
//     uploadedFilePaths.forEach(filePath => {
//       try {
//         if (fs.existsSync(filePath)) {
//           fs.unlinkSync(filePath);
//         }
//       } catch (cleanupError) {
//         console.error('Error cleaning up file:', cleanupError);
//       }
//     });

//     let overallReduction = 0;
//     if (simplificationApplied === 'true' && totalOriginalPoints > 0) {
//       overallReduction = ((totalOriginalPoints - totalSimplifiedPoints) / totalOriginalPoints * 100);
//     }

//     console.log(`âœ… Upload complete:`, {
//       inserted: insertedCount,
//       simplified: simplifiedCount,
//       errors: errors.length,
//       tableCreated: isNewTable === 'true'
//     });

//     const responseMessage = isNewTable === 'true'
//       ? `Table '${tableName}' created and ${insertedCount} features uploaded successfully${simplificationApplied === 'true' ? ` (${simplifiedCount} features simplified, ${overallReduction.toFixed(1)}% overall reduction)` : ''}`
//       : `Successfully uploaded ${insertedCount} features to ${tableName}${simplificationApplied === 'true' ? ` (${simplifiedCount} features simplified)` : ''}`;

//     res.json({
//       success: true,
//       message: responseMessage,
//       tableName,
//       tableCreated: isNewTable === 'true',
//       insertedCount,
//       simplifiedCount: simplificationApplied === 'true' ? simplifiedCount : 0,
//       simplificationApplied: simplificationApplied === 'true',
//       ...(simplificationApplied === 'true' && {
//         simplificationDetails: {
//           targetPercentage: `${targetPercentage}%`,
//           totalOriginalPoints,
//           totalSimplifiedPoints,
//           overallReduction: `${overallReduction.toFixed(1)}%`,
//           method
//         }
//       }),
//       errors: errors.length > 0 ? errors : undefined
//     });

//   } catch (error) {
//     console.error('âŒ Error during create table + simplify + upload:', error);

//     // Rollback: Drop table jika sudah dibuat
//     if (tableCreated && req.body.tableName) {
//       try {
//         await client.query(`DROP TABLE IF EXISTS ${req.body.tableName} CASCADE`);
//         console.log(`ðŸ”„ Rolled back: dropped table ${req.body.tableName}`);
//       } catch (rollbackError) {
//         console.error('Error during rollback:', rollbackError);
//       }
//     }

//     // Clean up files
//     uploadedFilePaths.forEach(filePath => {
//       try {
//         if (fs.existsSync(filePath)) {
//           fs.unlinkSync(filePath);
//         }
//       } catch (cleanupError) {
//         console.error('Error cleaning up file:', cleanupError);
//       }
//     });

//     res.status(500).json({
//       error: 'Failed to create table with simplification and upload',
//       details: error.message
//     });
//   }
// });

// const kegiatanStorage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     if (file.fieldname === 'dokumen_terkait') {
//       const docDir = path.join(__dirname, 'uploads/documents');
//       if (!fs.existsSync(docDir)) {
//         fs.mkdirSync(docDir, { recursive: true });
//       }
//       cb(null, docDir);
//     } else {
//       const imgDir = path.join(__dirname, 'uploads/images');
//       if (!fs.existsSync(imgDir)) {
//         fs.mkdirSync(imgDir, { recursive: true });
//       }
//       cb(null, imgDir);
//     }
//   },
//   filename: (req, file, cb) => {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//     cb(null, uniqueSuffix + path.extname(file.originalname));
//   }
// });

// const kegiatanUpload = multer({
//   storage: kegiatanStorage,
//   limits: { fileSize: 10 * 1024 * 1024 }
// });

// const uploadKegiatanFields = kegiatanUpload.fields([
//   { name: 'dokumen_terkait', maxCount: 5 },
//   { name: 'foto_dokumentasi', maxCount: 5 },
//   { name: 'peta_awal', maxCount: 1 },
//   { name: 'peta_setelah', maxCount: 1 },
//   { name: 'peta_kerentanan', maxCount: 1 }
// ]);

// // Ganti endpoint GET /api/rekomendasi yang sudah ada dengan ini:
// app.get('/api/rekomendasi', async (req, res) => {
//   try {
//     const result = await client.query(`
//       SELECT
//         r.id,
//         r.provinsi,
//         r.kabupaten,
//         r.kecamatan,
//         r.das,
//         r.sub_das,
//         r.banjir,
//         r.longsor,
//         r.kebakaran_hutan,
//         r.kerawanan,
//         r.created_at,
//         r.updated_at,
//         k.id as kegiatan_id,
//         CASE WHEN k.id IS NOT NULL THEN TRUE ELSE FALSE END as has_kegiatan
//       FROM rekomendasi_mitigasi_adaptasi r
//       LEFT JOIN kegiatan_mitigasi k ON r.id = k.rekomendasi_id
//       ORDER BY r.created_at DESC
//     `);
//     res.json(result.rows);
//   } catch (error) {
//     console.error('Error fetching rekomendasi:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// // POST: Buat rekomendasi baru
// app.post('/api/rekomendasi', express.json(), async (req, res) => {
//   const { provinsi, kabupaten, kecamatan, das, sub_das, banjir, longsor, kebakaran_hutan, kerawanan } = req.body;

//   if (!provinsi || !kabupaten || !kecamatan || !das) {
//     return res.status(400).json({ error: 'Field wajib tidak lengkap' });
//   }

//   try {
//     const result = await client.query(`
//       INSERT INTO rekomendasi_mitigasi_adaptasi
//         (provinsi, kabupaten, kecamatan, das, sub_das, banjir, longsor, kebakaran_hutan, kerawanan)
//       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
//       RETURNING *
//     `, [provinsi, kabupaten, kecamatan, das, sub_das, banjir, longsor, kebakaran_hutan, kerawanan]);

//     res.status(201).json(result.rows[0]);
//   } catch (error) {
//     console.error('Error creating rekomendasi:', error);
//     res.status(500).json({ error: 'Failed to create rekomendasi', details: error.message });
//   }
// });

// // PUT: Edit rekomendasi
// app.put('/api/rekomendasi/:id', express.json(), async (req, res) => {
//   const { id } = req.params;
//   const { provinsi, kabupaten, kecamatan, das, sub_das, banjir, longsor, kebakaran_hutan, kerawanan } = req.body;
//   try {
//     const result = await client.query(`
//       UPDATE rekomendasi_mitigasi_adaptasi
//       SET provinsi = $1, kabupaten = $2, kecamatan = $3, das = $4, sub_das = $5,
//           banjir = $6, longsor = $7, kebakaran_hutan = $8, kerawanan = $9,
//           updated_at = CURRENT_TIMESTAMP
//       WHERE id = $10
//       RETURNING *
//     `, [provinsi, kabupaten, kecamatan, das, sub_das, banjir, longsor, kebakaran_hutan, kerawanan, id]);
//     if (result.rows.length === 0) {
//       return res.status(404).json({ error: 'Rekomendasi not found' });
//     }
//     res.json(result.rows[0]);
//   } catch (error) {
//     console.error('Error updating rekomendasi:', error);
//     res.status(500).json({ error: 'Failed to update rekomendasi' });
//   }
// });

// // DELETE: Hapus rekomendasi (otomatis hapus kegiatan terkait karena ON DELETE CASCADE)
// app.delete('/api/rekomendasi/:id', async (req, res) => {
//   const { id } = req.params;
//   try {
//     const result = await client.query(`
//       DELETE FROM rekomendasi_mitigasi_adaptasi
//       WHERE id = $1
//       RETURNING id
//     `, [id]);
//     if (result.rows.length === 0) {
//       return res.status(404).json({ error: 'Rekomendasi not found' });
//     }
//     res.json({ success: true, message: 'Rekomendasi deleted' });
//   } catch (error) {
//     console.error('Error deleting rekomendasi:', error);
//     res.status(500).json({ error: 'Failed to delete rekomendasi' });
//   }
// });

// // GET: Detail kegiatan by ID
// app.get('/api/kegiatan-mitigasi/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const result = await client.query(`
//       SELECT * FROM kegiatan_mitigasi WHERE id = $1
//     `, [id]);

//     if (result.rows.length === 0) {
//       return res.status(404).json({ error: 'Kegiatan tidak ditemukan' });
//     }

//     const kegiatan = result.rows[0];
//     res.json(kegiatan);
//   } catch (error) {
//     console.error('Error fetching kegiatan:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// // POST: Create kegiatan
// // POST: Create kegiatan
// app.post('/api/kegiatan-mitigasi', uploadKegiatanFields, async (req, res) => {
//   try {
//     const { rekomendasi_id, metode, analisis, monev } = req.body;

//     // Check if rekomendasi already has kegiatan
//     const checkQuery = await client.query(
//       'SELECT id FROM kegiatan_mitigasi WHERE rekomendasi_id = $1',
//       [rekomendasi_id]
//     );

//     if (checkQuery.rows.length > 0) {
//       return res.status(400).json({ error: 'Rekomendasi ini sudah memiliki kegiatan' });
//     }

//     // âœ… Process files dengan path yang benar
//     const dokumenTerkait = req.files['dokumen_terkait']
//       ? req.files['dokumen_terkait'].map(f => `/uploads/documents/${f.filename}`)  // âœ… Ubah path
//       : [];

//     const fotoDokumentasi = req.files['foto_dokumentasi']
//       ? req.files['foto_dokumentasi'].map(f => `/uploads/images/${f.filename}`)  // âœ… Ubah path
//       : [];

//     const petaAwal = req.files['peta_awal']
//       ? `/uploads/images/${req.files['peta_awal'][0].filename}`  // âœ… Ubah path
//       : null;

//     const petaSetelah = req.files['peta_setelah']
//       ? `/uploads/images/${req.files['peta_setelah'][0].filename}`  // âœ… Ubah path
//       : null;

//     const petaKerentanan = req.files['peta_kerentanan']
//       ? `/uploads/images/${req.files['peta_kerentanan'][0].filename}`  // âœ… Ubah path
//       : null;

//     // Insert into database
//     const insertQuery = `
//       INSERT INTO kegiatan_mitigasi
//       (rekomendasi_id, metode, analisis, monev, dokumen_terkait, foto_dokumentasi,
//        peta_awal, peta_setelah, peta_kerentanan)
//       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
//       RETURNING *
//     `;

//     const result = await client.query(insertQuery, [
//       rekomendasi_id,
//       metode,
//       analisis,
//       monev,
//       JSON.stringify(dokumenTerkait),
//       JSON.stringify(fotoDokumentasi),
//       petaAwal,
//       petaSetelah,
//       petaKerentanan
//     ]);

//     res.status(201).json(result.rows[0]);
//   } catch (error) {
//     console.error('Error creating kegiatan:', error);
//     res.status(500).json({ error: 'Gagal membuat kegiatan' });
//   }
// });

// // PUT: Update kegiatan
// // PUT: Update kegiatan
// app.put('/api/kegiatan-mitigasi/:id', uploadKegiatanFields, async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { metode, analisis, monev } = req.body;

//     // Get existing kegiatan
//     const existingResult = await client.query(
//       'SELECT * FROM kegiatan_mitigasi WHERE id = $1',
//       [id]
//     );

//     if (existingResult.rows.length === 0) {
//       return res.status(404).json({ error: 'Kegiatan tidak ditemukan' });
//     }

//     const existingKegiatan = existingResult.rows[0];

//     // âœ… Process files dengan path yang benar
//     const dokumenTerkait = req.files['dokumen_terkait']
//       ? req.files['dokumen_terkait'].map(f => `/uploads/documents/${f.filename}`)  // âœ… Ubah path
//       : (existingKegiatan.dokumen_terkait ? JSON.parse(existingKegiatan.dokumen_terkait) : []);

//     const fotoDokumentasi = req.files['foto_dokumentasi']
//       ? req.files['foto_dokumentasi'].map(f => `/uploads/images/${f.filename}`)  // âœ… Ubah path
//       : (existingKegiatan.foto_dokumentasi ? JSON.parse(existingKegiatan.foto_dokumentasi) : []);

//     const petaAwal = req.files['peta_awal']
//       ? `/uploads/images/${req.files['peta_awal'][0].filename}`  // âœ… Ubah path
//       : existingKegiatan.peta_awal;

//     const petaSetelah = req.files['peta_setelah']
//       ? `/uploads/images/${req.files['peta_setelah'][0].filename}`  // âœ… Ubah path
//       : existingKegiatan.peta_setelah;

//     const petaKerentanan = req.files['peta_kerentanan']
//       ? `/uploads/images/${req.files['peta_kerentanan'][0].filename}`  // âœ… Ubah path
//       : existingKegiatan.peta_kerentanan;

//     // Update database
//     const updateQuery = `
//       UPDATE kegiatan_mitigasi
//       SET metode = $1, analisis = $2, monev = $3,
//           dokumen_terkait = $4, foto_dokumentasi = $5,
//           peta_awal = $6, peta_setelah = $7, peta_kerentanan = $8,
//           updated_at = CURRENT_TIMESTAMP
//       WHERE id = $9
//       RETURNING *
//     `;

//     const result = await client.query(updateQuery, [
//       metode,
//       analisis,
//       monev,
//       JSON.stringify(dokumenTerkait),
//       JSON.stringify(fotoDokumentasi),
//       petaAwal,
//       petaSetelah,
//       petaKerentanan,
//       id
//     ]);

//     res.json(result.rows[0]);
//   } catch (error) {
//     console.error('Error updating kegiatan:', error);
//     res.status(500).json({ error: 'Gagal mengupdate kegiatan' });
//   }
// });

// // DELETE: Delete kegiatan
// app.delete('/api/kegiatan-mitigasi/:id', async (req, res) => {
//   try {
//     const { id } = req.params;

//     // Get kegiatan data untuk hapus files
//     const kegiatanResult = await client.query(
//       'SELECT * FROM kegiatan_mitigasi WHERE id = $1',
//       [id]
//     );

//     if (kegiatanResult.rows.length === 0) {
//       return res.status(404).json({ error: 'Kegiatan tidak ditemukan' });
//     }

//     const kegiatan = kegiatanResult.rows[0];

//     // Delete files from disk (optional, untuk cleanup)
//     const deleteFile = (filePath) => {
//       if (filePath) {
//         const fullPath = path.join(__dirname, 'uploads', filePath);
//         if (fs.existsSync(fullPath)) {
//           fs.unlinkSync(fullPath);
//         }
//       }
//     };

//     // Delete dokumen terkait
//     if (kegiatan.dokumen_terkait) {
//       const docs = typeof kegiatan.dokumen_terkait === 'string'
//         ? JSON.parse(kegiatan.dokumen_terkait)
//         : kegiatan.dokumen_terkait;
//       docs.forEach(deleteFile);
//     }

//     // Delete foto dokumentasi
//     if (kegiatan.foto_dokumentasi) {
//       const photos = typeof kegiatan.foto_dokumentasi === 'string'
//         ? JSON.parse(kegiatan.foto_dokumentasi)
//         : kegiatan.foto_dokumentasi;
//       photos.forEach(deleteFile);
//     }

//     // Delete peta files
//     deleteFile(kegiatan.peta_awal);
//     deleteFile(kegiatan.peta_setelah);
//     deleteFile(kegiatan.peta_kerentanan);

//     // Delete from database
//     await client.query('DELETE FROM kegiatan_mitigasi WHERE id = $1', [id]);

//     res.json({ success: true, message: 'Kegiatan berhasil dihapus' });
//   } catch (error) {
//     console.error('Error deleting kegiatan:', error);
//     res.status(500).json({ error: 'Gagal menghapus kegiatan' });
//   }
// });

// app.get('/api/kejadian-photos-by-location', async (req, res) => {
//   try {
//     const { disaster_type, level, location_name } = req.query;

//     console.log('ðŸ“¸ Fetching photos for:', { disaster_type, level, location_name });

//     if (!disaster_type || !level || !location_name) {
//       return res.status(400).json({ error: 'Missing required parameters' });
//     }

//     let query = `
//       SELECT id, images_paths, thumbnail_path
//       FROM kejadian
//       WHERE disaster_type = $1
//     `;
//     const params = [disaster_type];

//     // PENTING: Gunakan UPPER() dan TRIM() untuk konsistensi dengan risk-analysis
//     if (level === 'Indonesia') {
//       // Untuk Indonesia, tidak ada filter lokasi tambahan
//       console.log('ðŸ“ Level: Indonesia - fetching all kejadian for disaster type');
//     } else if (level === 'provinsi') {
//       // Case-insensitive comparison untuk provinsi
//       query += ` AND UPPER(TRIM(provinsi)) = UPPER(TRIM($2))`;
//       params.push(location_name);
//       console.log('ðŸ“ Level: provinsi -', location_name);
//     } else if (level === 'Provinsi') {
//       query += ` AND UPPER(TRIM(provinsi)) = UPPER(TRIM($2))`;
//       params.push(location_name);
//       console.log('ðŸ“ Level: Provinsi -', location_name);
//     } else if (level === 'kabupaten') {
//       query += ` AND UPPER(TRIM(kabupaten)) = UPPER(TRIM($2))`;
//       params.push(location_name);
//       console.log('ðŸ“ Level: kabupaten -', location_name);
//     } else if (level === 'Kabupaten/Kota') {
//       query += ` AND UPPER(TRIM(kabupaten)) = UPPER(TRIM($2))`;
//       params.push(location_name);
//       console.log('ðŸ“ Level: Kabupaten/Kota -', location_name);
//     } else if (level === 'kecamatan') {
//       query += ` AND UPPER(TRIM(kecamatan)) = UPPER(TRIM($2))`;
//       params.push(location_name);
//       console.log('ðŸ“ Level: kecamatan -', location_name);
//     } else if (level === 'Kecamatan') {
//       query += ` AND UPPER(TRIM(kecamatan)) = UPPER(TRIM($2))`;
//       params.push(location_name);
//       console.log('ðŸ“ Level: Kecamatan -', location_name);
//     } else if (level === 'kelurahan') {
//       query += ` AND UPPER(TRIM(kelurahan)) = UPPER(TRIM($2))`;
//       params.push(location_name);
//       console.log('ðŸ“ Level: kelurahan -', location_name);
//     } else if (level === 'Kelurahan/Desa') {
//       query += ` AND UPPER(TRIM(kelurahan)) = UPPER(TRIM($2))`;
//       params.push(location_name);
//       console.log('ðŸ“ Level: Kelurahan/Desa -', location_name);
//     } else {
//       return res.status(400).json({ error: 'Invalid level: ' + level });
//     }

//     console.log('ðŸ” Executing query:', query);
//     console.log('ðŸ“‹ With params:', params);

//     const result = await client.query(query, params);

//     console.log(`âœ… Found ${result.rows.length} kejadian records`);

//     // Kumpulkan semua foto dari kejadian-kejadian tersebut
//     const allPhotos = [];
//     result.rows.forEach((row, index) => {
//       console.log(`Kejadian ${row.id}:`, {
//         thumbnail: row.thumbnail_path,
//         images_count: row.images_paths ? row.images_paths.length : 0
//       });

//       // Tambahkan thumbnail jika ada
//       if (row.thumbnail_path) {
//         // Jika thumbnail_path sudah berisi full path (e.g., /uploads/xxx.jpg)
//         if (row.thumbnail_path.startsWith('/uploads/')) {
//           allPhotos.push(row.thumbnail_path);
//         } else {
//           // Jika hanya filename, tambahkan prefix /uploads/
//           allPhotos.push(`/uploads/${row.thumbnail_path}`);
//         }
//       }

//       // Tambahkan semua images dari images_paths
//       if (row.images_paths && Array.isArray(row.images_paths)) {
//         row.images_paths.forEach(imgPath => {
//           // Sama seperti thumbnail, pastikan path benar
//           if (imgPath.startsWith('/uploads/')) {
//             allPhotos.push(imgPath);
//           } else {
//             allPhotos.push(`/uploads/${imgPath}`);
//           }
//         });
//       }
//     });

//     console.log(`ðŸ“· Returning ${allPhotos.length} photos:`, allPhotos.slice(0, 3), '...');
//     res.json({ photos: allPhotos });
//   } catch (error) {
//     console.error('âŒ Error fetching kejadian photos:', error);
//     res.status(500).json({ error: 'Internal server error', details: error.message });
//   }
// });

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("âœ… Created uploads directory");
}

// Konfigurasi Multer untuk upload file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
    );
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Max 10MB per file
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

// Serve static files dari folder uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const createKejadianTable = async () => {
  const createTableSQL = `
    -- KEJADIAN TABLE (Struktur Sederhana)
    CREATE TABLE IF NOT EXISTS kejadian (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      category VARCHAR(50) NOT NULL CHECK (category IN ('Banjir', 'Kebakaran Hutan dan Kekeringan', 'Tanah Longsor dan Erosi', 'Gempa Bumi')),
      date DATE NOT NULL,
      location TEXT NOT NULL,
      das VARCHAR(100),
      longitude DOUBLE PRECISION NOT NULL,
      latitude DOUBLE PRECISION NOT NULL,
      curah_hujan DOUBLE PRECISION,
      featured BOOLEAN DEFAULT true,
      thumbnail_path VARCHAR(500),
      images_paths TEXT[],
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_kejadian_category ON kejadian(category);
    CREATE INDEX IF NOT EXISTS idx_kejadian_date ON kejadian(date);
    CREATE INDEX IF NOT EXISTS idx_kejadian_featured ON kejadian(featured);

    -- TRIGGER untuk auto-update updated_at
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS update_kejadian_updated_at ON kejadian;
    CREATE TRIGGER update_kejadian_updated_at
        BEFORE UPDATE ON kejadian
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
  `;

  try {
    await client.query(createTableSQL);
    console.log("âœ… Kejadian table created successfully");
  } catch (error) {
    console.error("âŒ Error creating kejadian table:", error);
  }
};

const createLayerMetadataTable = async () => {
  const createTableSQL = `
    -- LAYER METADATA TABLE
    CREATE TABLE IF NOT EXISTS layer_metadata (
      id SERIAL PRIMARY KEY,
      table_name VARCHAR(255) NOT NULL UNIQUE,
      section VARCHAR(50) NOT NULL CHECK (section IN ('kerawanan', 'mitigasiAdaptasi', 'lainnya', 'kejadian')),
      original_files TEXT[],
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_layer_metadata_section ON layer_metadata(section);
    CREATE INDEX IF NOT EXISTS idx_layer_metadata_created_at ON layer_metadata(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_layer_metadata_table_name ON layer_metadata(table_name);

    -- TRIGGER untuk auto-update updated_at
    CREATE OR REPLACE FUNCTION update_layer_metadata_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS update_layer_metadata_updated_at ON layer_metadata;
    CREATE TRIGGER update_layer_metadata_updated_at
        BEFORE UPDATE ON layer_metadata
        FOR EACH ROW
        EXECUTE FUNCTION update_layer_metadata_updated_at();
  `;

  try {
    await client.query(createTableSQL);
    console.log("âœ… Layer metadata table created successfully");
  } catch (error) {
    console.error("âŒ Error creating layer metadata table:", error);
  }
};

pool
  .query("SELECT current_database() AS database, current_user AS user")
  .then((result) => {
    console.log("========================================");
    console.log("âœ… PostgreSQL connected");
    console.log("Database :", result.rows[0].database);
    console.log("User     :", result.rows[0].user);
    console.log("Host     :", process.env.DB_HOST);
    console.log("Port     :", process.env.DB_PORT);
    console.log("========================================");
  })
  .catch((err) => {
    console.error("âŒ PostgreSQL connection error:");
    console.error(err.message);
  });

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD_HASH =
  process.env.ADMIN_PASSWORD_HASH ||
  "ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f"; // Hash dari 'password123'
const JWT_SECRET =
  process.env.JWT_SECRET || "your_secret_key_change_in_production";

// Helper function untuk hash password
const hashPassword = (password) => {
  return crypto.createHash("sha256").update(password).digest("hex");
};

// Helper function untuk generate JWT token
const generateToken = (username) => {
  return jwt.sign(
    {
      username,
      role: "admin",
      iat: Date.now(),
    },
    JWT_SECRET,
    { expiresIn: "24h" },
  );
};

// Middleware untuk verify JWT token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Format: "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access token required",
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    req.user = decoded;
    next();
  });
};

// ============================================================
// ENTERPRISE LAYER AUTHORIZATION HELPERS
// ============================================================

function getBearerToken(req) {
  const authHeader =
    req.headers?.authorization || req.headers?.Authorization || "";
  if (!authHeader || !/^Bearer\s+/i.test(authHeader)) return null;
  return authHeader.replace(/^Bearer\s+/i, "").trim() || null;
}

function getDecodedToken(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

function isPrivilegedLayerToken(user) {
  if (!user) return false;

  const role = String(user.role || "").trim().toLowerCase();
  const roleName = String(user.role_name || "").trim().toLowerCase();
  const roleId = Number(user.role_id);

  return (
    role === "admin" ||
    role === "administrator" ||
    role === "super admin" ||
    role === "super administrator" ||
    roleName === "admin" ||
    roleName === "administrator" ||
    roleName === "super admin" ||
    roleName === "super administrator" ||
    roleId === 1 ||
    roleId === 2
  );
}

async function getAuthorizedLayerIds(req, db = pool) {
  const user = getDecodedToken(req);

  // STRICT AUTHORIZATION: tanpa token tidak boleh mendapatkan katalog layer.
  // Hanya token privileged (admin/super admin) atau can_view=true yang boleh melihat layer.
  if (!user) return new Set();

  if (isPrivilegedLayerToken(user)) return "ALL";

  const userId = Number(user.id ?? user.user_id ?? user.userId);
  if (!Number.isInteger(userId) || userId <= 0) return new Set();

  const result = await db.query(
    `SELECT layer_id FROM user_layer_authorizations WHERE user_id = $1 AND can_view = TRUE`,
    [userId],
  );

  return new Set(result.rows.map((row) => Number(row.layer_id)));
}

async function authorizeLayerByTable(req, tableName, db = pool) {
  const decoded = getDecodedToken(req);

  if (!decoded) {
    const token = getBearerToken(req);
    if (token) {
      return { ok: false, status: 403, message: "Invalid atau expired token." };
    }
    return {
      ok: false,
      status: 401,
      message: "Access token required untuk mengakses layer.",
    };
  }

  if (isPrivilegedLayerToken(decoded)) {
    return { ok: true, user: decoded, privileged: true };
  }

  const userId = Number(decoded.id ?? decoded.user_id ?? decoded.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return {
      ok: false,
      status: 403,
      message: "User ID pada token tidak valid.",
    };
  }

  const metadata = await db.query(
    `SELECT id, table_name, section FROM layer_metadata WHERE LOWER(table_name) = LOWER($1) LIMIT 1`,
    [tableName],
  );

  // STRICT MODE: layer harus terdaftar di layer_metadata agar dapat diberi can_view.
  // Layer yang tidak memiliki metadata tidak dianggap authorized.
  if (!metadata.rowCount) {
    return {
      ok: false,
      status: 403,
      message: `Layer "${tableName}" belum memiliki authorization metadata.`,
    };
  }

  const layer = metadata.rows[0];
  const permission = await db.query(
    `SELECT can_view, can_query, can_export, can_download, can_manage
     FROM user_layer_authorizations
     WHERE user_id = $1 AND layer_id = $2
     LIMIT 1`,
    [userId, layer.id],
  );

  if (!permission.rowCount || permission.rows[0].can_view !== true) {
    return {
      ok: false,
      status: 403,
      message: `Anda tidak memiliki izin View untuk layer "${layer.table_name}".`,
      layer,
    };
  }

  return {
    ok: true,
    user: decoded,
    layer,
    permissions: permission.rows[0],
  };
}

// ============================================
// ROUTES
// ============================================

// 1. Login Route - Autentikasi Admin
app.post("/api/admin/login", (req, res) => {
  try {
    const { username, password } = req.body;

    // Validasi input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    // Hash password input
    const passwordHash = hashPassword(password);

    // Verify credentials
    if (username === ADMIN_USERNAME && passwordHash === ADMIN_PASSWORD_HASH) {
      // Generate JWT token
      const token = generateToken(username);

      return res.json({
        success: true,
        message: "Login successful",
        token,
        user: {
          username,
          role: "admin",
        },
      });
    } else {
      // Invalid credentials
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ============================================================
// POST /api/login
// LOGIN USER DARI DATABASE
// ============================================================
app.post("/api/login", async (req, res) => {
  try {
    console.log("\n================ LOGIN DEBUG ================");
    console.log("1. Request body:", {
      username: req.body?.username,
      hasPassword: !!req.body?.password,
      hasRecaptchaToken: !!req.body?.recaptchaToken,
    });

    const { username, password, recaptchaToken } = req.body;

    // --------------------------------------------------------
    // VALIDASI INPUT
    // --------------------------------------------------------

    if (!username || !password) {
      console.log("âŒ STOP 1: username/password kosong");

      return res.status(400).json({
        success: false,
        message: "Username/email dan password wajib diisi.",
      });
    }

    // --------------------------------------------------------
    // LOGIN
    // --------------------------------------------------------

    const login = String(username).trim().toLowerCase();

    console.log("4. Login identifier:", login);

    // --------------------------------------------------------
    // DATABASE
    // --------------------------------------------------------

    console.log("5. Querying user database...");

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.username,
        u.email,
        u.password_hash,
        u.full_name,
        u.phone,
        u.role_id,
        r.name AS role_name,
        r.description AS role_description,
        u.organization_id,
        u.unit_id,
        u.status,
        u.avatar,
        u.last_login,
        u.created_at,
        u.updated_at
      FROM public.users u
      LEFT JOIN public.master_role r
        ON r.id = u.role_id
      WHERE LOWER(u.username) = $1
         OR LOWER(u.email) = $1
      LIMIT 1
      `,
      [login],
    );

    console.log("6. Database result:", {
      rowCount: result.rows.length,
    });

    if (result.rows.length === 0) {
      console.log("âŒ STOP 4: user tidak ditemukan");

      return res.status(401).json({
        success: false,
        message: "Username/email atau password tidak valid.",
      });
    }

    const user = result.rows[0];

    console.log("7. User ditemukan:", {
      id: user.id,
      username: user.username,
      email: user.email,
      role_id: user.role_id,
      role_name: user.role_name,
      status: user.status,
      hasPasswordHash: !!user.password_hash,
    });

    // --------------------------------------------------------
    // STATUS
    // --------------------------------------------------------

    if (user.status !== "active") {
      console.log("âŒ STOP 5: status user =", user.status);

      return res.status(403).json({
        success: false,
        message: "Akun Anda tidak aktif. Silakan hubungi administrator.",
      });
    }

    // --------------------------------------------------------
    // BCRYPT
    // --------------------------------------------------------

    console.log("8. Checking password...");

    const bcrypt = require("bcryptjs");

    const passwordValid = await bcrypt.compare(password, user.password_hash);

    console.log("9. Password result:", passwordValid);

    if (!passwordValid) {
      console.log("âŒ STOP 6: password salah");

      return res.status(401).json({
        success: false,
        message: "Username/email atau password tidak valid.",
      });
    }

    // --------------------------------------------------------
    // LAST LOGIN
    // --------------------------------------------------------

    console.log("10. Updating last_login...");

    await pool.query(
      `
      UPDATE public.users
      SET last_login = NOW()
      WHERE id = $1
      `,
      [user.id],
    );

    console.log("11. last_login updated");

    // --------------------------------------------------------
    // JWT
    // --------------------------------------------------------

    console.log("12. Generating JWT...");

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role_id: user.role_id,
        role_name: user.role_name,
        role_description: user.role_description,
        organization_id: user.organization_id,
        unit_id: user.unit_id,
      },
      JWT_SECRET,
      {
        expiresIn: "24h",
      },
    );

    console.log("13. JWT generated");

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    console.log("14. LOGIN SUCCESS:", user.username);
    console.log("============================================\n");

    return res.json({
      success: true,
      message: "Login berhasil.",
      token,

      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,

        role_id: user.role_id,
        role_name: user.role_name,
        role_description: user.role_description,

        organization_id: user.organization_id,
        unit_id: user.unit_id,

        status: user.status,
        avatar: user.avatar,
        last_login: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("\nâŒâŒâŒ LOGIN CRASH âŒâŒâŒ");
    console.error("Message:", error.message);
    console.error("Name:", error.name);
    console.error("Stack:", error.stack);
    console.error("============================================\n");

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
      error: error.message,
    });
  }
});
// 2. Verify Token Route - Check apakah token masih valid
app.get("/api/admin/verify", verifyToken, (req, res) => {
  res.json({
    success: true,
    message: "Token is valid",
    user: {
      username: req.user.username,
      role: req.user.role,
    },
  });
});

// 3. Logout Route (optional - bisa handle di frontend saja)
app.post("/api/admin/logout", verifyToken, (req, res) => {
  // Dalam implementasi JWT, logout biasanya di-handle di frontend
  // dengan menghapus token dari localStorage
  // Backend hanya verify bahwa request datang dari valid token

  res.json({
    success: true,
    message: "Logout successful",
  });
});

// 4. Protected Route Example - Tambah Kejadian
app.post(
  "/api/kejadian/add",
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "images", maxCount: 15 },
  ]),
  async (req, res) => {
    try {
      const {
        title,
        category,
        incidentDate,
        location,
        das,
        longitude,
        latitude,
        curahHujan,
        featured,
        description,
      } = req.body;

      // Validasi required fields
      if (
        !title ||
        !category ||
        !incidentDate ||
        !location ||
        !longitude ||
        !latitude
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Field wajib: title, category, incidentDate, location, longitude, latitude",
        });
      }

      // Get file paths
      const thumbnailPath = req.files?.thumbnail
        ? `/uploads/${req.files.thumbnail[0].filename}`
        : null;
      const imagesPaths = req.files?.images
        ? req.files.images.map((file) => `/uploads/${file.filename}`)
        : [];

      const insertQuery = `
      INSERT INTO kejadian (
        title, category, date, location, das, 
        longitude, latitude, curah_hujan, featured, description,
        thumbnail_path, images_paths
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

      const values = [
        title,
        category,
        incidentDate,
        location,
        das || null,
        parseFloat(longitude),
        parseFloat(latitude),
        curahHujan ? parseFloat(curahHujan) : null,
        featured !== undefined ? featured : true,
        description || null,
        thumbnailPath,
        imagesPaths,
      ];

      const result = await client.query(insertQuery, values);

      res.json({
        success: true,
        message: "Kejadian berhasil ditambahkan",
        data: result.rows[0],
      });
    } catch (err) {
      console.error("=== GEOJSON ERROR ===");
      console.error(err);
      console.error(err.stack);

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  },
);

// Endpoint untuk fetch tutupan lahan berdasarkan koordinat
app.get("/api/tutupan-lahan/by-coordinates", async (req, res) => {
  try {
    const { longitude, latitude } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({
        error: "Missing required parameters: longitude, latitude",
      });
    }

    console.log("Fetching tutupan lahan for coordinates:", {
      longitude,
      latitude,
    });

    // Query dengan JOIN ke mapping_penutupan_lahan untuk deskripsi DAN sum luas_ha
    // Cast both sides untuk ensure matching
    const query = `
      SELECT 
        tl.pl2024_id,
        COALESCE(mpl.deskripsi_domain, 'Tutupan Lahan ' || tl.pl2024_id::text) as deskripsi_domain,
        COUNT(*) as count,
        SUM(tl.luas_ha) as total_luas_ha
      FROM tutupan_lahan tl
      LEFT JOIN mapping_penutupan_lahan mpl 
        ON tl.pl2024_id::text = mpl.kode_domain::text
      WHERE ST_Intersects(
        tl.geom,
        ST_Buffer(
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          1000
        )::geometry
      )
      GROUP BY tl.pl2024_id, mpl.deskripsi_domain
      ORDER BY total_luas_ha DESC
      LIMIT 10
    `;

    const result = await pool.query(query, [
      parseFloat(longitude),
      parseFloat(latitude),
    ]);

    console.log(`Found ${result.rows.length} tutupan lahan records`);
    console.log("Sample data:", result.rows[0]); // Debug

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching tutupan lahan:", error);
    res.status(500).json({
      error: "Failed to fetch tutupan lahan data",
      details: error.message,
    });
  }
});

// Endpoint untuk tutupan lahan agregat berdasarkan DAS (bukan koordinat)
app.get("/api/tutupan-lahan/by-das", async (req, res) => {
  try {
    const { das } = req.query;

    if (!das) {
      return res.status(400).json({
        error: "Missing required parameter: das",
      });
    }

    console.log("Fetching tutupan lahan for DAS:", das);

    const query = `
      SELECT 
        tl.pl2024_id,
        COALESCE(mpl.deskripsi_domain, 'Tutupan Lahan ' || tl.pl2024_id::text) as deskripsi_domain,
        COUNT(*) as count,
        SUM(tl.luas_ha) as total_luas_ha
      FROM penutupan_lahan_2024 tl
      LEFT JOIN mapping_penutupan_lahan mpl 
        ON tl.pl2024_id::text = mpl.kode_domain::text
        WHERE tl.geom_valid IS NOT NULL
      AND ST_Intersects(
        tl.geom_valid,
        (SELECT ST_Union(geom_valid) FROM das_adm WHERE nama_das = $1)
      )
      GROUP BY tl.pl2024_id, mpl.deskripsi_domain
      ORDER BY total_luas_ha DESC
    `;

    const result = await pool.query(query, [das]);

    console.log(`Found ${result.rows.length} tutupan lahan types in DAS`);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching tutupan lahan by DAS:", error);
    res.status(500).json({
      error: "Failed to fetch tutupan lahan data",
      details: error.message,
    });
  }
});

app.get("/api/das/geometry-by-name", async (req, res) => {
  try {
    const { dasName } = req.query;

    if (!dasName) {
      return res.status(400).json({
        error: "Missing required parameter: dasName",
      });
    }

    console.log("Fetching DAS geometry by name:", dasName);

    const result = await pool.query(
      `
      SELECT 
        nama_das,
        ST_AsGeoJSON(ST_Union(ST_Force2D(geom)))::json as geom
      FROM das_adm
      WHERE nama_das = $1
      GROUP BY nama_das
    `,
      [dasName],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "DAS not found",
      });
    }

    res.json({
      success: true,
      dasName: result.rows[0].nama_das,
      geom: result.rows[0].geom,
    });
  } catch (error) {
    console.error("Error fetching DAS geometry by name:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/das/geometry-by-coordinates", async (req, res) => {
  try {
    const { longitude, latitude } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({
        error: "Missing required parameters: longitude, latitude",
      });
    }

    console.log("Fetching DAS geometry for coordinates:", {
      longitude,
      latitude,
    });

    // Query dengan ST_Intersects dan buffer kecil untuk menghindari SRID issue
    const query = `
      SELECT 
        nama_das,
        ST_AsGeoJSON(ST_SetSRID(geom, 4326))::json as geom
      FROM das_adm
      WHERE ST_Intersects(
        ST_SetSRID(geom, 4326),
        ST_Buffer(
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          1
        )::geometry
      )
      LIMIT 1
    `;

    const result = await pool.query(query, [
      parseFloat(longitude),
      parseFloat(latitude),
    ]);

    if (result.rows.length > 0) {
      console.log(`Found DAS: ${result.rows[0].nama_das}`);

      res.json({
        success: true,
        dasName: result.rows[0].nama_das,
        geom: result.rows[0].geom,
      });
    } else {
      res.json({
        success: false,
        message: "No DAS found for these coordinates",
      });
    }
  } catch (error) {
    console.error("Error fetching DAS geometry:", error);
    res.status(500).json({
      error: "Failed to fetch DAS geometry",
      details: error.message,
    });
  }
});

// server.js

// ================= Endpoint /api/kejadian/list ================
// Ganti line 9242-9289 dengan:

app.get("/api/kejadian/list", async (req, res) => {
  try {
    const { category, location, featured } = req.query;

    let query = "SELECT * FROM kejadian WHERE 1=1";
    const values = [];
    let paramCount = 1;

    // Filter by category
    if (category && category !== "All Category") {
      query += ` AND category = $${paramCount}`;
      values.push(category);
      paramCount++;
    }

    // Filter by location (partial match)
    if (location && location !== "All Lokasi") {
      query += ` AND location ILIKE $${paramCount}`;
      values.push(`%${location}%`);
      paramCount++;
    }

    // Filter by featured
    if (featured !== undefined) {
      query += ` AND featured = $${paramCount}`;
      values.push(featured === "true");
      paramCount++;
    }

    // ORDER BY: Featured first (DESC = true first), then by date DESC
    query += " ORDER BY featured DESC, date DESC, created_at DESC";

    console.log("Kejadian list query:", query);
    console.log("Query values:", values);

    const result = await client.query(query, values);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("Error fetching kejadian:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data kejadian",
      error: error.message,
    });
  }
});

// Endpoint baru: Kerawanan data berdasarkan DAS (bukan koordinat)
app.get("/api/kerawanan/by-das", async (req, res) => {
  try {
    const { das, category } = req.query;

    if (!das || !category) {
      return res.status(400).json({
        error: "Missing required parameters: das, category",
      });
    }

    console.log("Fetching kerawanan data for DAS:", { das, category });

    let queries = [];

    // Tentukan query berdasarkan kategori
    if (category === "Banjir") {
      queries.push({
        type: "limpasan",
        query: `
          SELECT 
            'limpasan' as type,
            limpasan as tingkat,
            SUM(ST_Area(
              ST_Intersection(
                ST_MakeValid(rl.geom),
                (SELECT ST_Union(ST_MakeValid(geom)) FROM das_adm WHERE nama_das = $1)
              )::geography
            )) / 10000 as luas_total
          FROM rawan_limpasan rl
          WHERE ST_Intersects(
            rl.geom,
            (SELECT ST_Union(geom) FROM das_adm WHERE nama_das = $1)
          )
          GROUP BY limpasan
          ORDER BY 
            CASE limpasan
              WHEN 'Ekstrim' THEN 1
              WHEN 'Tinggi' THEN 2
              WHEN 'Rendah' THEN 3
              WHEN 'Normal' THEN 4
              ELSE 5
            END
        `,
      });
    } else if (category === "Kebakaran Hutan dan Kekeringan") {
      queries.push({
        type: "karhutla",
        query: `
          SELECT 
            'karhutla' as type,
            kelas as tingkat,
            SUM(luas_ha) as luas_total
          FROM rawan_karhutla rk
          WHERE ST_Intersects(
            rk.geom,
            (SELECT ST_Union(geom) FROM das_adm WHERE nama_das = $1)
          )
          GROUP BY kelas
          ORDER BY 
            CASE kelas
              WHEN 'Sangat Tinggi' THEN 1
              WHEN 'Tinggi' THEN 2
              WHEN 'Sedang' THEN 3
              WHEN 'Rendah' THEN 4
              ELSE 5
            END
        `,
      });
    } else if (category === "Tanah Longsor dan Erosi") {
      queries.push({
        type: "longsor",
        query: `
          SELECT 
            'longsor' as type,
            unsur as tingkat,
            SUM(shape_area) as luas_total
          FROM rawan_longsor rl
          WHERE ST_Intersects(
            rl.geom,
            (SELECT ST_Union(geom) FROM das_adm WHERE nama_das = $1)
          )
          GROUP BY unsur
          ORDER BY 
            CASE unsur
              WHEN 'Tinggi' THEN 1
              WHEN 'Menengah' THEN 2
              WHEN 'Rendah' THEN 3
              WHEN 'Sangat Rendah' THEN 4
              ELSE 5
            END
        `,
      });
      queries.push({
        type: "erosi",
        query: `
          WITH erosi_classified AS (
            SELECT 
              'erosi' as type,
              CASE 
                WHEN kls_a = '>480' THEN 'Sangat Tinggi'
                WHEN kls_a ~ '^[0-9]+\.?[0-9]*$' THEN
                  CASE 
                    WHEN kls_a::numeric <= 15 THEN 'Sangat Rendah'
                    WHEN kls_a::numeric <= 60 THEN 'Rendah'
                    WHEN kls_a::numeric <= 180 THEN 'Sedang'
                    WHEN kls_a::numeric <= 480 THEN 'Tinggi'
                    ELSE 'Sangat Tinggi'
                  END
                ELSE 'Sangat Tinggi'
              END as tingkat,
              n_a
            FROM rawan_erosi re
            WHERE ST_Intersects(
              re.geom,
              (SELECT ST_Union(geom) FROM das_adm WHERE nama_das = $1)
            )
          )
          SELECT 
            type,
            tingkat,
            SUM(n_a) as luas_total
          FROM erosi_classified
          GROUP BY type, tingkat
          ORDER BY 
            CASE tingkat
              WHEN 'Sangat Tinggi' THEN 1
              WHEN 'Tinggi' THEN 2
              WHEN 'Sedang' THEN 3
              WHEN 'Rendah' THEN 4
              WHEN 'Sangat Rendah' THEN 5
              ELSE 6
            END
        `,
      });
    }

    const results = [];
    for (const q of queries) {
      const result = await pool.query(q.query, [das]);
      results.push(...result.rows);
    }

    console.log(
      `Found ${results.length} kerawanan records for ${category} in DAS ${das}`,
    );

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error("Error fetching kerawanan by DAS:", error);
    res.status(500).json({
      error: "Failed to fetch kerawanan data",
      details: error.message,
    });
  }
});

// Endpoint untuk fetch data kerawanan berdasarkan kategori dan koordinat
app.get("/api/kerawanan/by-coordinates", async (req, res) => {
  try {
    const { longitude, latitude, category } = req.query;

    if (!longitude || !latitude || !category) {
      return res.status(400).json({
        error: "Missing required parameters: longitude, latitude, category",
      });
    }

    console.log("Fetching kerawanan data for:", {
      longitude,
      latitude,
      category,
    });

    let query, tableName, groupByColumn, areaColumn;

    // Tentukan tabel dan kolom berdasarkan kategori
    if (category === "Banjir") {
      tableName = "rawan_limpasan";
      groupByColumn = "limpasan";
      areaColumn = "shape_leng";

      query = `
        SELECT 
          ${groupByColumn} as tingkat,
          SUM(${areaColumn}) as luas_total
        FROM ${tableName}
        WHERE ST_Intersects(
          ST_SetSRID(geom, 4326),
          ST_Buffer(
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            1000
          )::geometry
        )
        GROUP BY ${groupByColumn}
        ORDER BY 
          CASE ${groupByColumn}
            WHEN 'Ekstrim' THEN 1
            WHEN 'Tinggi' THEN 2
            WHEN 'Normal' THEN 3
            ELSE 4
          END
      `;
    } else if (category === "Kebakaran Hutan dan Kekeringan") {
      tableName = "rawan_karhutla";
      groupByColumn = "kelas";
      areaColumn = "luas_ha";

      query = `
        SELECT 
          ${groupByColumn} as tingkat,
          SUM(${areaColumn}) as luas_total
        FROM ${tableName}
        WHERE ST_Intersects(
          ST_SetSRID(geom, 4326),
          ST_Buffer(
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            1000
          )::geometry
        )
        GROUP BY ${groupByColumn}
        ORDER BY 
          CASE ${groupByColumn}
            WHEN 'Rendah' THEN 1
            WHEN 'Sedang' THEN 2
            WHEN 'Tinggi' THEN 3
            ELSE 4
          END
      `;
    } else if (category === "Tanah Longsor dan Erosi") {
      tableName = "rawan_erosi";

      query = `
        SELECT 
          kls_a,
          SUM(n_a) as luas_total
        FROM ${tableName}
        WHERE ST_Intersects(
          ST_SetSRID(geom, 4326),
          ST_Buffer(
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            1000
          )::geometry
        )
        GROUP BY kls_a
        ORDER BY kls_a
      `;
    } else {
      return res.status(400).json({
        error: "Invalid category",
      });
    }

    const result = await pool.query(query, [
      parseFloat(longitude),
      parseFloat(latitude),
    ]);

    // Jika erosi, klasifikasikan berdasarkan kls_a
    let processedData = result.rows;

    if (category === "Tanah Longsor dan Erosi") {
      processedData = result.rows.map((row) => {
        const kls_a = parseFloat(row.kls_a);
        let tingkat;

        if (kls_a <= 15) {
          tingkat = "Sangat Rendah";
        } else if (kls_a <= 60) {
          tingkat = "Rendah";
        } else if (kls_a <= 180) {
          tingkat = "Sedang";
        } else if (kls_a <= 480) {
          tingkat = "Tinggi";
        } else {
          tingkat = "Sangat Tinggi";
        }

        return {
          tingkat: tingkat,
          luas_total: row.luas_total,
          type: "erosi",
        };
      });

      // Akumulasi untuk tingkat yang sama
      const grouped = {};
      processedData.forEach((row) => {
        if (grouped[row.tingkat]) {
          grouped[row.tingkat] += parseFloat(row.luas_total);
        } else {
          grouped[row.tingkat] = parseFloat(row.luas_total);
        }
      });

      // Sort berdasarkan tingkat kerawanan
      const tingkatOrder = [
        "Sangat Rendah",
        "Rendah",
        "Sedang",
        "Tinggi",
        "Sangat Tinggi",
      ];
      processedData = Object.keys(grouped)
        .sort((a, b) => tingkatOrder.indexOf(a) - tingkatOrder.indexOf(b))
        .map((tingkat) => ({
          tingkat: tingkat,
          luas_total: grouped[tingkat],
          type: "erosi",
        }));

      // TAMBAHAN: Fetch data rawan longsor dan gabungkan
      const longsorQuery = `
        SELECT 
          unsur as tingkat,
          SUM(shape_area) as luas_total
        FROM rawan_longsor
        WHERE ST_Intersects(
          ST_SetSRID(geom, 4326),
          ST_Buffer(
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            1000
          )::geometry
        )
        GROUP BY unsur
        ORDER BY 
          CASE unsur
            WHEN 'Sangat Tinggi' THEN 1
            WHEN 'Tinggi' THEN 2
            WHEN 'Menengah' THEN 3
            WHEN 'Rendah' THEN 4
            ELSE 5
          END
      `;

      const longsorResult = await pool.query(longsorQuery, [
        parseFloat(longitude),
        parseFloat(latitude),
      ]);

      // Tambahkan data longsor ke processedData dengan type marker
      const longsorData = longsorResult.rows.map((row) => ({
        tingkat: row.tingkat,
        luas_total: parseFloat(row.luas_total),
        type: "longsor",
      }));

      processedData = [...processedData, ...longsorData];

      console.log(
        `Found ${processedData.filter((d) => d.type === "erosi").length} erosi records`,
      );
      console.log(
        `Found ${processedData.filter((d) => d.type === "longsor").length} longsor records`,
      );
    }

    console.log(
      `Found ${processedData.length} kerawanan records for ${category}`,
    );

    res.json({
      success: true,
      category: category,
      data: processedData,
    });
  } catch (error) {
    console.error("Error fetching kerawanan data:", error);
    res.status(500).json({
      error: "Failed to fetch kerawanan data",
      details: error.message,
    });
  }
});

// Endpoint untuk fetch layer kerawanan sebagai GeoJSON berdasarkan kategori dan DAS
app.get("/api/kerawanan/geojson", async (req, res) => {
  try {
    const { category, das } = req.query;

    if (!category) {
      return res.status(400).json({
        error: "Missing required parameter: category",
      });
    }

    console.log("Fetching kerawanan GeoJSON for:", { category, das });

    let queries = [];

    if (category === "Banjir") {
      queries.push({
        name: "rawan_limpasan",
        query: `
          SELECT 
            limpasan as tingkat,
            ST_AsGeoJSON(
              ${
                das
                  ? `
                ST_Intersection(
                  ST_Force2D(geom),
                  (SELECT ST_Force2D(ST_Union(geom)) FROM das_adm WHERE nama_das = $1)
                )
              `
                  : "geom"
              }
            )::json as geometry
          FROM rawan_limpasan
          ${
            das
              ? `WHERE ST_Intersects(
            ST_Force2D(geom),
            (SELECT ST_Force2D(ST_Union(geom)) FROM das_adm WHERE nama_das = $1)
          )`
              : ""
          }
        `,
        params: das ? [das] : [],
      });
    } else if (category === "Kebakaran Hutan dan Kekeringan") {
      queries.push({
        name: "rawan_karhutla",
        query: `
          SELECT 
            kelas as tingkat,
            ST_AsGeoJSON(
              ${
                das
                  ? `
                ST_Intersection(
                  ST_Force2D(geom),
                  (SELECT ST_Force2D(ST_Union(geom)) FROM das_adm WHERE nama_das = $1)
                )
              `
                  : "geom"
              }
            )::json as geometry
          FROM rawan_karhutla
          ${
            das
              ? `WHERE ST_Intersects(
            ST_Force2D(geom),
            (SELECT ST_Force2D(ST_Union(geom)) FROM das_adm WHERE nama_das = $1)
          )`
              : ""
          }
        `,
        params: das ? [das] : [],
      });
    } else if (category === "Tanah Longsor dan Erosi") {
      // Rawan Erosi
      queries.push({
        name: "rawan_erosi",
        query: `
          SELECT 
            CASE 
              WHEN kls_a = '>480' THEN 'Sangat Tinggi'
              WHEN kls_a ~ '^[0-9]+\.?[0-9]*$' THEN
                CASE 
                  WHEN kls_a::numeric <= 15 THEN 'Sangat Rendah'
                  WHEN kls_a::numeric <= 60 THEN 'Rendah'
                  WHEN kls_a::numeric <= 180 THEN 'Sedang'
                  WHEN kls_a::numeric <= 480 THEN 'Tinggi'
                  ELSE 'Sangat Tinggi'
                END
              ELSE 'Sangat Tinggi'
            END as tingkat,
            ST_AsGeoJSON(
              ${
                das
                  ? `
                ST_Intersection(
                  ST_Force2D(geom),
                  (SELECT ST_Force2D(ST_Union(geom)) FROM das_adm WHERE nama_das = $1)
                )
              `
                  : "geom"
              }
            )::json as geometry
          FROM rawan_erosi
          WHERE kls_a IS NOT NULL AND kls_a != ''
          ${
            das
              ? `AND ST_Intersects(
            ST_Force2D(geom),
            (SELECT ST_Force2D(ST_Union(geom)) FROM das_adm WHERE nama_das = $1)
          )`
              : ""
          }
        `,
        params: das ? [das] : [],
      });

      // Rawan Longsor
      queries.push({
        name: "rawan_longsor",
        query: `
          SELECT 
            unsur as tingkat,
            ST_AsGeoJSON(
              ${
                das
                  ? `
                ST_Intersection(
                  ST_Force2D(geom),
                  (SELECT ST_Force2D(ST_Union(geom)) FROM das_adm WHERE nama_das = $1)
                )
              `
                  : "geom"
              }
            )::json as geometry
          FROM rawan_longsor
          ${
            das
              ? `WHERE ST_Intersects(
            ST_Force2D(geom),
            (SELECT ST_Force2D(ST_Union(geom)) FROM das_adm WHERE nama_das = $1)
          )`
              : ""
          }
        `,
        params: das ? [das] : [],
      });
    } else {
      return res.status(400).json({
        error: "Invalid category",
      });
    }

    // Execute all queries
    const results = {};

    for (const queryObj of queries) {
      const result = await pool.query(queryObj.query, queryObj.params);

      // Convert to GeoJSON format, filter out null/empty geometries
      const features = result.rows
        .filter(
          (row) =>
            row.geometry && row.geometry.type && row.geometry.coordinates,
        )
        .map((row) => ({
          type: "Feature",
          properties: {
            tingkat: row.tingkat,
          },
          geometry: row.geometry,
        }));

      results[queryObj.name] = {
        type: "FeatureCollection",
        features: features,
      };

      console.log(`${queryObj.name}: ${features.length} features`);
    }

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error("Error fetching kerawanan GeoJSON:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Endpoint untuk fetch curah hujan dari Open-Meteo API
app.get("/api/weather/rainfall", async (req, res) => {
  try {
    const { latitude, longitude, date } = req.query;

    if (!latitude || !longitude || !date) {
      return res.status(400).json({
        error: "Missing required parameters: latitude, longitude, date",
      });
    }

    console.log("Fetching rainfall data for:", { latitude, longitude, date });

    // Open-Meteo API - Free, no API key required
    // Get rainfall data for specific date
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${date}&end_date=${date}&daily=precipitation_sum&timezone=Asia/Jakarta`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Open-Meteo API error: ${response.status}`);
    }

    const data = await response.json();

    console.log("Open-Meteo response:", data);

    // Extract rainfall data
    const rainfall = data.daily?.precipitation_sum?.[0] || 0;

    res.json({
      success: true,
      rainfall: rainfall, // in mm
      date: date,
      location: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      },
      source: "Open-Meteo Archive API",
    });
  } catch (error) {
    console.error("Error fetching rainfall data:", error);
    res.status(500).json({
      error: "Failed to fetch rainfall data",
      details: error.message,
    });
  }
});

app.post("/api/kejadian/check-years-availability", async (req, res) => {
  try {
    const { bounds, dasFilter, adminFilter, adminLevel } = req.body;

    console.log(
      "Check years availability - bounds:",
      bounds,
      "dasFilter:",
      dasFilter,
      "adminFilter:",
      adminFilter,
      "adminLevel:",
      adminLevel,
    );

    let query = `
      SELECT DISTINCT 
        category,
        EXTRACT(YEAR FROM date)::integer as year,
        COUNT(*) as count
      FROM kejadian
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;
    let usedSpatialFilter = false;

    // Prioritas: DAS Filter > Admin Filter > Bounds Filter

    // 1. DAS Filter dengan spatial intersection
    if (dasFilter && dasFilter.length > 0) {
      const dasPlaceholders = dasFilter
        .map((_, i) => `$${paramIndex + i}`)
        .join(",");
      query += ` AND ST_Intersects(
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
        (SELECT ST_Union(geom) FROM das_adm WHERE nama_das IN (${dasPlaceholders}))
      )`;
      params.push(...dasFilter);
      paramIndex += dasFilter.length;
      usedSpatialFilter = true;
      console.log("Applied DAS spatial filter for count:", dasFilter);
    }

    // 2. Admin Filter dengan spatial intersection
    if (
      !usedSpatialFilter &&
      adminFilter &&
      adminFilter.length > 0 &&
      adminLevel
    ) {
      let adminTable, adminColumn;

      switch (adminLevel) {
        case "provinsi":
          adminTable = "provinsi";
          adminColumn = "provinsi";
          break;
        case "kabupaten":
          adminTable = "kab_kota";
          adminColumn = "kab_kota";
          break;
        case "kecamatan":
          adminTable = "kecamatan";
          adminColumn = "kecamatan";
          break;
        case "kelurahan":
          adminTable = "kel_desa";
          adminColumn = "kel_desa";
          break;
        default:
          adminTable = "provinsi";
          adminColumn = "provinsi";
      }

      const adminPlaceholders = adminFilter
        .map((_, i) => `$${paramIndex + i}`)
        .join(",");
      query += ` AND ST_Intersects(
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
        (SELECT ST_Union(geom) FROM ${adminTable} WHERE ${adminColumn} IN (${adminPlaceholders}))
      )`;
      params.push(...adminFilter);
      paramIndex += adminFilter.length;
      usedSpatialFilter = true;
      console.log(
        `Applied ${adminLevel} spatial filter for count:`,
        adminFilter,
      );
    }

    // 3. Bounds filter (fallback)
    if (!usedSpatialFilter && bounds && bounds.length === 2) {
      const [[minLat, minLng], [maxLat, maxLng]] = bounds;
      query += ` AND ST_Intersects(
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
        ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)
      )`;
      params.push(minLng, minLat, maxLng, maxLat);
      paramIndex += 4;
      console.log("Applied bounds filter for count");
    }

    query +=
      " GROUP BY category, EXTRACT(YEAR FROM date) ORDER BY year DESC, category";

    console.log("Check kejadian years availability query:", query);
    console.log("With params:", params);

    const result = await pool.query(query, params);
    const availableKejadian = result.rows.map((row) => ({
      category: row.category,
      year: row.year,
      count: parseInt(row.count),
    }));

    console.log("Available kejadian in bounds:", availableKejadian);

    res.json({
      availableKejadian: availableKejadian,
    });
  } catch (error) {
    console.error("Error checking kejadian years availability:", error);
    res.status(500).json({
      error: error.message,
      availableKejadian: [],
    });
  }
});

app.get("/api/kejadian/photos", async (req, res) => {
  try {
    const { bounds, year, category, dasFilter, adminFilter, adminLevel } =
      req.query;

    console.log(
      "Fetching photos - year:",
      year,
      "category:",
      category,
      "bounds:",
      bounds,
      "dasFilter:",
      dasFilter,
      "adminFilter:",
      adminFilter,
      "adminLevel:",
      adminLevel,
    );

    if (!year) {
      return res.status(400).json({
        success: false,
        error: "Year parameter is required",
      });
    }

    let query = `
      SELECT 
        id,
        images_paths,
        latitude,
        longitude,
        category,
        date,
        title
      FROM kejadian
      WHERE EXTRACT(YEAR FROM date) = $1
        AND images_paths IS NOT NULL
        AND CASE 
          WHEN images_paths::text = '' THEN FALSE
          WHEN images_paths::text = '{}' THEN FALSE
          WHEN images_paths::text = '""' THEN FALSE
          WHEN images_paths::text = 'null' THEN FALSE
          ELSE array_length(images_paths, 1) > 0
        END
    `;

    const params = [parseInt(year)];
    let paramIndex = 2;
    let usedSpatialFilter = false;

    // TAMBAHKAN: Category filter
    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
      console.log("Applied category filter for photos:", category);
    }

    // Prioritas: DAS Filter > Admin Filter > Bounds Filter

    // 1. DAS Filter dengan spatial intersection
    if (dasFilter) {
      try {
        const dasArray = JSON.parse(dasFilter);
        if (dasArray && dasArray.length > 0) {
          const dasPlaceholders = dasArray
            .map((_, i) => `$${paramIndex + i}`)
            .join(",");
          query += ` AND ST_Intersects(
            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
            (SELECT ST_Union(geom) FROM das_adm WHERE nama_das IN (${dasPlaceholders}))
          )`;
          params.push(...dasArray);
          paramIndex += dasArray.length;
          usedSpatialFilter = true;
          console.log("Applied DAS spatial filter for photos:", dasArray);
        }
      } catch (e) {
        console.error("Error parsing dasFilter:", e);
      }
    }

    // 2. Admin Filter dengan spatial intersection
    if (!usedSpatialFilter && adminFilter && adminLevel) {
      try {
        const adminArray = JSON.parse(adminFilter);
        if (adminArray && adminArray.length > 0) {
          let adminTable, adminColumn;

          switch (adminLevel) {
            case "provinsi":
              adminTable = "provinsi";
              adminColumn = "provinsi";
              break;
            case "kabupaten":
              adminTable = "kab_kota";
              adminColumn = "kab_kota";
              break;
            case "kecamatan":
              adminTable = "kecamatan";
              adminColumn = "kecamatan";
              break;
            case "kelurahan":
              adminTable = "kel_desa";
              adminColumn = "kel_desa";
              break;
            default:
              adminTable = "provinsi";
              adminColumn = "provinsi";
          }

          const adminPlaceholders = adminArray
            .map((_, i) => `$${paramIndex + i}`)
            .join(",");
          query += ` AND ST_Intersects(
            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
            (SELECT ST_Union(geom) FROM ${adminTable} WHERE ${adminColumn} IN (${adminPlaceholders}))
          )`;
          params.push(...adminArray);
          paramIndex += adminArray.length;
          usedSpatialFilter = true;
          console.log(
            `Applied ${adminLevel} spatial filter for photos:`,
            adminArray,
          );
        }
      } catch (e) {
        console.error("Error parsing adminFilter:", e);
      }
    }

    // 3. Bounds filter (fallback)
    if (!usedSpatialFilter && bounds) {
      const [minLat, minLng, maxLat, maxLng] = bounds.split(",").map(Number);
      query += ` AND ST_Intersects(
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
        ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)
      )`;
      params.push(minLng, minLat, maxLng, maxLat);
      paramIndex += 4;
      console.log("Applied bounds filter for photos");
    }

    query += " ORDER BY date DESC";

    console.log("Executing kejadian photos query with params:", params);

    const result = await pool.query(query, params);

    console.log("Raw query result rows:", result.rows.length);

    // Parse images_paths dan flatten menjadi array foto
    const photos = [];
    result.rows.forEach((row, idx) => {
      if (!row.images_paths) {
        return;
      }

      let paths = [];
      if (Array.isArray(row.images_paths)) {
        paths = row.images_paths;
      } else if (typeof row.images_paths === "string") {
        try {
          paths = JSON.parse(row.images_paths);
          if (!Array.isArray(paths)) {
            paths = [row.images_paths];
          }
        } catch (e) {
          paths = [row.images_paths];
        }
      }

      paths.forEach((path) => {
        if (path && path.trim() !== "") {
          photos.push({
            id: row.id,
            path: path,
            incident_type: row.category || "Unknown",
            incident_date: row.date,
            title: row.title || "",
            latitude: row.latitude,
            longitude: row.longitude,
          });
        }
      });
    });

    console.log("Total photos after processing:", photos.length);

    res.json({
      success: true,
      photos: photos,
    });
  } catch (error) {
    console.error("Error fetching kejadian photos:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/kejadian/years", async (req, res) => {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT DISTINCT EXTRACT(YEAR FROM date) as year
      FROM kejadian
      ORDER BY year DESC
    `);

    const years = result.rows.map((row) => parseInt(row.year));
    res.json({ years });
  } catch (error) {
    console.error("Error fetching kejadian years:", error);
    res.status(500).json({ error: "Failed to fetch kejadian years" });
  } finally {
    client.release();
  }
});

app.get("/api/kejadian/by-year/:year", async (req, res) => {
  const client = await pool.connect();

  try {
    const { year } = req.params;
    const { bounds, dasFilter, category, adminFilter, adminLevel } = req.query;

    console.log("Fetching kejadian for year:", year);
    console.log("Bounds:", bounds);
    console.log("dasFilter:", dasFilter);
    console.log("adminFilter:", adminFilter, "adminLevel:", adminLevel);

    // Build WHERE clause
    let whereClause = `WHERE EXTRACT(YEAR FROM date) = $1`;
    const params = [year];
    let paramIndex = 2;

    // Add category filter if provided
    if (category) {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
      console.log("Applied category filter:", category);
    }

    // Prioritas: DAS Filter > Admin Filter > Bounds Filter
    let usedSpatialFilter = false;

    // 1. DAS Filter dengan spatial intersection
    if (dasFilter) {
      try {
        const dasArray = JSON.parse(dasFilter);
        console.log("Parsed dasFilter:", dasArray);

        if (Array.isArray(dasArray) && dasArray.length > 0) {
          const dasPlaceholders = dasArray
            .map((_, idx) => `$${paramIndex + idx}`)
            .join(", ");

          whereClause += ` AND ST_Intersects(
            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
            (SELECT ST_Union(geom) FROM das_adm WHERE nama_das IN (${dasPlaceholders}))
          )`;

          params.push(...dasArray);
          paramIndex += dasArray.length;
          usedSpatialFilter = true;
          console.log("Applied DAS spatial filter:", dasArray);
        }
      } catch (e) {
        console.error("Error parsing dasFilter:", e);
      }
    }

    // 2. Admin Filter dengan spatial intersection
    if (!usedSpatialFilter && adminFilter && adminLevel) {
      try {
        const adminArray = JSON.parse(adminFilter);
        console.log("Parsed adminFilter:", adminArray);

        if (Array.isArray(adminArray) && adminArray.length > 0) {
          let adminTable, adminColumn;

          switch (adminLevel) {
            case "provinsi":
              adminTable = "provinsi";
              adminColumn = "provinsi";
              break;
            case "kabupaten":
              adminTable = "kab_kota";
              adminColumn = "kab_kota";
              break;
            case "kecamatan":
              adminTable = "kecamatan";
              adminColumn = "kecamatan";
              break;
            case "kelurahan":
              adminTable = "kel_desa";
              adminColumn = "kel_desa";
              break;
            default:
              adminTable = "provinsi";
              adminColumn = "provinsi";
          }

          const adminPlaceholders = adminArray
            .map((_, idx) => `$${paramIndex + idx}`)
            .join(", ");

          whereClause += ` AND ST_Intersects(
            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
            (SELECT ST_Union(geom) FROM ${adminTable} WHERE ${adminColumn} IN (${adminPlaceholders}))
          )`;

          params.push(...adminArray);
          paramIndex += adminArray.length;
          usedSpatialFilter = true;
          console.log(`Applied ${adminLevel} spatial filter:`, adminArray);
        }
      } catch (e) {
        console.error("Error parsing adminFilter:", e);
      }
    }

    // 3. Bounds filter (fallback jika tidak ada DAS/Admin filter)
    if (!usedSpatialFilter && bounds) {
      const [south, west, north, east] = bounds.split(",").map(Number);
      const boundsWKT = `POLYGON((${west} ${south}, ${east} ${south}, ${east} ${north}, ${west} ${north}, ${west} ${south}))`;
      whereClause += ` AND ST_Intersects(
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
        ST_GeomFromText('${boundsWKT}', 4326)
      )`;
      console.log("Applied bounds filter");
    }

    const query = `
      SELECT 
        id,
        title,
        category,
        date,
        location,
        das,
        longitude,
        latitude,
        featured,
        thumbnail_path,
        description,
        images_paths,
        curah_hujan
      FROM kejadian
      ${whereClause}
      ORDER BY date DESC
    `;

    console.log("Kejadian query params:", params);

    const result = await client.query(query, params);

    // Build GeoJSON
    const features = result.rows.map((row) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [parseFloat(row.longitude), parseFloat(row.latitude)],
      },
      properties: {
        id: row.id,
        title: row.title,
        category: row.category,
        date: row.date,
        location: row.location,
        das: row.das,
        featured: row.featured,
        thumbnail_path: row.thumbnail_path,
        description: row.description,
        images_paths: row.images_paths,
        curah_hujan: row.curah_hujan,
      },
    }));

    const geojson = {
      type: "FeatureCollection",
      features: features,
    };

    console.log(
      `Returning ${features.length} kejadian features for year ${year}${category ? " category " + category : ""}`,
    );

    res.json(geojson);
  } catch (error) {
    console.error("Error fetching kejadian by year:", error);
    res.status(500).json({
      error: "Failed to fetch kejadian",
      message: error.message,
    });
  } finally {
    client.release();
  }
});

app.get("/api/kejadian/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await client.query("SELECT * FROM kejadian WHERE id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Kejadian tidak ditemukan",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching kejadian:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data kejadian",
      error: error.message,
    });
  }
});

app.patch("/api/kejadian/:id/featured", async (req, res) => {
  try {
    const { id } = req.params;
    const { featured } = req.body;

    const result = await client.query(
      "UPDATE kejadian SET featured = $1 WHERE id = $2 RETURNING *",
      [featured, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Kejadian tidak ditemukan",
      });
    }

    res.json({
      success: true,
      message: "Status featured berhasil diubah",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating featured status:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengubah status featured",
      error: error.message,
    });
  }
});

app.put(
  "/api/kejadian/:id",
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "images", maxCount: 15 },
  ]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        title,
        category,
        incidentDate,
        location,
        das,
        longitude,
        latitude,
        curahHujan,
        featured,
        description,
      } = req.body;

      console.log("Updating kejadian:", id);
      console.log("Request body:", req.body);

      // Check if kejadian exists
      const checkResult = await client.query(
        "SELECT * FROM kejadian WHERE id = $1",
        [id],
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Kejadian tidak ditemukan",
        });
      }

      const existingKejadian = checkResult.rows[0];

      // Handle file uploads
      let thumbnailPath = existingKejadian.thumbnail_path;
      let imagesPaths = existingKejadian.images_paths || [];

      // Update thumbnail if new one uploaded
      if (req.files && req.files["thumbnail"] && req.files["thumbnail"][0]) {
        // Delete old thumbnail if exists
        if (existingKejadian.thumbnail_path) {
          const oldPath = path.join(__dirname, existingKejadian.thumbnail_path);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
        thumbnailPath = `/uploads/${req.files["thumbnail"][0].filename}`;
      }

      // Update additional images if new ones uploaded
      if (req.files && req.files["images"] && req.files["images"].length > 0) {
        // Delete old images if exists
        if (
          existingKejadian.images_paths &&
          existingKejadian.images_paths.length > 0
        ) {
          existingKejadian.images_paths.forEach((imgPath) => {
            const oldPath = path.join(__dirname, imgPath);
            if (fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath);
            }
          });
        }
        imagesPaths = req.files["images"].map(
          (file) => `/uploads/${file.filename}`,
        );
      }

      // Update kejadian
      const updateQuery = `
      UPDATE kejadian 
      SET 
        title = $1,
        category = $2,
        date = $3,
        location = $4,
        das = $5,
        longitude = $6,
        latitude = $7,
        curah_hujan = $8,
        featured = $9,
        description = $10,
        thumbnail_path = $11,
        images_paths = $12,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING *
    `;

      const values = [
        title,
        category,
        incidentDate,
        location,
        das || null,
        parseFloat(longitude),
        parseFloat(latitude),
        curahHujan ? parseFloat(curahHujan) : null,
        featured !== undefined
          ? featured === "true" || featured === true
          : existingKejadian.featured,
        description || null,
        thumbnailPath,
        imagesPaths,
        id,
      ];

      const result = await client.query(updateQuery, values);

      res.json({
        success: true,
        message: "Kejadian berhasil diupdate",
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating kejadian:", error);
      res.status(500).json({
        success: false,
        message: "Gagal update kejadian",
        error: error.message,
      });
    }
  },
);

app.delete("/api/kejadian/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await client.query(
      "DELETE FROM kejadian WHERE id = $1 RETURNING *",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Kejadian tidak ditemukan",
      });
    }

    res.json({
      success: true,
      message: "Kejadian berhasil dihapus",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting kejadian:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus kejadian",
      error: error.message,
    });
  }
});

app.get("/api/das/by-location", async (req, res) => {
  try {
    const { kecamatan, kabupaten, provinsi } = req.query;

    if (!kecamatan && !kabupaten && !provinsi) {
      return res.json({ dasList: [] });
    }

    const conditions = [];
    const values = [];

    if (provinsi) {
      values.push(String(provinsi).trim());
      conditions.push(`
        LOWER(TRIM(wadmpr)) = LOWER(TRIM($${values.length}))
      `);
    }

    if (kabupaten) {
      values.push(String(kabupaten).trim());
      conditions.push(`
        LOWER(TRIM(wadmkk)) = LOWER(TRIM($${values.length}))
      `);
    }

    if (kecamatan) {
      values.push(String(kecamatan).trim());
      conditions.push(`
        LOWER(TRIM(wadmkc)) = LOWER(TRIM($${values.length}))
      `);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT DISTINCT
        kode_das,
        nama_das,
        luas_das
      FROM public.das_adm
      ${whereClause}
      AND kode_das IS NOT NULL
      AND nama_das IS NOT NULL
      ORDER BY nama_das ASC
    `;

    const result = await pool.query(query, values);

    res.json({
      dasList: result.rows,
    });
  } catch (error) {
    console.error("Error fetching DAS by location:", error);

    res.status(500).json({
      error: error.message,
      dasList: [],
    });
  }
});

// Setup for shapefile uploads
const uploadDir = path.join(__dirname, "uploads/shapefiles");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration for shapefile upload
const shapefileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename to maintain .shp, .shx, .dbf extensions
    cb(null, file.originalname);
  },
});

const shapefileUpload = multer({
  storage: shapefileStorage,
  fileFilter: (req, file, cb) => {
    // Allow shapefile related files
    const allowedExtensions = [
      ".shp",
      ".shx",
      ".dbf",
      ".prj",
      ".cpg",
      ".sbn",
      ".sbx",
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only shapefile components are allowed (.shp, .shx, .dbf, .prj, etc.)",
        ),
        false,
      );
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB limit untuk shapefile
    files: 20, // Maksimal 20 file sekaligus
  },
});

// Endpoint untuk mendapatkan semua layer
app.get("/api/layers", async (req, res) => {
  try {
    const authorizedLayerIds = await getAuthorizedLayerIds(req);
    const result = await pool.query(`
      SELECT id, table_name, section, created_at
      FROM layer_metadata
      ORDER BY created_at DESC
    `);

    const visibleRows =
      authorizedLayerIds === null || authorizedLayerIds === "ALL"
        ? result.rows
        : result.rows.filter((row) => authorizedLayerIds.has(Number(row.id)));

    // Get kejadian grouped by category and year (dari tabel kejadian - auto)
    const kejadianResult = await pool.query(`
      SELECT 
        category,
        EXTRACT(YEAR FROM date) as year,
        COUNT(*) as count
      FROM kejadian
      GROUP BY category, EXTRACT(YEAR FROM date)
      ORDER BY year DESC, category
    `);

    // Group by section
    const grouped = {
      kerawanan: [],
      mitigasiAdaptasi: [],
      lainnya: [],
      kejadian: [],
    };

    visibleRows.forEach((row) => {
      if (row.section === "kejadian") {
        // Layer manual upload (dari layer_metadata)
        grouped.kejadian.push({
          id: row.id.toString(),
          name: row.table_name,
          createdAt: row.created_at,
          isManual: true, // Flag untuk layer manual upload
          isShapefile: true,
        });
      } else {
        grouped[row.section].push({
          id: row.id.toString(),
          name: row.table_name,
          createdAt: row.created_at,
        });
      }
    });

    // Add kejadian layers otomatis dari tabel kejadian (auto-generated points)
    kejadianResult.rows.forEach((row) => {
      grouped.kejadian.push({
        id: `kejadian_${row.category.replace(/\s+/g, "_")}_${row.year}`,
        name: `${row.category} ${row.year}`,
        category: row.category,
        year: parseInt(row.year),
        count: parseInt(row.count),
        isManual: false, // Flag untuk layer otomatis
        isAutoGenerated: true,
      });
    });

    res.json({
      ...grouped,
      authorization: {
        enabled: authorizedLayerIds !== null,
        privileged: authorizedLayerIds === "ALL",
        visibleLayerCount: visibleRows.length,
      },
    });
  } catch (error) {
    console.error("Error fetching layers:", error);
    res.status(500).json({ error: "Failed to fetch layers" });
  }
});

const shapefile = require("shapefile");

// Helper untuk monitor progress insert real-time
async function monitorTableInsertProgress(tableName, checkInterval = 1000) {
  let lastCount = 0;

  const intervalId = setInterval(async () => {
    try {
      const client = await pool.connect();
      const result = await client.query(`
        SELECT COUNT(*) as count 
        FROM ${tableName}
      `);
      const currentCount = parseInt(result.rows[0].count);
      client.release();

      if (currentCount > lastCount) {
        lastCount = currentCount;

        // Estimasi progress (karena tidak tahu total)
        // Progress akan melambat secara logaritmik
        const progress = Math.min(
          Math.round(20 + Math.log10(currentCount + 1) * 15),
          95,
        );

        sendProgress(
          tableName,
          progress,
          `Inserted ${currentCount.toLocaleString()} features...`,
        );
        console.log(
          `  Progress: ${currentCount.toLocaleString()} features inserted`,
        );
      }
    } catch (err) {
      // Table mungkin belum dibuat, ignore
    }
  }, checkInterval);

  return intervalId;
}

// Endpoint untuk upload dan create layer baru
// app.post('/api/layers', shapefileUpload.array('files'), async (req, res) => {
//   console.log('\n========================================');
//   console.log('START POST /api/layers');
//   console.log('========================================');

//   const client = await pool.connect();
//   let uploadedFilePaths = [];
//   let tableCreated = false;

//   try {
//     const { tableName, section } = req.body;
//     const files = req.files;

//     console.log('Table Name:', tableName);
//     console.log('Section:', section);
//     console.log('Files Count:', files?.length);

//     // Validasi input
//     if (!tableName || !section) {
//       return res.status(400).json({ error: 'Table name and section are required' });
//     }

//     if (!files || files.length === 0) {
//       return res.status(400).json({ error: 'No files uploaded' });
//     }

//     uploadedFilePaths = files.map(f => f.path);

//     // Cari .shp dan .dbf
//     const shpFile = files.find(f => f.originalname.toLowerCase().endsWith('.shp'));
//     const dbfFile = files.find(f => f.originalname.toLowerCase().endsWith('.dbf'));

//     console.log('SHP File:', shpFile ? shpFile.originalname : 'NOT FOUND');
//     console.log('DBF File:', dbfFile ? dbfFile.originalname : 'NOT FOUND');

//     if (!shpFile || !dbfFile) {
//       return res.status(400).json({ error: 'Both .shp and .dbf files are required' });
//     }

//     // Sanitize table name
//     const sanitizedTableName = tableName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
//     console.log('Sanitized Table Name:', sanitizedTableName);

//     // BEGIN transaction
//     await client.query('BEGIN');
//     console.log('Transaction: BEGIN');

//     // Check if table exists
//     const tableCheck = await client.query(`
//       SELECT EXISTS (
//         SELECT FROM information_schema.tables
//         WHERE table_schema = DATABASE() AND table_name = $1
//       )
//     `, [sanitizedTableName]);

//     if (tableCheck.rows[0].exists) {
//       await client.query('ROLLBACK');
//       return res.status(400).json({ error: 'Table already exists: ' + sanitizedTableName });
//     }

//     // ============================================================
//     // STEP 1: Analyze shapefile structure
//     // ============================================================
//     console.log('\n--- STEP 1: Analyzing Shapefile ---');
//     const dbfSource = await shapefile.openDbf(dbfFile.path);
//     const firstResult = await dbfSource.read();

//     if (firstResult.done || !firstResult.value) {
//       await client.query('ROLLBACK');
//       return res.status(400).json({ error: 'Shapefile is empty' });
//     }

//     // Sample 50 rows untuk type detection
//     const sampleData = [firstResult.value];
//     let nextResult = await dbfSource.read();
//     let count = 1;

//     while (!nextResult.done && count < 50) {
//       sampleData.push(nextResult.value);
//       nextResult = await dbfSource.read();
//       count++;
//     }

//     console.log('Sample Size:', sampleData.length);
//     console.log('Columns:', Object.keys(firstResult.value).length);

//     // ============================================================
//     // STEP 2: Create table
//     // ============================================================
//     console.log('\n--- STEP 2: Creating Table ---');

// const columnDefs = [];

// for (const [colName, value] of Object.entries(firstResult.value)) {
//   const sanitizedColName = colName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
//   const sampleValues = sampleData.map(row => row[colName]);

//   // Detect column type
//   let colType = 'TEXT'; // Default
//   const nonNullValues = sampleValues.filter(v => v != null && v !== '');

//   if (nonNullValues.length > 0) {
//     const allNumbers = nonNullValues.every(v => {
//       const num = Number(v);
//       return !isNaN(num) && isFinite(num);
//     });

//     if (allNumbers) {
//       const allIntegers = nonNullValues.every(v => Number.isInteger(Number(v)));

//       if (allIntegers) {
//         // GUNAKAN BIGINT untuk semua integer (lebih aman)
//         colType = 'BIGINT';
//       } else {
//         colType = 'DOUBLE PRECISION';
//       }
//     } else {
//       const maxLen = Math.max(...nonNullValues.map(v => String(v).length));
//       colType = maxLen > 255 ? 'TEXT' : 'VARCHAR(255)';
//     }
//   }

//   columnDefs.push(`${sanitizedColName} ${colType}`);
// }

// columnDefs.push('geom geometry(Geometry, 4326)');

// const createTableSQL = `
//   CREATE TABLE ${sanitizedTableName} (
//     gid SERIAL PRIMARY KEY,
//     ${columnDefs.join(',\n        ')}
//   )
// `;

// console.log('Creating table...');
// await client.query(createTableSQL);
// tableCreated = true;
// console.log('âœ“ Table created');

//     // Create spatial index
//     await client.query(`
//       CREATE INDEX ${sanitizedTableName}_geom_idx
//       ON ${sanitizedTableName} USING GIST (geom)
//     `);
//     console.log('âœ“ Spatial index created');

//     // ============================================================
//     // STEP 3: Insert features ONE BY ONE
//     // ============================================================
//     console.log('\n--- STEP 3: Inserting Features ---');
// console.log('Method: ONE-BY-ONE with SAVEPOINT per insert');

// const COMMIT_INTERVAL = 50000;
// let inserted = 0;
// let skipped = 0;
// const errors = [];

// const source = await shapefile.open(shpFile.path, dbfFile.path);
// let result = await source.read();

// while (!result.done) {
//   const feature = result.value;

//   if (feature && feature.geometry && feature.properties && feature.geometry.type) {
//     try {
//       // SAVEPOINT untuk setiap insert
//       await client.query('SAVEPOINT insert_feature');

//       const cols = [];
//       const vals = [];
//       const placeholders = [];
//       let idx = 1;

//       // Properties
//       for (const [colName, value] of Object.entries(feature.properties)) {
//         const sanitizedCol = colName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
//         cols.push(sanitizedCol);

//         // Convert value
//         let convertedValue = value;
//         if (value == null || value === '') {
//           convertedValue = null;
//         } else if (typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== '') {
//           convertedValue = Number(value);
//         }

//         vals.push(convertedValue);
//         placeholders.push(`$${idx++}`);
//       }

//       // Geometry
//       cols.push('geom');
//       vals.push(JSON.stringify(feature.geometry));
//       placeholders.push(`ST_SetSRID(ST_GeomFromGeoJSON($${idx}::json), 4326)`);

//       const insertSQL = `
//         INSERT INTO ${sanitizedTableName} (${cols.join(', ')})
//         VALUES (${placeholders.join(', ')})
//       `;

//       await client.query(insertSQL, vals);
//       await client.query('RELEASE SAVEPOINT insert_feature');

//       inserted++;

//       // Send progress setiap 1000 features
//       if (inserted % 1000 === 0) {
//         console.log(`  Progress: ${inserted} features inserted`);
//         // Kirim progress ke frontend (estimasi, karena kita tidak tahu total features)
//         // Gunakan formula logaritmik agar progress terlihat smooth
//         const estimatedProgress = Math.min(Math.round((inserted / (inserted + 10000)) * 95), 95);
//         sendProgress(sanitizedTableName, estimatedProgress, `${inserted.toLocaleString()} features inserted`);
//       }

//       // COMMIT every 50000
//       if (inserted % COMMIT_INTERVAL === 0) {
//         await client.query('COMMIT');
//         await client.query('BEGIN');
//         console.log(`  ðŸ’¾ COMMIT at ${inserted} features`);
//         sendProgress(sanitizedTableName, Math.min(Math.round((inserted / (inserted + 10000)) * 95), 95), `${inserted.toLocaleString()} features - committing...`);

//         if (global.gc) {
//           global.gc();
//         }
//       }

//     } catch (err) {
//       // ROLLBACK to savepoint jika error
//       await client.query('ROLLBACK TO SAVEPOINT insert_feature');

//       if (errors.length < 5) {
//         errors.push({
//           feature: inserted + skipped + 1,
//           error: err.message,
//           sampleData: Object.entries(feature.properties).slice(0, 3).map(([k,v]) => `${k}=${v}`)
//         });
//       }
//       skipped++;

//       // Jangan stop jika sudah ada yang berhasil
//       if (inserted === 0 && skipped > 100) {
//         throw new Error('Too many errors at start: ' + errors[0].error);
//       }
//     }
//   } else {
//     skipped++;
//   }

//   result = await source.read();

//   // Yield event loop
//   if ((inserted + skipped) % 1000 === 0) {
//     await new Promise(resolve => setImmediate(resolve));
//   }
// }

// console.log('\nâœ“ Insertion Complete');
// console.log('  Inserted:', inserted);
// console.log('  Skipped:', skipped);

// // Kirim progress final 100%
// sendProgress(sanitizedTableName, 100, `Completed: ${inserted.toLocaleString()} features inserted`, true);

// if (errors.length > 0) {
//   console.log('  Sample Errors:');
//   errors.forEach(e => {
//     console.log(`    Feature ${e.feature}: ${e.error}`);
//     if (e.sampleData) console.log(`      Sample: ${e.sampleData.join(', ')}`);
//   });
// }

// if (inserted === 0) {
//   throw new Error('No features inserted');
// }

//     // ============================================================
//     // STEP 4: Save metadata
//     // ============================================================
//     console.log('\n--- STEP 4: Saving Metadata ---');
//     const metaResult = await client.query(`
//       INSERT INTO layer_metadata (table_name, section, original_files)
//       VALUES ($1, $2, $3)
//       RETURNING id, table_name, section, created_at
//     `, [sanitizedTableName, section, files.map(f => f.originalname)]);

//     console.log('âœ“ Metadata saved');

//     // Final COMMIT
//     await client.query('COMMIT');
//     console.log('âœ“ Final COMMIT');

//     // Cleanup
//     uploadedFilePaths.forEach(fp => {
//       try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}
//     });

//     if (global.gc) global.gc();

//     console.log('\n========================================');
//     console.log('SUCCESS');
//     console.log('========================================\n');

//     res.json({
//       success: true,
//       message: `Layer created: ${inserted} features`,
//       layer: {
//         id: metaResult.rows[0].id.toString(),
//         name: metaResult.rows[0].table_name,
//         section: metaResult.rows[0].section,
//         createdAt: metaResult.rows[0].created_at
//       },
//       featureCount: inserted,
//       skippedCount: skipped
//     });

//   } catch (error) {
//     await client.query('ROLLBACK');
//     console.error('\n========================================');
//     console.error('ERROR:', error.message);
//     console.error('========================================\n');

//     if (tableCreated && req.body.tableName) {
//       try {
//         const tbl = req.body.tableName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
//         await client.query(`DROP TABLE IF EXISTS ${tbl} CASCADE`);
//       } catch {}
//     }

//     uploadedFilePaths.forEach(fp => {
//       try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}
//     });

//     res.status(500).json({ error: error.message });
//   } finally {
//     client.release();
//   }
// });

app.post("/api/layers", shapefileUpload.array("files"), async (req, res) => {
  console.log("\n========================================");
  console.log("START POST /api/layers");
  console.log("========================================");

  const client = await pool.connect();
  let uploadedFilePaths = [];
  let tableCreated = false;

  try {
    const { tableName, section } = req.body;
    const files = req.files;

    console.log("Table Name:", tableName);
    console.log("Section:", section);
    console.log("Files Count:", files?.length);

    // Validasi input
    if (!tableName || !section) {
      return res
        .status(400)
        .json({ error: "Table name and section are required" });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    uploadedFilePaths = files.map((f) => f.path);

    // Cari .shp dan .dbf
    const shpFile = files.find((f) =>
      f.originalname.toLowerCase().endsWith(".shp"),
    );
    const dbfFile = files.find((f) =>
      f.originalname.toLowerCase().endsWith(".dbf"),
    );

    console.log("SHP File:", shpFile ? shpFile.originalname : "NOT FOUND");
    console.log("DBF File:", dbfFile ? dbfFile.originalname : "NOT FOUND");

    if (!shpFile || !dbfFile) {
      return res
        .status(400)
        .json({ error: "Both .shp and .dbf files are required" });
    }

    // Sanitize table name
    const sanitizedTableName = tableName
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    console.log("Sanitized Table Name:", sanitizedTableName);

    // BEGIN transaction
    await client.query("BEGIN");
    console.log("Transaction: BEGIN");

    // Check if table exists
    const tableCheck = await client.query(
      `
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = $1
  ) AS exists
  `,
      [sanitizedTableName],
    );

    if (tableCheck.rows[0].exists) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Table already exists: " + sanitizedTableName });
    }

    // ============================================================
    // STEP 1: Analyze shapefile structure
    // ============================================================
    console.log("\n--- STEP 1: Analyzing Shapefile ---");
    const dbfSource = await shapefile.openDbf(dbfFile.path);
    const firstResult = await dbfSource.read();

    if (firstResult.done || !firstResult.value) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Shapefile is empty" });
    }

    // Sample 50 rows untuk type detection
    const sampleData = [firstResult.value];
    let nextResult = await dbfSource.read();
    let count = 1;

    while (!nextResult.done && count < 50) {
      sampleData.push(nextResult.value);
      nextResult = await dbfSource.read();
      count++;
    }

    console.log("Sample Size:", sampleData.length);
    console.log("Columns:", Object.keys(firstResult.value).length);

    // ============================================================
    // STEP 2: Create table
    // ============================================================
    console.log("\n--- STEP 2: Creating Table ---");

    const columnDefs = [];

    for (const [colName, value] of Object.entries(firstResult.value)) {
      const sanitizedColName = colName
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_");
      const sampleValues = sampleData.map((row) => row[colName]);

      // Detect column type
      let colType = "TEXT"; // Default
      const nonNullValues = sampleValues.filter((v) => v != null && v !== "");

      if (nonNullValues.length > 0) {
        const allNumbers = nonNullValues.every((v) => {
          const num = Number(v);
          return !isNaN(num) && isFinite(num);
        });

        if (allNumbers) {
          const allIntegers = nonNullValues.every((v) =>
            Number.isInteger(Number(v)),
          );

          if (allIntegers) {
            // GUNAKAN BIGINT untuk semua integer (lebih aman)
            colType = "BIGINT";
          } else {
            colType = "DOUBLE PRECISION";
          }
        } else {
          const maxLen = Math.max(
            ...nonNullValues.map((v) => String(v).length),
          );
          colType = maxLen > 255 ? "TEXT" : "VARCHAR(255)";
        }
      }

      columnDefs.push(`${sanitizedColName} ${colType}`);
    }

    columnDefs.push("geom_valid geometry(Geometry, 4326)");

    const createTableSQL = `
      CREATE TABLE ${sanitizedTableName} (
        gid SERIAL PRIMARY KEY,
        ${columnDefs.join(",\n        ")}
      )
    `;

    console.log("Creating table...");
    await client.query(createTableSQL);
    tableCreated = true;
    console.log("âœ“ Table created");

    // Create spatial index
    await client.query(`
      CREATE INDEX ${sanitizedTableName}_geom_valid_idx 
      ON ${sanitizedTableName} USING GIST (geom_valid)
    `);
    console.log("âœ“ Spatial index created");

    // ============================================================
    // STEP 3: Insert features ONE BY ONE
    // ============================================================
    console.log("\n--- STEP 3: Inserting Features ---");
    console.log("Method: ONE-BY-ONE with SAVEPOINT per insert");

    const COMMIT_INTERVAL = 50000;
    let inserted = 0;
    let skipped = 0;
    const errors = [];

    const source = await shapefile.open(shpFile.path, dbfFile.path);
    let result = await source.read();

    while (!result.done) {
      const feature = result.value;

      if (
        feature &&
        feature.geometry &&
        feature.properties &&
        feature.geometry.type
      ) {
        try {
          // SAVEPOINT untuk setiap insert
          await client.query("SAVEPOINT insert_feature");

          const cols = [];
          const vals = [];
          const placeholders = [];
          let idx = 1;

          // Properties
          for (const [colName, value] of Object.entries(feature.properties)) {
            const sanitizedCol = colName
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, "_");
            cols.push(sanitizedCol);

            // Convert value
            let convertedValue = value;
            if (value == null || value === "") {
              convertedValue = null;
            } else if (
              typeof value === "string" &&
              !isNaN(Number(value)) &&
              value.trim() !== ""
            ) {
              convertedValue = Number(value);
            }

            vals.push(convertedValue);
            placeholders.push(`$${idx++}`);
          }

          // Geometry dengan ST_MakeValid dan ST_Transform
          cols.push("geom_valid");
          vals.push(JSON.stringify(feature.geometry));
          placeholders.push(
            `ST_MakeValid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($${idx}::json), 4326), 4326))`,
          );

          const insertSQL = `
            INSERT INTO ${sanitizedTableName} (${cols.join(", ")})
            VALUES (${placeholders.join(", ")})
          `;

          await client.query(insertSQL, vals);
          await client.query("RELEASE SAVEPOINT insert_feature");

          inserted++;

          // Send progress setiap 1000 features
          if (inserted % 1000 === 0) {
            console.log(`  Progress: ${inserted} features inserted`);
            // Kirim progress ke frontend (estimasi, karena kita tidak tahu total features)
            // Gunakan formula logaritmik agar progress terlihat smooth
            const estimatedProgress = Math.min(
              Math.round((inserted / (inserted + 10000)) * 95),
              95,
            );
            sendProgress(
              sanitizedTableName,
              estimatedProgress,
              `${inserted.toLocaleString()} features inserted`,
            );
          }

          // COMMIT every 50000
          if (inserted % COMMIT_INTERVAL === 0) {
            await client.query("COMMIT");
            await client.query("BEGIN");
            console.log(`  ðŸ’¾ COMMIT at ${inserted} features`);
            sendProgress(
              sanitizedTableName,
              Math.min(Math.round((inserted / (inserted + 10000)) * 95), 95),
              `${inserted.toLocaleString()} features - committing...`,
            );

            if (global.gc) {
              global.gc();
            }
          }
        } catch (err) {
          // ROLLBACK to savepoint jika error
          await client.query("ROLLBACK TO SAVEPOINT insert_feature");

          if (errors.length < 5) {
            errors.push({
              feature: inserted + skipped + 1,
              error: err.message,
              sampleData: Object.entries(feature.properties)
                .slice(0, 3)
                .map(([k, v]) => `${k}=${v}`),
            });
          }
          skipped++;

          // Jangan stop jika sudah ada yang berhasil
          if (inserted === 0 && skipped > 100) {
            throw new Error("Too many errors at start: " + errors[0].error);
          }
        }
      } else {
        skipped++;
      }

      result = await source.read();

      // Yield event loop
      if ((inserted + skipped) % 1000 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    console.log("\nâœ“ Insertion Complete");
    console.log("  Inserted:", inserted);
    console.log("  Skipped:", skipped);

    // Kirim progress final 100%
    sendProgress(
      sanitizedTableName,
      100,
      `Completed: ${inserted.toLocaleString()} features inserted`,
      true,
    );

    if (errors.length > 0) {
      console.log("  Sample Errors:");
      errors.forEach((e) => {
        console.log(`    Feature ${e.feature}: ${e.error}`);
        if (e.sampleData)
          console.log(`      Sample: ${e.sampleData.join(", ")}`);
      });
    }

    if (inserted === 0) {
      throw new Error("No features inserted");
    }

    // ============================================================
    // STEP 4: Save metadata
    // ============================================================
    console.log("\n--- STEP 4: Saving Metadata ---");
    const metaResult = await client.query(
      `
      INSERT INTO layer_metadata (table_name, section, original_files)
      VALUES ($1, $2, $3)
      RETURNING id, table_name, section, created_at
    `,
      [sanitizedTableName, section, files.map((f) => f.originalname)],
    );

    console.log("âœ“ Metadata saved");

    // Final COMMIT
    await client.query("COMMIT");
    console.log("âœ“ Final COMMIT");

    // Cleanup
    uploadedFilePaths.forEach((fp) => {
      try {
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch {}
    });

    if (global.gc) global.gc();

    console.log("\n========================================");
    console.log("SUCCESS");
    console.log("========================================\n");

    res.json({
      success: true,
      message: `Layer created: ${inserted} features`,
      layer: {
        id: metaResult.rows[0].id.toString(),
        name: metaResult.rows[0].table_name,
        section: metaResult.rows[0].section,
        createdAt: metaResult.rows[0].created_at,
      },
      featureCount: inserted,
      skippedCount: skipped,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("\n========================================");
    console.error("ERROR:", error.message);
    console.error("========================================\n");

    if (tableCreated && req.body.tableName) {
      try {
        const tbl = req.body.tableName
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_]/g, "");
        await client.query(`DROP TABLE IF EXISTS ${tbl} CASCADE`);
      } catch {}
    }

    uploadedFilePaths.forEach((fp) => {
      try {
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch {}
    });

    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Endpoint untuk delete layer
app.delete("/api/layers/:id", async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    // Get table name before deleting
    const metadataResult = await client.query(
      "SELECT table_name FROM layer_metadata WHERE id = $1",
      [id],
    );

    if (metadataResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Layer not found" });
    }

    const tableName = metadataResult.rows[0].table_name;

    // Drop the actual table
    await client.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);

    // Delete metadata
    await client.query("DELETE FROM layer_metadata WHERE id = $1", [id]);

    await client.query("COMMIT");

    res.json({ success: true, message: "Layer deleted successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error deleting layer:", error);
    res.status(500).json({ error: "Failed to delete layer" });
  } finally {
    client.release();
  }
});

app.get("/api/layers/progress/:tableName", (req, res) => {
  const { tableName } = req.params;

  console.log("ðŸ”¥ [GEOJSON] RAW tableName:", JSON.stringify(tableName));
  console.log(
    "ðŸ”¥ [GEOJSON] tableName chars:",
    [...String(tableName || "")].map((c) => `${c}=${c.charCodeAt(0)}`),
  );
  console.log("ðŸ”¥ [GEOJSON] SAFE:", isSafeSqlIdentifier(tableName));

  // Simpan client untuk table name ini
  if (!progressClients.has(tableName)) {
    progressClients.set(tableName, []);
  }
  progressClients.get(tableName).push(res);

  console.log(`SSE client connected for ${tableName}`);

  req.on("close", () => {
    console.log(`SSE client disconnected for ${tableName}`);
    const clients = progressClients.get(tableName);
    if (clients) {
      const index = clients.indexOf(res);
      if (index > -1) {
        clients.splice(index, 1);
      }
      if (clients.length === 0) {
        progressClients.delete(tableName);
      }
    }
  });
});

// Helper function untuk send progress update
function sendProgress(tableName, progress, status, done = false) {
  const clients = progressClients.get(tableName);
  if (clients && clients.length > 0) {
    const data = JSON.stringify({ progress, status, done });
    clients.forEach((client) => {
      client.write(`data: ${data}\n\n`);
    });
    console.log(`Progress sent for ${tableName}: ${progress}% - ${status}`);
  }
}

// ================= Endpoint lengkap yang diganti ================
// app.get('/api/layers/:tableName/geojson', async (req, res) => {
//   const client = await pool.connect();

//   try {
//     const { tableName } = req.params;
//     const { bounds, zoom, dasFilter, adminFilter, adminLevel } = req.query;

//     // Validate table name
//     const validationResult = await client.query(
//       `SELECT table_name FROM layer_metadata WHERE table_name = $1`,
//       [tableName]
//     );

//     if (validationResult.rows.length === 0) {
//       return res.status(404).json({ error: 'Layer not found' });
//     }

//     const columnsResult = await client.query(`
//       SELECT column_name
//       FROM information_schema.columns
//       WHERE table_name = $1 AND column_name != 'geom'
//       ORDER BY ordinal_position
//     `, [tableName]);

//     // Special handling untuk rawan_erosi dan tutupan_lahan
//     let propsSelect;
//     let baseFromClause = `FROM ${tableName} l`;
//     let needsMapping = false;

//     if (tableName === 'rawan_erosi') {
//       const otherColumns = columnsResult.rows
//         .filter(r => r.column_name !== 'kls_a')
//         .map(r => `'${r.column_name}', l.${r.column_name}`)
//         .join(', ');

//       propsSelect = `
//         'tingkat', CASE
//           WHEN l.kls_a = '>480' THEN 'Sangat Tinggi'
//           WHEN l.kls_a ~ '^[0-9]+\.?[0-9]*$' THEN
//             CASE
//               WHEN l.kls_a::numeric <= 15 THEN 'Sangat Rendah'
//               WHEN l.kls_a::numeric <= 60 THEN 'Rendah'
//               WHEN l.kls_a::numeric <= 180 THEN 'Sedang'
//               WHEN l.kls_a::numeric <= 480 THEN 'Tinggi'
//               ELSE 'Sangat Tinggi'
//             END
//           ELSE 'Sangat Tinggi'
//         END${otherColumns ? ',' : ''}
//         ${otherColumns}
//       `;
//     } else if (tableName === 'tutupan_lahan') {
//       needsMapping = true;
//       const otherColumns = columnsResult.rows
//         .map(r => `'${r.column_name}', l.${r.column_name}`)
//         .join(', ');

//       propsSelect = `'deskripsi_domain', COALESCE(m.deskripsi_domain, '')${otherColumns ? ',' : ''} ${otherColumns}`;
//     } else {
//       propsSelect = columnsResult.rows
//         .map(r => `'${r.column_name}', l.${r.column_name}`)
//         .join(', ');
//     }

//     // Toleransi simplifikasi
//     const zoomLevel = zoom ? parseInt(zoom) : 10;
//     let tolerance = 0;

//     console.log('Zoom level', zoomLevel, '- Tolerance:', tolerance);

//     // Build WHERE clause
//     let whereClause = 'WHERE l.geom IS NOT NULL';
//     let fromClause = baseFromClause;
//     let geometrySelect;
//     const FEATURE_LIMIT = 50000;

//     // 1. Cek DAS Filter dengan optimasi
//     if (dasFilter) {
//       try {
//         const dasArray = JSON.parse(dasFilter);
//         if (Array.isArray(dasArray) && dasArray.length > 0) {
//           const dasPlaceholders = dasArray.map((_, i) => `$${i + 1}`).join(',');

//           // Add mapping join if needed
//           if (needsMapping) {
//             fromClause = `FROM ${tableName} l LEFT JOIN mapping_penutupan_lahan m ON CAST(l.pl2024_id AS TEXT) = CAST(m.kode_domain AS TEXT)`;
//           }

//           fromClause += `, (
//             SELECT
//               nama_das,
//               geom,
//               ST_Envelope(geom) as bbox
//             FROM das_adm
//             WHERE nama_das IN (${dasPlaceholders})
//           ) b`;

//           whereClause += ` AND b.nama_das IN (${dasPlaceholders})`;
//           whereClause += ` AND ST_Intersects(
//             ST_Envelope(CASE WHEN ST_SRID(l.geom) = 0 THEN ST_SetSRID(l.geom, 4326) ELSE l.geom END),
//             b.bbox
//           )`;
//           whereClause += ` AND ST_Intersects(
//             CASE WHEN ST_SRID(l.geom) = 0 THEN ST_SetSRID(l.geom, 4326) ELSE l.geom END,
//             CASE WHEN ST_SRID(b.geom) = 0 THEN ST_SetSRID(b.geom, 4326) ELSE b.geom END
//           )`;

//           // Calculate clipped geometry
//           let clippedGeometry;
//           if (tolerance > 0) {
//             clippedGeometry = `ST_Simplify(
//               ST_Intersection(
//                 ST_MakeValid(CASE WHEN ST_SRID(l.geom) = 0 THEN ST_SetSRID(l.geom, 4326) ELSE l.geom END),
//                 ST_MakeValid(CASE WHEN ST_SRID(b.geom) = 0 THEN ST_SetSRID(b.geom, 4326) ELSE b.geom END)
//               ), ${tolerance}
//             )`;
//           } else {
//             clippedGeometry = `ST_Intersection(
//               ST_MakeValid(CASE WHEN ST_SRID(l.geom) = 0 THEN ST_SetSRID(l.geom, 4326) ELSE l.geom END),
//               ST_MakeValid(CASE WHEN ST_SRID(b.geom) = 0 THEN ST_SetSRID(b.geom, 4326) ELSE b.geom END)
//             )`;
//           }

//           geometrySelect = `ST_AsGeoJSON(${clippedGeometry})`;

//           // Calculate area of clipped geometry
//           const clippedAreaSelect = `ST_Area(${clippedGeometry}::geography) / 10000`;

//           // Modify propsSelect to replace luas_ha/luas_total with calculated area
//           let modifiedPropsSelect = propsSelect;

//           if (tableName === 'lahan_kritis' || tableName === 'rawan_erosi' ||
//               tableName === 'rawan_longsor' || tableName === 'rawan_limpasan' ||
//               tableName === 'rawan_karhutla') {
//             modifiedPropsSelect = propsSelect.replace(/'luas_ha',\s*l\.luas_ha/g, `'luas_ha', ${clippedAreaSelect}`);
//           } else if (tableName === 'tutupan_lahan') {
//             // Untuk tutupan lahan juga perlu update luas_total jika ada
//             modifiedPropsSelect = propsSelect.replace(/'luas_total',\s*l\.luas_total/g, `'luas_total', ${clippedAreaSelect}`);
//           }

//           console.log(`Using DAS boundary clipping for ${tableName}:`, dasArray);

//           const queryParams = dasArray;
//           const query = `
//             SELECT
//               ${geometrySelect} as geometry,
//               json_build_object(${modifiedPropsSelect}) as properties
//             ${fromClause}
//             ${whereClause}
//             LIMIT ${FEATURE_LIMIT}
//           `;

//           const result = await client.query(query, queryParams);

//           const features = result.rows.map(row => ({
//             type: 'Feature',
//             geometry: JSON.parse(row.geometry),
//             properties: row.properties
//           }));

//           console.log(`Returning ${features.length} clipped features for ${tableName} (DAS filter)${features.length === FEATURE_LIMIT ? ' - LIMIT REACHED' : ''}`);
//           return res.json({
//             type: 'FeatureCollection',
//             features: features,
//             limitReached: features.length === FEATURE_LIMIT
//           });
//         }
//       } catch (e) {
//         console.error('Error parsing dasFilter:', e);
//       }
//     }

//     // 2. Cek Admin Filter dengan optimasi
//    if (adminFilter && adminLevel) {
//       try {
//         const adminArray = JSON.parse(adminFilter);
//         if (Array.isArray(adminArray) && adminArray.length > 0) {

//           let adminTable, adminColumn;
//           switch(adminLevel) {
//             case 'provinsi':
//               adminTable = 'provinsi';
//               adminColumn = 'provinsi';
//               break;
//             case 'kabupaten':
//               adminTable = 'kab_kota';
//               adminColumn = 'kab_kota';
//               break;
//             case 'kecamatan':
//               adminTable = 'kecamatan';
//               adminColumn = 'kecamatan';
//               break;
//             case 'kelurahan':
//               adminTable = 'kel_desa';
//               adminColumn = 'kel_desa';
//               break;
//             default:
//               adminTable = 'provinsi';
//               adminColumn = 'provinsi';
//           }

//           const adminPlaceholders = adminArray.map((_, i) => `$${i + 1}`).join(',');

//           // Add mapping join if needed
//           if (needsMapping) {
//             fromClause = `FROM ${tableName} l LEFT JOIN mapping_penutupan_lahan m ON CAST(l.pl2024_id AS TEXT) = CAST(m.kode_domain AS TEXT)`;
//           }

//           fromClause += `, (
//             SELECT
//               ${adminColumn},
//               geom,
//               ST_Envelope(geom) as bbox
//             FROM ${adminTable}
//             WHERE ${adminColumn} IN (${adminPlaceholders})
//           ) b`;

//           whereClause += ` AND b.${adminColumn} IN (${adminPlaceholders})`;
//           whereClause += ` AND ST_Intersects(
//             ST_Envelope(CASE WHEN ST_SRID(l.geom) = 0 THEN ST_SetSRID(l.geom, 4326) ELSE l.geom END),
//             b.bbox
//           )`;
//           whereClause += ` AND ST_Intersects(
//             CASE WHEN ST_SRID(l.geom) = 0 THEN ST_SetSRID(l.geom, 4326) ELSE l.geom END,
//             b.geom
//           )`;

//           // Calculate clipped geometry
//           let clippedGeometry;
//           if (tolerance > 0) {
//             clippedGeometry = `ST_Simplify(
//               ST_Intersection(
//                 ST_MakeValid(CASE WHEN ST_SRID(l.geom) = 0 THEN ST_SetSRID(l.geom, 4326) ELSE l.geom END),
//                 ST_MakeValid(b.geom)
//               ), ${tolerance}
//             )`;
//           } else {
//             clippedGeometry = `ST_Intersection(
//               ST_MakeValid(CASE WHEN ST_SRID(l.geom) = 0 THEN ST_SetSRID(l.geom, 4326) ELSE l.geom END),
//               ST_MakeValid(b.geom)
//             )`;
//           }

//           geometrySelect = `ST_AsGeoJSON(${clippedGeometry})`;

//           // Calculate area of clipped geometry and replace luas_ha in properties
//           // Area dihitung dalam meter persegi, convert ke hektar (/ 10000)
//           const clippedAreaSelect = `ST_Area(${clippedGeometry}::geography) / 10000`;

//           // Modify propsSelect to replace luas_ha with calculated area
//           let modifiedPropsSelect = propsSelect;

//           // Replace luas_ha with calculated area for tables that have luas_ha field
//           if (tableName === 'lahan_kritis' || tableName === 'rawan_erosi' ||
//               tableName === 'rawan_longsor' || tableName === 'rawan_limpasan' ||
//               tableName === 'rawan_karhutla') {
//             // Remove luas_ha from original propsSelect and add calculated one
//             modifiedPropsSelect = propsSelect.replace(/'luas_ha',\s*l\.luas_ha/g, `'luas_ha', ${clippedAreaSelect}`);
//           }

//           console.log(`Using ${adminLevel} boundary clipping for ${tableName}:`, adminArray);

//           const queryParams = adminArray;
//           const query = `
//             SELECT
//               ${geometrySelect} as geometry,
//               json_build_object(${modifiedPropsSelect}) as properties
//             ${fromClause}
//             ${whereClause}
//             LIMIT ${FEATURE_LIMIT}
//           `;

//           const result = await client.query(query, queryParams);

//           const features = result.rows.map(row => ({
//             type: 'Feature',
//             geometry: JSON.parse(row.geometry),
//             properties: row.properties
//           }));

//           console.log(`Returning ${features.length} clipped features for ${tableName} (${adminLevel} filter)${features.length === FEATURE_LIMIT ? ' - LIMIT REACHED' : ''}`);
//           return res.json({
//             type: 'FeatureCollection',
//             features: features,
//             limitReached: features.length === FEATURE_LIMIT
//           });
//         }
//       } catch (e) {
//         console.error('Error parsing adminFilter:', e);
//       }
//     }

//     // 3. Jika tidak ada boundary filter, gunakan bounds biasa (ST_Intersects)
//     // Add mapping join if needed
//     if (needsMapping) {
//       fromClause = `FROM ${tableName} l LEFT JOIN mapping_penutupan_lahan m ON CAST(l.pl2024_id AS TEXT) = CAST(m.kode_domain AS TEXT)`;
//     }

//     if (bounds) {
//       const [south, west, north, east] = bounds.split(',').map(Number);
//       const boundsWKT = `POLYGON((${west} ${south}, ${east} ${south}, ${east} ${north}, ${west} ${north}, ${west} ${south}))`;

//       whereClause += ` AND ST_Intersects(
//         CASE WHEN ST_SRID(l.geom) = 0 THEN ST_SetSRID(l.geom, 4326) ELSE l.geom END,
//         ST_GeomFromText('${boundsWKT}', 4326)
//       )`;

//       if (tolerance > 0) {
//         geometrySelect = `ST_AsGeoJSON(ST_Simplify(
//           ST_MakeValid(CASE WHEN ST_SRID(l.geom) = 0 THEN ST_SetSRID(l.geom, 4326) ELSE l.geom END),
//           ${tolerance}
//         ))`;
//       } else {
//         geometrySelect = `ST_AsGeoJSON(
//           ST_MakeValid(CASE WHEN ST_SRID(l.geom) = 0 THEN ST_SetSRID(l.geom, 4326) ELSE l.geom END)
//         )`;
//       }

//       console.log(`Using bounds filtering (ST_Intersects) for ${tableName}`);
//     } else {
//       if (tolerance > 0) {
//         geometrySelect = `ST_AsGeoJSON(ST_Simplify(
//           ST_MakeValid(CASE WHEN ST_SRID(l.geom) = 0 THEN ST_SetSRID(l.geom, 4326) ELSE l.geom END),
//           ${tolerance}
//         ))`;
//       } else {
//         geometrySelect = `ST_AsGeoJSON(
//           ST_MakeValid(CASE WHEN ST_SRID(l.geom) = 0 THEN ST_SetSRID(l.geom, 4326) ELSE l.geom END)
//         )`;
//       }
//     }

//     const query = `
//       SELECT
//         ${geometrySelect} as geometry,
//         json_build_object(${propsSelect}) as properties
//       ${fromClause}
//       ${whereClause}
//       LIMIT ${FEATURE_LIMIT}
//     `;

//     const result = await client.query(query);

//     const features = result.rows.map(row => ({
//       type: 'Feature',
//       geometry: JSON.parse(row.geometry),
//       properties: row.properties
//     }));

//     console.log(`Returning ${features.length} features for ${tableName}${features.length === FEATURE_LIMIT ? ' - LIMIT REACHED' : ''}`);
//     res.json({
//       type: 'FeatureCollection',
//       features: features,
//       limitReached: features.length === FEATURE_LIMIT
//     });

//   } catch (error) {
//     console.error('Error fetching GeoJSON:', error);
//     res.status(500).json({ error: 'Failed to fetch layer data: ' + error.message });
//   } finally {
//     client.release();
//   }
// });
// ================= Akhir endpoint ================

// ============================================================================
// CANONICAL GEOJSON LAYER ENDPOINT
// Frontend: GET /api/layers/:tableName/geojson
// MySQL/phpMyAdmin compatible implementation for the SIMITIGASI map.
// ============================================================================
const isSafeSqlIdentifier = (value) =>
  /^[A-Za-z0-9_]+$/.test(String(value || ""));

const parseJsonArrayQuery = (value, name) => {
  if (value == null || value === "") return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) throw new Error(`${name} harus berupa array`);
    return parsed.map((v) => String(v).trim()).filter(Boolean);
  } catch (error) {
    throw new Error(`${name} tidak valid: ${error.message}`);
  }
};

const makeWktBounds = (bounds) => {
  if (!bounds) return null;
  const nums = String(bounds).split(",").map(Number);
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) {
    throw new Error("bounds harus berbentuk minLat,minLng,maxLat,maxLng");
  }
  const [south, west, north, east] = nums;
  if (
    south < -90 ||
    south > 90 ||
    north < -90 ||
    north > 90 ||
    west < -180 ||
    west > 180 ||
    east < -180 ||
    east > 180
  ) {
    throw new Error("bounds berada di luar rentang koordinat yang valid");
  }
  return `POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`;
};

// ================================================================
// BNPB InaRISK live image proxy
// ================================================================
const BNPB_INARISK_SERVICES = (() => {
  const raw = String(process.env.BNPB_IMAGE_SERVICES_JSON || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (error) {
    console.error("BNPB_IMAGE_SERVICES_JSON tidak valid:", error);
    return {};
  }
})();

const parseBnpbNumber = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

app.get("/api/bnpb/layers/:key/image", async (req, res) => {
  const startedAt = Date.now();
  try {
    const config = BNPB_INARISK_SERVICES[req.params.key];
    if (!config)
      return res.status(404).json({
        success: false,
        error: "BNPB layer not configured",
        key: req.params.key,
      });

    let south = parseBnpbNumber(req.query.south, -11, -90, 90);
    let west = parseBnpbNumber(req.query.west, 95, -180, 180);
    let north = parseBnpbNumber(req.query.north, 6, -90, 90);
    let east = parseBnpbNumber(req.query.east, 141, -180, 180);
    const zoom = parseBnpbNumber(req.query.zoom, 5, 0, 24);
    if (south > north) [south, north] = [north, south];
    if (west > east) [west, east] = [east, west];

    const width = Math.round(
      parseBnpbNumber(req.query.width, zoom >= 10 ? 1600 : 1200, 800, 1600),
    );
    const height = Math.round(
      parseBnpbNumber(req.query.height, zoom >= 10 ? 1200 : 900, 600, 1200),
    );
    const params = new URLSearchParams({
      bbox: `${west},${south},${east},${north}`,
      bboxSR: "4326",
      imageSR: "4326",
      size: `${width},${height}`,
      format: "png32",
      transparent: "true",
      f: "image",
    });
    if (config.type === "MapServer")
      params.set("layers", `show:${config.layerId}`);

    const upstreamUrl = `${config.url}/${config.type === "MapServer" ? "export" : "exportImage"}?${params.toString()}`;
    console.log("ðŸ›°ï¸ [BNPB PROXY]", {
      key: req.params.key,
      type: config.type,
      zoom,
      bbox: params.get("bbox"),
      size: params.get("size"),
    });

    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: "image/png,image/*;q=0.9,*/*;q=0.1" },
    });
    const contentType = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !contentType.toLowerCase().startsWith("image/")) {
      const body = await upstream.text();
      console.error("âŒ [BNPB PROXY] upstream error", {
        key: req.params.key,
        status: upstream.status,
        body: body.slice(0, 1000),
      });
      return res.status(502).json({
        success: false,
        error: "BNPB upstream error",
        key: req.params.key,
        upstreamStatus: upstream.status,
        message: body.slice(0, 1000),
      });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.set({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=30",
      "X-BNPB-Layer": req.params.key,
      "X-BNPB-Zoom": String(zoom),
    });
    console.log(
      `âœ… [BNPB PROXY] ${config.name}: ${buffer.length} bytes (${Date.now() - startedAt}ms)`,
    );
    return res.send(buffer);
  } catch (error) {
    console.error("âŒ [BNPB PROXY]", req.params.key, error);
    return res.status(500).json({
      success: false,
      error: "Failed to load BNPB layer",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================
// LAYER OVERLAY API
// ============================================================
// Catalog mengambil sumber yang sama dengan GET /api/layers:
// tabel layer_metadata. Endpoint data TIDAK membuat mesin GeoJSON
// baru; frontend cukup diarahkan ke /api/layers/:tableName/geojson.
//
// Endpoint:
//   GET /api/layer-overlay/catalog
//   GET /api/layer-overlay/data/:layerId
//   GET /api/layer-overlay/health
// ============================================================

app.get("/api/layer-overlay/health", async (req, res) => {
  res.json({
    success: true,
    service: "layer-overlay",
    catalog: "/api/layer-overlay/catalog",
    data: "/api/layer-overlay/data/:layerId",
    geojson: "/api/layers/:tableName/geojson",
  });
});

app.get("/api/layer-overlay/catalog", async (req, res) => {
  const startedAt = Date.now();

  try {
    console.log("ðŸ“š [LAYER OVERLAY] GET /api/layer-overlay/catalog");

    // ============================================================
    // 1. LOAD LAYER METADATA
    // ============================================================
    const result = await pool.query(`
      SELECT
        lm.id,
        lm.table_name,
        lm.section,
        lm.original_files,
        lm.created_at,
        lm.updated_at
      FROM layer_metadata lm
      ORDER BY lm.created_at DESC, lm.id DESC
    `);

    const authorizedLayerIds = await getAuthorizedLayerIds(req);
    const visibleMetadataRows =
      authorizedLayerIds === null || authorizedLayerIds === "ALL"
        ? result.rows
        : result.rows.filter((row) => authorizedLayerIds.has(Number(row.id)));

    if (visibleMetadataRows.length === 0) {
      return res.json({
        success: true,
        count: 0,
        layers: [],
        grouped: {
          kerawanan: [],
          mitigasiAdaptasi: [],
          lainnya: [],
          kejadian: [],
        },
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      });
    }

    // ============================================================
    // 2. LOAD TABLE + GEOMETRY INFORMATION SEKALIGUS
    //
    // Jangan melakukan COUNT(*) ke setiap tabel.
    // Catalog hanya membaca metadata PostgreSQL/PostGIS.
    // ============================================================
    const tableNames = visibleMetadataRows.map((row) => row.table_name);

    const geometryResult = await pool.query(
      `
        SELECT
          c.table_name,
          c.column_name,
          c.udt_name,
          c.data_type
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = ANY($1::text[])
          AND (
            c.udt_name = 'geometry'
            OR c.data_type ILIKE '%geometry%'
          )
        ORDER BY
          c.table_name,
          CASE
            WHEN c.column_name = 'geom_valid' THEN 1
            WHEN c.column_name = 'geom' THEN 2
            ELSE 3
          END,
          c.ordinal_position
      `,
      [tableNames],
    );

    // ============================================================
    // 3. MAP GEOMETRY COLUMN
    //
    // Prioritas:
    //   geom_valid
    //   geom
    //   geometry column lainnya
    // ============================================================
    const geometryMap = new Map();

    for (const row of geometryResult.rows) {
      if (!geometryMap.has(row.table_name)) {
        geometryMap.set(row.table_name, row.column_name);
      }
    }

    // ============================================================
    // 4. BUILD LAYERS
    // ============================================================
    const layers = [];

    for (const row of visibleMetadataRows) {
      const geometryColumn = geometryMap.get(row.table_name);

      // Tidak punya geometry â†’ bukan layer spatial
      if (!geometryColumn) {
        continue;
      }

      const sectionLabel =
        {
          kerawanan: "Kerawanan",
          mitigasiAdaptasi: "Mitigasi & Adaptasi",
          lainnya: "Lainnya",
          kejadian: "Kejadian",
        }[row.section] || row.section;

      layers.push({
        id: String(row.id),

        tableName: row.table_name,
        name: row.table_name,

        section: row.section,
        sectionLabel,

        originalFiles: Array.isArray(row.original_files)
          ? row.original_files
          : [],

        createdAt: row.created_at,
        updatedAt: row.updated_at,

        geometryColumn,

        // ========================================================
        // IMPORTANT:
        // Jangan COUNT(*) di catalog.
        // ========================================================
        featureCount: null,

        // Geometry metadata akan diambil lazy ketika diperlukan.
        geometryType: null,
        srid: null,

        isManual: true,
        isShapefile: true,
        visible: true,

        dataUrl: `/api/layer-overlay/data/${encodeURIComponent(String(row.id))}`,

        geojsonUrl: `/api/layers/${encodeURIComponent(row.table_name)}/geojson`,
      });
    }

    // ============================================================
    // 5. GROUPING
    // ============================================================
    const grouped = {
      kerawanan: [],
      mitigasiAdaptasi: [],
      lainnya: [],
      kejadian: [],
    };

    for (const layer of layers) {
      if (!grouped[layer.section]) {
        grouped[layer.section] = [];
      }

      grouped[layer.section].push(layer);
    }

    const durationMs = Date.now() - startedAt;

    console.log(
      `âœ… [LAYER OVERLAY] catalog loaded: ${layers.length} layers in ${durationMs}ms`,
    );

    // ============================================================
    // 6. RESPONSE
    // ============================================================
    return res.json({
      success: true,

      count: layers.length,

      layers,

      grouped,

      generatedAt: new Date().toISOString(),

      durationMs,
    });
  } catch (error) {
    console.error("âŒ [LAYER OVERLAY] catalog error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to load layer overlay catalog",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/layer-overlay/data/:layerId", async (req, res) => {
  try {
    const rawLayerId = String(req.params.layerId || "").trim();

    if (!rawLayerId) {
      return res.status(400).json({
        success: false,
        error: "Layer ID is required",
      });
    }

    let metadataResult;

    // Primary mode: layer ID dari layer_metadata.
    if (/^\d+$/.test(rawLayerId)) {
      metadataResult = await pool.query(
        `
          SELECT id, table_name, section, original_files, created_at, updated_at
          FROM layer_metadata
          WHERE id = $1
          LIMIT 1
        `,
        [Number(rawLayerId)],
      );
    } else {
      // Fallback: izinkan frontend langsung mengirim tableName.
      if (!isSafeSqlIdentifier(rawLayerId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid layer ID/table name",
        });
      }

      metadataResult = await pool.query(
        `
          SELECT id, table_name, section, original_files, created_at, updated_at
          FROM layer_metadata
          WHERE table_name = $1
          LIMIT 1
        `,
        [rawLayerId],
      );
    }

    if (!metadataResult.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Layer not found",
        message: `Layer '${rawLayerId}' tidak ditemukan di layer_metadata.`,
      });
    }

    const layer = metadataResult.rows[0];

    const layerAuth = await authorizeLayerByTable(req, layer.table_name, pool);
    if (!layerAuth.ok) {
      return res.status(layerAuth.status).json({
        success: false,
        error: "Layer access denied",
        message: layerAuth.message,
      });
    }

    // Jangan membuat query GeoJSON kedua di sini.
    // Kembalikan URL ke mesin GeoJSON yang sudah ada.
    const geojsonUrl = `/api/layers/${encodeURIComponent(layer.table_name)}/geojson`;

    res.json({
      success: true,
      id: String(layer.id),
      tableName: layer.table_name,
      name: layer.table_name,
      section: layer.section,
      originalFiles: Array.isArray(layer.original_files)
        ? layer.original_files
        : [],
      createdAt: layer.created_at,
      updatedAt: layer.updated_at,
      geojsonUrl,
      dataUrl: geojsonUrl,
      // Bisa langsung dipakai frontend sebagai endpoint layer.
      endpoint: geojsonUrl,
    });
  } catch (error) {
    console.error("âŒ [LAYER OVERLAY] data error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to resolve layer overlay data",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/layers/:tableName/geojson", async (req, res) => {
  const client = await pool.connect();
  const startedAt = Date.now();

  try {
    const { tableName } = req.params;
    const { bounds, dasFilter, adminFilter, adminLevel } = req.query;

    console.log("ðŸ—ºï¸ [GEOJSON] request", {
      tableName,
      bounds: bounds || null,
      adminLevel: adminLevel || null,
      hasDasFilter: Boolean(dasFilter),
      hasAdminFilter: Boolean(adminFilter),
    });

    // ENTERPRISE AUTHORIZATION: can_view wajib untuk layer yang terdaftar.
    const layerAuth = await authorizeLayerByTable(req, tableName, client);
    if (!layerAuth.ok) {
      console.warn(
        `ðŸš« [GEOJSON] DENIED user=${layerAuth.user?.id ?? "anonymous"} layer=${tableName}`,
      );
      return res.status(layerAuth.status).json({
        success: false,
        error: "Layer access denied",
        message: layerAuth.message,
        layer: tableName,
      });
    }

    if (!isSafeSqlIdentifier(tableName)) {
      return res.status(400).json({
        success: false,
        error: "Invalid layer name",
        message: "Nama layer hanya boleh berisi huruf, angka, dan underscore.",
      });
    }

    // Jangan bergantung hanya pada layer_metadata. Beberapa tabel GIS lama
    // masih bisa dipakai oleh map walaupun metadata-nya belum diisi.
    const tableCheck = await client.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
          AND table_type = 'BASE TABLE'
        LIMIT 1
      `,
      [tableName],
    );

    if (!tableCheck.rows?.length) {
      return res.status(404).json({
        success: false,
        error: "Layer not found",
        message: `Tabel '${tableName}' tidak ditemukan di database.`,
      });
    }

    const columnsResult = await client.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position
      `,
      [tableName],
    );

    const columns = columnsResult.rows.map((r) => r.column_name);
    const geometryColumn = columns.includes("geom_valid")
      ? "geom_valid"
      : columns.includes("geom")
        ? "geom"
        : null;

    if (!geometryColumn) {
      return res.status(422).json({
        success: false,
        error: "Layer has no geometry",
        message: `Tabel '${tableName}' tidak mempunyai kolom geom/geom_valid.`,
      });
    }

    const infraColsWhitelist = {
      bendung: [
        "nama_infra",
        "kondisi_ba",
        "teknis_kon",
        "kelurahan",
        "kecamatan",
        "kabkot_nam",
        "prov_name",
        "daerah_ali",
        "latitude",
        "longitude",
      ],
      bendungan: [
        "nama_infra",
        "kondisi_ba",
        "kelurahan",
        "kecamatan",
        "kabkot_nam",
        "prov_name",
        "daerah_ali",
        "latitude",
        "longitude",
      ],
      danau: [
        "nama_aset",
        "kelurahan",
        "kecamatan",
        "kabkot_nam",
        "prov_name",
        "daerah_ali",
        "latitude",
        "longitude",
      ],
      embung: [
        "nama_infra",
        "kondisi_ba",
        "teknis_sum",
        "kelurahan",
        "kecamatan",
        "kabkot_nam",
        "prov_name",
        "daerah_ali",
        "latitude",
        "longitude",
      ],
      situ: [
        "nama_aset",
        "kelurahan",
        "kecamatan",
        "kabkot_nam",
        "prov_name",
        "daerah_ali",
        "latitude",
        "longitude",
      ],
      pengaman_pantai: [
        "nama_infra",
        "kondisi_ba",
        "teknis_kon",
        "kelurahan",
        "kecamatan",
        "kabkot_nam",
        "provinsi",
        "daerah_ali",
        "latitude_a",
        "longitude_",
      ],
      pengendali_sedimen: [
        "nama_infra",
        "kondisi_ba",
        "teknis_kon",
        "kelurahan",
        "kecamatan",
        "kabkot_nam",
        "prov_name",
        "daerah_ali",
        "latitude",
        "longitude",
      ],
      pompa_air: [
        "nama_infra",
        "kondisi_ba",
        "teknis_kon",
        "kelurahan",
        "kecamatan",
        "kabkot_nam",
        "prov_name",
        "daerah_ali",
        "latitude",
        "longitude",
      ],
    };

    const excluded = new Set([geometryColumn, "geom", "geom_valid"]);
    let selectedCols = (
      infraColsWhitelist[tableName] ||
      columns.filter((c) => !excluded.has(c)).slice(0, 48)
    ).filter((c) => columns.includes(c) && isSafeSqlIdentifier(c));

    // Hindari query JSON_OBJECT kosong.
    if (selectedCols.length === 0) selectedCols = [];

    const jsonPairs = [];
    for (const col of selectedCols) {
      jsonPairs.push(`'${col}', l.${col}`);
    }

    // Fix escape marker above if generated through a shell/editor.
    const cleanJsonPairs = jsonPairs.map((x) =>
      x.replace(/\x1b\[1m|\x1b\[0m/g, ""),
    );

    if (
      ["tutupan_lahan", "penutupan_lahan_2024", "pl2024"].includes(tableName)
    ) {
      cleanJsonPairs.unshift(
        `'deskripsi_domain', COALESCE(m.deskripsi_domain, '')`,
      );
    }

    const propertiesSql = cleanJsonPairs.length
      ? `json_build_object(${cleanJsonPairs.join(", ")})`
      : `json_build_object()`;

    let fromSql = `FROM "${tableName}" l`;
    if (
      ["tutupan_lahan", "penutupan_lahan_2024", "pl2024"].includes(tableName) &&
      columns.includes("pl2024_id")
    ) {
      fromSql += ` LEFT JOIN mapping_penutupan_lahan m ON CAST(l.pl2024_id AS TEXT) = CAST(m.kode_domain AS TEXT)`;
    }

    const conditions = [`l.${geometryColumn} IS NOT NULL`];
    const params = [];

    // Bounds memakai MBRIntersects agar kompatibel dengan MySQL 8 dan tidak
    // bergantung pada ST_MakeEnvelope PostgreSQL.
    if (bounds) {
      const wkt = makeWktBounds(bounds);
      conditions.push(
        `ST_Intersects(l.${geometryColumn}, ST_GeomFromText($1, 4326))`,
      );
      params.push(wkt);
    }

    // Filter DAS: gunakan boundary union, tetapi tetap kembalikan geometry asli
    // supaya rendering cepat dan tidak bergantung pada ST_Intersection.
    const dasNames = parseJsonArrayQuery(dasFilter, "dasFilter");
    if (dasNames?.length) {
      const placeholders = dasNames
        .map((_, i) => `$${params.length + i + 1}`)
        .join(", ");
      fromSql += ` JOIN (SELECT ST_Union(geom_valid) AS geom_valid FROM das_adm WHERE nama_das IN (${placeholders})) b_das ON 1=1`;
      params.push(...dasNames);
      conditions.push(`ST_Intersects(l.${geometryColumn}, b_das.geom_valid)`);
    }

    const adminNames = parseJsonArrayQuery(adminFilter, "adminFilter");
    if (adminNames?.length) {
      const adminConfig = {
        provinsi: ["provinsi", "provinsi"],
        kabupaten: ["kab_kota", "kab_kota"],
        kecamatan: ["kecamatan", "kecamatan"],
        kelurahan: ["kel_desa", "kel_desa"],
      }[String(adminLevel || "").toLowerCase()];

      if (!adminConfig) {
        return res.status(400).json({
          success: false,
          error: "Invalid adminLevel",
          message:
            "adminLevel harus provinsi, kabupaten, kecamatan, atau kelurahan.",
        });
      }

      const [adminTable, adminColumn] = adminConfig;
      const adminCheck = await client.query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name IN ($2, 'geom_valid', 'geom')
        `,
        [adminTable, adminColumn],
      );
      const adminColumns = adminCheck.rows.map((r) => r.column_name);
      const adminGeom = adminColumns.includes("geom_valid")
        ? "geom_valid"
        : adminColumns.includes("geom")
          ? "geom"
          : null;
      if (!adminGeom || !adminColumns.includes(adminColumn)) {
        return res.status(500).json({
          success: false,
          error: "Admin boundary unavailable",
          message: `Boundary ${adminTable} tidak mempunyai kolom yang diperlukan.`,
        });
      }

      const placeholders = adminNames
        .map((_, i) => `$${params.length + i + 1}`)
        .join(", ");
      fromSql += ` JOIN "${adminTable}" b_admin ON b_admin."${adminColumn}" IN (${placeholders})`;
      params.push(...adminNames);
      conditions.push(
        `ST_Intersects(l.${geometryColumn}, b_admin.${adminGeom})`,
      );
    }

    const FEATURE_LIMIT = 100000;
    const query = `
      SELECT
        ST_AsGeoJSON(l.${geometryColumn}) AS geometry,
        ${propertiesSql} AS properties
      ${fromSql}
      WHERE ${conditions.join(" AND ")}
      LIMIT ${FEATURE_LIMIT}
    `;

    const result = await client.query(query, params);
    const features = [];

    for (const row of result.rows) {
      if (!row.geometry) continue;
      try {
        features.push({
          type: "Feature",
          geometry:
            typeof row.geometry === "string"
              ? JSON.parse(row.geometry)
              : row.geometry,
          properties: row.properties || {},
        });
      } catch (parseError) {
        console.warn(
          `âš ï¸ [GEOJSON] geometry invalid pada ${tableName}:`,
          parseError.message,
        );
      }
    }

    console.log(
      `âœ… [GEOJSON] ${tableName}: ${features.length} features (${Date.now() - startedAt}ms)`,
    );

    return res.json({
      type: "FeatureCollection",
      features,
      limitReached: result.rows.length === FEATURE_LIMIT,
      success: true,
      layer: tableName,
    });
  } catch (err) {
    console.error(`âŒ [GEOJSON] ${req.params.tableName}:`, err);
    return res.status(500).json({
      success: false,
      error: "Failed to load GeoJSON layer",
      message: err instanceof Error ? err.message : String(err),
      layer: req.params.tableName,
    });
  } finally {
    client.release();
  }
});

// Alias yang eksplisit untuk debugging/browser testing.
app.get("/api/layers/:tableName/geojson/health", async (req, res) => {
  res.json({
    success: true,
    route: "/api/layers/:tableName/geojson",
    tableName: req.params.tableName,
  });
});

app.get("/api/penutupan-lahan-2024-by-das", async (req, res) => {
  try {
    const { das } = req.query;

    if (!das) {
      return res.status(400).json({
        error: "Missing required parameter: das",
      });
    }

    console.log("Fetching penutupan lahan 2024 for DAS:", das);

    // Query untuk cek kolom yang ada
    const checkColumnsQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'penutupan_lahan_2024' 
        AND column_name IN ('n_a', 'luas_ha', 'shape_area', 'luasan')
    `;

    const colCheck = await pool.query(checkColumnsQuery);
    const availableColumns = colCheck.rows.map((r) => r.column_name);

    console.log(
      "Available area columns in penutupan_lahan_2024:",
      availableColumns,
    );

    // Tentukan kolom luas yang digunakan
    let luasColumn = "shape_area"; // default
    if (availableColumns.includes("luas_ha")) {
      luasColumn = "luas_ha";
    } else if (availableColumns.includes("n_a")) {
      luasColumn = "n_a";
    } else if (availableColumns.includes("luasan")) {
      luasColumn = "luasan";
    }

    console.log("Using area column:", luasColumn);

    const query = `
      SELECT 
        pl.pl2024_id,
        COALESCE(mpl.deskripsi_domain, 'Penutupan Lahan ' || pl.pl2024_id::text) as deskripsi_domain,
        COUNT(*) as count,
        SUM(pl.${luasColumn}) as total_luas_ha
      FROM penutupan_lahan_2024 pl
      LEFT JOIN mapping_penutupan_lahan mpl 
        ON pl.pl2024_id::text = mpl.kode_domain::text
      WHERE pl.geom_valid IS NOT NULL
        AND ST_Intersects(
          pl.geom_valid,
          (SELECT ST_Union(geom_valid) FROM das_adm WHERE nama_das = $1)
        )
      GROUP BY pl.pl2024_id, mpl.deskripsi_domain
      ORDER BY total_luas_ha DESC
    `;

    const result = await pool.query(query, [das]);

    console.log(
      `Found ${result.rows.length} penutupan lahan 2024 types in DAS`,
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching penutupan lahan 2024 by DAS:", error);
    res.status(500).json({
      error: "Failed to fetch penutupan lahan 2024 data",
      details: error.message,
    });
  }
});

app.get("/api/das/by-coordinates", async (req, res) => {
  const client = await pool.connect();

  try {
    const { longitude, latitude } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        error: "Longitude dan latitude diperlukan",
      });
    }

    const lon = parseFloat(longitude);
    const lat = parseFloat(latitude);

    // Validasi koordinat
    if (isNaN(lon) || isNaN(lat)) {
      return res.status(400).json({
        success: false,
        error: "Koordinat tidak valid",
      });
    }

    console.log("Querying DAS for coordinates:", {
      longitude: lon,
      latitude: lat,
    });

    // Query yang lebih aman - cek SRID dan set jika perlu
    const query = `
      SELECT 
        nama_das,
        CASE 
          WHEN ST_SRID(geom) = 0 OR ST_SRID(geom) IS NULL THEN
            ST_Distance(
              ST_Transform(ST_SetSRID(geom, 4326), 4326)::geography,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
            )
          ELSE
            ST_Distance(
              geom::geography,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
            )
        END as distance
      FROM das_adm
      WHERE 
        CASE 
          WHEN ST_SRID(geom) = 0 OR ST_SRID(geom) IS NULL THEN
            ST_Contains(
              ST_SetSRID(geom, 4326),
              ST_SetSRID(ST_MakePoint($1, $2), 4326)
            )
          ELSE
            ST_Contains(
              geom,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)
            )
        END
      ORDER BY distance
      LIMIT 1
    `;

    const result = await client.query(query, [lon, lat]);

    if (result.rows.length > 0) {
      console.log("Found DAS:", result.rows[0].nama_das);
      res.json({
        success: true,
        das: result.rows[0].nama_das,
      });
    } else {
      // Cari DAS terdekat
      const nearestQuery = `
        SELECT 
          nama_das,
          CASE 
            WHEN ST_SRID(geom) = 0 OR ST_SRID(geom) IS NULL THEN
              ST_Distance(
                ST_Transform(ST_SetSRID(geom, 4326), 4326)::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
              )
            ELSE
              ST_Distance(
                geom::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
              )
          END as distance
        FROM das_adm
        ORDER BY distance
        LIMIT 1
      `;

      const nearestResult = await client.query(nearestQuery, [lon, lat]);

      if (nearestResult.rows.length > 0) {
        const distanceKm = (nearestResult.rows[0].distance / 1000).toFixed(2);
        console.log(
          `No DAS contains point, returning nearest: ${nearestResult.rows[0].nama_das} (${distanceKm} km away)`,
        );
        res.json({
          success: true,
          das: nearestResult.rows[0].nama_das,
          isNearest: true,
          distance: nearestResult.rows[0].distance,
        });
      } else {
        res.json({
          success: false,
          error: "Tidak ada DAS ditemukan",
        });
      }
    }
  } catch (error) {
    console.error("Error getting DAS by coordinates:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// Endpoint untuk search area dari tabel kel_desa
app.get("/api/areas/search", async (req, res) => {
  const client = await pool.connect();

  try {
    const { query, level } = req.query;

    console.log("ðŸ” [SEARCH] Incoming request:", { query, level });

    if (!query || query.trim().length < 2) {
      console.log("âŒ [SEARCH] Query too short or empty");
      return res.json([]);
    }

    if (!level) {
      return res.status(400).json({
        error:
          "Level parameter required (provinsi/kabupaten/kecamatan/kelurahan)",
      });
    }

    const searchPattern = `%${query.toLowerCase().trim()}%`;
    console.log("ðŸ“ [SEARCH] Search pattern:", searchPattern);

    let result;

    switch (level.toLowerCase()) {
      case "provinsi":
        console.log("ðŸ—ºï¸  [SEARCH] Searching provinsi...");
        const provinsiResult = await client.query(
          `
          SELECT 
            provinsi,
            ST_AsGeoJSON(ST_SetSRID(ST_Union(geom_valid), 4326)) as geom_json
          FROM provinsi
          WHERE LOWER(provinsi) LIKE $1
          GROUP BY provinsi
          ORDER BY provinsi
          LIMIT 50
        `,
          [searchPattern],
        );

        console.log(
          `âœ… [SEARCH] Found ${provinsiResult.rows.length} provinsi results`,
        );
        if (provinsiResult.rows.length > 0) {
          console.log(
            "ðŸ“‹ [SEARCH] Sample results:",
            provinsiResult.rows.slice(0, 3).map((r) => r.provinsi),
          );
        }

        return res.json(
          provinsiResult.rows.map((row) => ({
            label: row.provinsi,
            provinsi: row.provinsi,
            level: "provinsi",
            geom: row.geom_json ? JSON.parse(row.geom_json) : null,
          })),
        );

      case "kabupaten":
        console.log("ðŸ—ºï¸  [SEARCH] Searching kabupaten...");
        const kabupatenResult = await client.query(
          `
          SELECT 
            kab_kota,
            provinsi,
            ST_AsGeoJSON(ST_SetSRID(ST_Union(geom_valid), 4326)) as geom_json
          FROM kab_kota
          WHERE LOWER(kab_kota) LIKE $1
          GROUP BY kab_kota, provinsi
          ORDER BY kab_kota
          LIMIT 50
        `,
          [searchPattern],
        );

        console.log(
          `âœ… [SEARCH] Found ${kabupatenResult.rows.length} kabupaten results`,
        );
        if (kabupatenResult.rows.length > 0) {
          console.log(
            "ðŸ“‹ [SEARCH] Sample results:",
            kabupatenResult.rows.slice(0, 3).map((r) => r.kab_kota),
          );
        }

        return res.json(
          kabupatenResult.rows.map((row) => ({
            label: `${row.kab_kota}, ${row.provinsi}`,
            kab_kota: row.kab_kota,
            provinsi: row.provinsi,
            level: "kabupaten",
            geom: row.geom_json ? JSON.parse(row.geom_json) : null,
          })),
        );

      case "kecamatan":
        console.log("ðŸ—ºï¸  [SEARCH] Searching kecamatan...");
        const kecamatanResult = await client.query(
          `
          SELECT 
            kecamatan,
            kab_kota,
            provinsi,
            ST_AsGeoJSON(ST_SetSRID(ST_Union(geom_valid), 4326)) as geom_json
          FROM kecamatan
          WHERE LOWER(kecamatan) LIKE $1
          GROUP BY kecamatan, kab_kota, provinsi
          ORDER BY kecamatan
          LIMIT 50
        `,
          [searchPattern],
        );

        console.log(
          `âœ… [SEARCH] Found ${kecamatanResult.rows.length} kecamatan results`,
        );
        if (kecamatanResult.rows.length > 0) {
          console.log(
            "ðŸ“‹ [SEARCH] Sample results:",
            kecamatanResult.rows.slice(0, 3).map((r) => r.kecamatan),
          );
        }

        return res.json(
          kecamatanResult.rows.map((row) => ({
            label: `${row.kecamatan}, ${row.kab_kota}, ${row.provinsi}`,
            kecamatan: row.kecamatan,
            kab_kota: row.kab_kota,
            provinsi: row.provinsi,
            level: "kecamatan",
            geom: row.geom_json ? JSON.parse(row.geom_json) : null,
          })),
        );

      case "kelurahan":
        console.log("ðŸ—ºï¸  [SEARCH] Searching kelurahan...");
        const kelurahanResult = await client.query(
          `
          SELECT 
            kel_desa,
            kecamatan,
            kab_kota,
            provinsi,
            ST_AsGeoJSON(ST_SetSRID(ST_Union(geom_valid), 4326)) as geom_json
          FROM kel_desa
          WHERE LOWER(kel_desa) LIKE $1
          GROUP BY kel_desa, kecamatan, kab_kota, provinsi
          ORDER BY kel_desa
          LIMIT 50
        `,
          [searchPattern],
        );

        console.log(
          `âœ… [SEARCH] Found ${kelurahanResult.rows.length} kelurahan results`,
        );
        if (kelurahanResult.rows.length > 0) {
          console.log(
            "ðŸ“‹ [SEARCH] Sample results:",
            kelurahanResult.rows.slice(0, 3).map((r) => r.kel_desa),
          );
        }

        return res.json(
          kelurahanResult.rows.map((row) => ({
            label: `${row.kel_desa}, ${row.kecamatan}, ${row.kab_kota}, ${row.provinsi}`,
            kel_desa: row.kel_desa,
            kecamatan: row.kecamatan,
            kab_kota: row.kab_kota,
            provinsi: row.provinsi,
            level: "kelurahan",
            geom: row.geom_json ? JSON.parse(row.geom_json) : null,
          })),
        );

      default:
        console.log("âŒ [SEARCH] Invalid level:", level);
        return res.status(400).json({
          error:
            "Invalid level. Use: provinsi, kabupaten, kecamatan, or kelurahan",
        });
    }
  } catch (error) {
    console.error("âŒ [SEARCH] Error:", error);
    res.status(500).json({ error: "Failed to search areas: " + error.message });
  } finally {
    client.release();
  }
});

// Endpoint untuk mendapatkan bounds dari area yang dipilih - UPDATE
app.post("/api/areas/bounds", async (req, res) => {
  const client = await pool.connect();

  try {
    const { selectedAreas } = req.body; // Array of selected area objects dengan level

    if (!selectedAreas || selectedAreas.length === 0) {
      return res.status(400).json({ error: "No areas selected" });
    }

    // Group areas by level
    const areasByLevel = {
      provinsi: [],
      kabupaten: [],
      kecamatan: [],
      kelurahan: [],
    };

    selectedAreas.forEach((area) => {
      if (area.level) {
        areasByLevel[area.level].push(area);
      }
    });

    // Build UNION queries untuk setiap level
    const unionQueries = [];
    const params = [];
    let paramIndex = 1;

    // Provinsi
    if (areasByLevel.provinsi.length > 0) {
      const provinsiConditions = areasByLevel.provinsi
        .map((area) => {
          params.push(area.provinsi);
          return `provinsi = $${paramIndex++}`;
        })
        .join(" OR ");

      unionQueries.push(`
        SELECT ST_Extent(geom_valid) as extent
        FROM provinsi
        WHERE ${provinsiConditions}
      `);
    }

    // Kabupaten
    if (areasByLevel.kabupaten.length > 0) {
      const kabupatenConditions = areasByLevel.kabupaten
        .map((area) => {
          params.push(area.kab_kota, area.provinsi);
          return `(kab_kota = $${paramIndex++} AND provinsi = $${paramIndex++})`;
        })
        .join(" OR ");

      unionQueries.push(`
        SELECT ST_Extent(geom_valid) as extent
        FROM kab_kota
        WHERE ${kabupatenConditions}
      `);
    }

    // Kecamatan
    if (areasByLevel.kecamatan.length > 0) {
      const kecamatanConditions = areasByLevel.kecamatan
        .map((area) => {
          params.push(area.kecamatan, area.kab_kota, area.provinsi);
          return `(kecamatan = $${paramIndex++} AND kab_kota = $${paramIndex++} AND provinsi = $${paramIndex++})`;
        })
        .join(" OR ");

      unionQueries.push(`
        SELECT ST_Extent(geom_valid) as extent
        FROM kecamatan
        WHERE ${kecamatanConditions}
      `);
    }

    // Kelurahan
    if (areasByLevel.kelurahan.length > 0) {
      const kelurahanConditions = areasByLevel.kelurahan
        .map((area) => {
          params.push(
            area.kel_desa,
            area.kecamatan,
            area.kab_kota,
            area.provinsi,
          );
          return `(kel_desa = $${paramIndex++} AND kecamatan = $${paramIndex++} AND kab_kota = $${paramIndex++} AND provinsi = $${paramIndex++})`;
        })
        .join(" OR ");

      unionQueries.push(`
        SELECT ST_Extent(geom_valid) as extent
        FROM kel_desa
        WHERE ${kelurahanConditions}
      `);
    }

    if (unionQueries.length === 0) {
      return res.status(400).json({ error: "No valid areas to query" });
    }

    // Combine all extents
    const finalQuery = `
      SELECT 
        ST_XMin(ST_Extent(extent)) as min_lng,
        ST_YMin(ST_Extent(extent)) as min_lat,
        ST_XMax(ST_Extent(extent)) as max_lng,
        ST_YMax(ST_Extent(extent)) as max_lat
      FROM (
        ${unionQueries.join(" UNION ALL ")}
      ) as combined_extents
    `;

    const result = await client.query(finalQuery, params);

    if (result.rows.length === 0 || !result.rows[0].min_lng) {
      return res
        .status(404)
        .json({ error: "No bounds found for selected areas" });
    }

    const bounds = result.rows[0];

    res.json({
      bounds: [
        [parseFloat(bounds.min_lat), parseFloat(bounds.min_lng)],
        [parseFloat(bounds.max_lat), parseFloat(bounds.max_lng)],
      ],
    });
  } catch (error) {
    console.error("Error getting bounds:", error);
    res.status(500).json({ error: "Failed to get bounds: " + error.message });
  } finally {
    client.release();
  }
});

// Endpoint untuk cek ketersediaan layer di bounds tertentu
app.post("/api/layers/check-availability", async (req, res) => {
  const client = await pool.connect();

  try {
    const { bounds, section, dasFilter } = req.body; // TAMBAH dasFilter

    if (!bounds || bounds.length !== 2) {
      return res.status(400).json({ error: "Invalid bounds format" });
    }

    // Get all layers for the section
    const layersResult = await client.query(
      `
      SELECT id, table_name, section
      FROM layer_metadata
      ${section ? "WHERE section = $1" : ""}
      ORDER BY created_at DESC
    `,
      section ? [section] : [],
    );

    const authorizedLayerIds = await getAuthorizedLayerIds(req, client);
    const visibleLayers =
      authorizedLayerIds === null || authorizedLayerIds === "ALL"
        ? layersResult.rows
        : layersResult.rows.filter((layer) =>
            authorizedLayerIds.has(Number(layer.id)),
          );

    // Check each layer for data in bounds.
    // IMPORTANT: jangan mengasumsikan semua tabel punya `geom_valid`.
    // Banyak layer legacy hanya mempunyai `geom` atau nama kolom geometry lain.
    // Geometry metadata dibaca SEKALI agar tidak melakukan query schema berulang-ulang.
    const availableLayers = [];
    const [[minLat, minLng], [maxLat, maxLng]] = bounds;
    const boundsWKT = `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;

    const tableNames = visibleLayers
      .map((layer) => String(layer.table_name || "").trim())
      .filter((tableName) => /^[A-Za-z0-9_]+$/.test(tableName));

    const geometryMetaResult = tableNames.length
      ? await client.query(
          `
          SELECT
            c.table_name,
            c.column_name,
            c.udt_name,
            c.data_type
          FROM information_schema.columns c
          WHERE c.table_schema = 'public'
            AND c.table_name = ANY($1::text[])
            AND (
              c.udt_name = 'geometry'
              OR c.data_type ILIKE '%geometry%'
              OR c.column_name = 'nama_das'
            )
          ORDER BY
            c.table_name,
            CASE
              WHEN c.column_name = 'geom_valid' THEN 1
              WHEN c.column_name = 'geom' THEN 2
              ELSE 3
            END,
            c.ordinal_position
          `,
          [tableNames],
        )
      : { rows: [] };

    const geometryMap = new Map();
    const namaDasMap = new Set();

    for (const meta of geometryMetaResult.rows) {
      if (meta.column_name === "nama_das") {
        namaDasMap.add(meta.table_name);
        continue;
      }

      const isGeometry =
        meta.udt_name === "geometry" ||
        String(meta.data_type || "")
          .toLowerCase()
          .includes("geometry");

      if (isGeometry && !geometryMap.has(meta.table_name)) {
        geometryMap.set(meta.table_name, meta.column_name);
      }
    }

    const safeIdentifier = (value) =>
      /^[A-Za-z0-9_]+$/.test(String(value || ""));
    const normalizedDasFilter = Array.isArray(dasFilter)
      ? dasFilter.filter(
          (value) =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== "",
        )
      : [];

    for (const layer of visibleLayers) {
      try {
        const tableName = String(layer.table_name || "").trim();
        const geometryColumn = geometryMap.get(tableName);

        if (!safeIdentifier(tableName)) {
          console.warn(`Skipping layer with invalid table name: ${tableName}`);
          continue;
        }

        if (!geometryColumn || !safeIdentifier(geometryColumn)) {
          console.log(
            `Skipping non-spatial layer ${tableName}: no geometry column found`,
          );
          continue;
        }

        const quotedTable = `"${tableName}"`;
        const quotedGeometry = `"${geometryColumn}"`;
        const hasNamaDasColumn = namaDasMap.has(tableName);

        // Build query berdasarkan geometry column yang BENAR-BENAR tersedia.
        let countQuery;
        let queryParams;

        if (normalizedDasFilter.length > 0 && hasNamaDasColumn) {
          const dasPlaceholders = normalizedDasFilter
            .map((_, idx) => `$${idx + 2}`)
            .join(", ");

          countQuery = `
            SELECT COUNT(*) as count
            FROM ${quotedTable}
            WHERE ${quotedGeometry} IS NOT NULL
              AND ST_Intersects(${quotedGeometry}, ST_GeomFromText($1, 4326))
              AND "nama_das" IN (${dasPlaceholders})
          `;
          queryParams = [boundsWKT, ...normalizedDasFilter];
        } else {
          countQuery = `
            SELECT COUNT(*) as count
            FROM ${quotedTable}
            WHERE ${quotedGeometry} IS NOT NULL
              AND ST_Intersects(${quotedGeometry}, ST_GeomFromText($1, 4326))
          `;
          queryParams = [boundsWKT];
        }

        const countResult = await client.query(countQuery, queryParams);

        if (parseInt(countResult.rows[0].count, 10) > 0) {
          availableLayers.push({
            id: layer.id.toString(),
            name: tableName,
            section: layer.section,
          });
        }
      } catch (err) {
        // Satu layer bermasalah tidak boleh menggagalkan seluruh catalog.
        console.error(`Error checking layer ${layer.table_name}:`, err.message);
      }
    }

    res.json({ availableLayers });
  } catch (error) {
    console.error("Error checking layer availability:", error);
    res.status(500).json({ error: "Failed to check layer availability" });
  } finally {
    client.release();
  }
});

app.get("/api/das/search", async (req, res) => {
  const client = await pool.connect();

  try {
    const { query } = req.query;

    if (!query || query.trim().length < 2) {
      return res.json([]);
    }

    const searchPattern = `%${query.toLowerCase()}%`;

    // PENTING: Gunakan ST_Union untuk gabungkan SEMUA polygon dari 1 DAS
    // GROUP BY nama_das, lalu union semua geometri
    const result = await client.query(
      `
      SELECT 
        nama_das,
        ST_AsGeoJSON(ST_SetSRID(ST_Union(geom), 4326)) as geom_json
      FROM das_adm
      WHERE LOWER(nama_das) LIKE $1
      GROUP BY nama_das
      ORDER BY nama_das
      LIMIT 50
    `,
      [searchPattern],
    );

    const dasResults = result.rows.map((row) => ({
      label: row.nama_das,
      nama_das: row.nama_das,
      geom: row.geom_json ? JSON.parse(row.geom_json) : null,
    }));

    console.log(
      `Returning ${dasResults.length} DAS results with geom (unioned)`,
    );
    res.json(dasResults);
  } catch (error) {
    console.error("Error searching DAS:", error);
    res.status(500).json({ error: "Failed to search DAS" });
  } finally {
    client.release();
  }
});

// Endpoint untuk mendapatkan bounds dari DAS yang dipilih
app.post("/api/das/bounds", async (req, res) => {
  const client = await pool.connect();

  try {
    const { selectedDas } = req.body; // Array of selected DAS names

    if (!selectedDas || selectedDas.length === 0) {
      return res.status(400).json({ error: "No DAS selected" });
    }

    // Build WHERE clause untuk setiap DAS
    const placeholders = selectedDas
      .map((_, index) => `$${index + 1}`)
      .join(", ");

    const query = `
      SELECT 
        ST_XMin(ST_Extent(geom_valid)) as min_lng,
        ST_YMin(ST_Extent(geom_valid)) as min_lat,
        ST_XMax(ST_Extent(geom_valid)) as max_lng,
        ST_YMax(ST_Extent(geom_valid)) as max_lat
      FROM das_adm
      WHERE nama_das IN (${placeholders})
    `;

    const result = await client.query(query, selectedDas);

    if (result.rows.length === 0 || !result.rows[0].min_lng) {
      return res
        .status(404)
        .json({ error: "No bounds found for selected DAS" });
    }

    const bounds = result.rows[0];

    res.json({
      bounds: [
        [parseFloat(bounds.min_lat), parseFloat(bounds.min_lng)],
        [parseFloat(bounds.max_lat), parseFloat(bounds.max_lng)],
      ],
    });
  } catch (error) {
    console.error("Error getting DAS bounds:", error);
    res
      .status(500)
      .json({ error: "Failed to get DAS bounds: " + error.message });
  } finally {
    client.release();
  }
});

// Endpoint untuk fetch tutupan lahan data dengan luas_ha
app.get("/api/tutupan-lahan/data", async (req, res) => {
  try {
    const { bounds, dasFilter } = req.query;

    let query = `
      SELECT DISTINCT 
        tl.pl2024_id,
        mpl.deskripsi_domain,
        SUM(tl.luas_ha) as luas_total
      FROM tutupan_lahan tl
      LEFT JOIN mapping_penutupan_lahan mpl ON tl.pl2024_id::text = mpl.kode_domain
    `;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Filter by bounds if provided
    if (bounds) {
      const [minLat, minLng, maxLat, maxLng] = bounds.split(",").map(Number);
      conditions.push(`ST_Intersects(
        tl.geom,
        ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)
      )`);
      params.push(minLng, minLat, maxLng, maxLat);
      paramIndex += 4;
    }

    // Filter by DAS if provided
    if (dasFilter) {
      try {
        const dasArray = JSON.parse(dasFilter);
        if (dasArray && dasArray.length > 0) {
          const dasPlaceholders = dasArray
            .map((_, i) => `$${paramIndex + i}`)
            .join(",");
          conditions.push(`tl.nama_das IN (${dasPlaceholders})`);
          params.push(...dasArray);
          paramIndex += dasArray.length;
        }
      } catch (e) {
        console.error("Error parsing dasFilter:", e);
      }
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += `
      GROUP BY tl.pl2024_id, mpl.deskripsi_domain
      ORDER BY tl.pl2024_id
    `;

    console.log("Executing tutupan lahan query with params:", params);
    const result = await pool.query(query, params);
    console.log("Tutupan lahan data fetched:", result.rows.length, "rows");

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching tutupan lahan data:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/penutupan-lahan-2024/data", async (req, res) => {
  try {
    const { bounds, dasFilter } = req.query;

    let query = `
      SELECT DISTINCT 
        tl.pl2024_id,
        mpl.deskripsi_domain,
        SUM(tl.luas_ha) as luas_total
      FROM penutupan_lahan_2024 tl
      LEFT JOIN mapping_penutupan_lahan mpl ON tl.pl2024_id::text = mpl.kode_domain
    `;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Filter by bounds if provided
    if (bounds) {
      const [minLat, minLng, maxLat, maxLng] = bounds.split(",").map(Number);
      conditions.push(`ST_Intersects(
        tl.geom,
        ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)
      )`);
      params.push(minLng, minLat, maxLng, maxLat);
      paramIndex += 4;
    }

    // Filter by DAS if provided
    if (dasFilter) {
      try {
        const dasArray = JSON.parse(dasFilter);
        if (dasArray && dasArray.length > 0) {
          const dasPlaceholders = dasArray
            .map((_, i) => `$${paramIndex + i}`)
            .join(",");
          conditions.push(`ST_Intersects(
            tl.geom,
            (SELECT ST_Union(geom_valid) FROM das_adm WHERE nama_das IN (${dasPlaceholders}))
          )`);
          params.push(...dasArray);
          paramIndex += dasArray.length;
        }
      } catch (e) {
        console.error("Error parsing dasFilter:", e);
      }
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += `
      GROUP BY tl.pl2024_id, mpl.deskripsi_domain
      ORDER BY tl.pl2024_id
    `;

    console.log("Executing tutupan lahan query with params:", params);
    const result = await pool.query(query, params);
    console.log("Tutupan lahan data fetched:", result.rows.length, "rows");

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching tutupan lahan data:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/pl-2024/data", async (req, res) => {
  try {
    const { bounds, dasFilter } = req.query;

    let query = `
      SELECT DISTINCT 
        tl.pl2024_id,
        mpl.deskripsi_domain,
        SUM(tl.luas_ha) as luas_total
      FROM pl2024 tl
      LEFT JOIN mapping_penutupan_lahan mpl ON tl.pl2024_id::text = mpl.kode_domain
    `;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Filter by bounds if provided
    if (bounds) {
      const [minLat, minLng, maxLat, maxLng] = bounds.split(",").map(Number);
      conditions.push(`ST_Intersects(
        tl.geom,
        ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)
      )`);
      params.push(minLng, minLat, maxLng, maxLat);
      paramIndex += 4;
    }

    // Filter by DAS if provided
    if (dasFilter) {
      try {
        const dasArray = JSON.parse(dasFilter);
        if (dasArray && dasArray.length > 0) {
          const dasPlaceholders = dasArray
            .map((_, i) => `$${paramIndex + i}`)
            .join(",");
          conditions.push(`tl.nama_das IN (${dasPlaceholders})`);
          params.push(...dasArray);
          paramIndex += dasArray.length;
        }
      } catch (e) {
        console.error("Error parsing dasFilter:", e);
      }
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += `
      GROUP BY tl.pl2024_id, mpl.deskripsi_domain
      ORDER BY tl.pl2024_id
    `;

    console.log("Executing tutupan lahan query with params:", params);
    const result = await pool.query(query, params);
    console.log("Tutupan lahan data fetched:", result.rows.length, "rows");

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching tutupan lahan data:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Endpoint untuk fetch geologi data dengan bounds
app.get("/api/geologi/data", async (req, res) => {
  try {
    const { bounds, dasFilter } = req.query;

    let query = `
      SELECT DISTINCT 
        g.namobj,
        g.umurobj,
        SUM(g.keliling_m) as keliling_total
      FROM geologi g
    `;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Filter by bounds if provided
    if (bounds) {
      const [minLat, minLng, maxLat, maxLng] = bounds.split(",").map(Number);
      conditions.push(`ST_Intersects(
        g.geom,
        ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)
      )`);
      params.push(minLng, minLat, maxLng, maxLat);
      paramIndex += 4;
    }

    // Filter by DAS if provided
    if (dasFilter) {
      try {
        const dasArray = JSON.parse(dasFilter);
        if (dasArray && dasArray.length > 0) {
          const dasPlaceholders = dasArray
            .map((_, i) => `$${paramIndex + i}`)
            .join(",");
          conditions.push(`g.nama_das IN (${dasPlaceholders})`);
          params.push(...dasArray);
          paramIndex += dasArray.length;
        }
      } catch (e) {
        console.error("Error parsing dasFilter:", e);
      }
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += `
      GROUP BY g.namobj, g.umurobj
      ORDER BY g.namobj, g.umurobj
    `;

    console.log("Executing geologi query with params:", params);
    const result = await pool.query(query, params);
    console.log("Geologi data fetched:", result.rows.length, "rows");

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching geologi data:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

const risikoTables = [
  "risiko_banjir",
  "risiko_banjir_bandang",
  "risiko_kekeringan",
  "risiko_abrasi",
  "risiko_longsor",
  "risiko_karhutla",
];
risikoTables.forEach((tableName) => {
  app.get(`/api/${tableName}/data`, async (req, res) => {
    try {
      const { bounds, dasFilter } = req.query;
      let query = `SELECT kelas, SUM(shape_leng) as luas_total FROM ${tableName}`;
      const conditions = [];
      const params = [];
      let paramIndex = 1;

      if (bounds) {
        const [minLat, minLng, maxLat, maxLng] = bounds.split(",").map(Number);
        conditions.push(
          `ST_Intersects(geom, ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326))`,
        );
        params.push(minLng, minLat, maxLng, maxLat);
        paramIndex += 4;
      }

      if (dasFilter) {
        try {
          const dasArray = JSON.parse(dasFilter);
          if (dasArray && dasArray.length > 0) {
            const dasPlaceholders = dasArray
              .map((_, i) => `$${paramIndex + i}`)
              .join(",");
            conditions.push(
              `ST_Intersects(geom, (SELECT ST_Union(geom_valid) FROM das_adm WHERE nama_das IN (${dasPlaceholders})))`,
            );
            params.push(...dasArray);
            paramIndex += dasArray.length;
          }
        } catch (e) {
          console.error("Error parsing dasFilter:", e);
        }
      }

      if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
      query += " GROUP BY kelas ORDER BY kelas";

      const result = await pool.query(query, params);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error(`Error fetching ${tableName} data:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
});

// Endpoint untuk fetch data KHDTK
app.get("/api/khdtk/data", async (req, res) => {
  try {
    const { bounds, dasFilter } = req.query;
    let query = `SELECT namobj, SUM(lsktap) as luas_total, MAX(jnskhdtk) as jnskhdtk FROM khdtk`;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (bounds) {
      const [minLat, minLng, maxLat, maxLng] = bounds.split(",").map(Number);
      conditions.push(
        `ST_Intersects(geom, ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326))`,
      );
      params.push(minLng, minLat, maxLng, maxLat);
      paramIndex += 4;
    }

    if (dasFilter) {
      try {
        const dasArray = JSON.parse(dasFilter);
        if (dasArray && dasArray.length > 0) {
          const dasPlaceholders = dasArray
            .map((_, i) => `$${paramIndex + i}`)
            .join(",");
          conditions.push(
            `ST_Intersects(geom, (SELECT ST_Union(geom_valid) FROM das_adm WHERE nama_das IN (${dasPlaceholders})))`,
          );
          params.push(...dasArray);
          paramIndex += dasArray.length;
        }
      } catch (e) {
        console.error("Error parsing dasFilter:", e);
      }
    }

    if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
    query += " GROUP BY namobj ORDER BY namobj";

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error fetching khdtk data:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ================= Tambahkan endpoint debugging setelah endpoint /api/areas/bounds ================

// DEBUG ENDPOINT - Cek layer yang ada di bounds tertentu
app.post("/api/debug/layers-in-bounds", async (req, res) => {
  const client = await pool.connect();

  try {
    const { bounds, tableName } = req.body;

    if (!bounds) {
      return res.status(400).json({
        error: "Bounds required (format: [minLat, minLng, maxLat, maxLng])",
      });
    }

    const [minLat, minLng, maxLat, maxLng] = bounds;

    console.log("ðŸ” [DEBUG] Checking layers in bounds:", {
      minLat,
      minLng,
      maxLat,
      maxLng,
    });

    // Jika tableName spesifik diberikan
    if (tableName) {
      const query = `
        SELECT 
          COUNT(*) as feature_count,
          ST_AsGeoJSON(ST_Extent(geom_valid)) as bbox
        FROM ${tableName}
        WHERE geom_valid IS NOT NULL
          AND geom_valid && ST_MakeEnvelope($1, $2, $3, $4, 4326)
          AND ST_Intersects(
            geom_valid,
            ST_MakeEnvelope($1, $2, $3, $4, 4326)
          )
      `;

      const result = await client.query(query, [
        minLng,
        minLat,
        maxLng,
        maxLat,
      ]);

      console.log(`âœ… [DEBUG] Table ${tableName}:`, result.rows[0]);

      return res.json({
        tableName,
        bounds: { minLat, minLng, maxLat, maxLng },
        featureCount: parseInt(result.rows[0].feature_count),
        bbox: result.rows[0].bbox ? JSON.parse(result.rows[0].bbox) : null,
      });
    }

    // Jika tidak ada tableName, cek semua layer
    const layersQuery = await client.query(`
      SELECT table_name, section 
      FROM layer_metadata 
      ORDER BY section, table_name
    `);

    const results = [];

    for (const layer of layersQuery.rows) {
      try {
        const query = `
          SELECT 
            COUNT(*) as feature_count,
            ST_AsGeoJSON(ST_Extent(geom_valid)) as bbox
          FROM ${layer.table_name}
          WHERE geom_valid IS NOT NULL
            AND geom_valid && ST_MakeEnvelope($1, $2, $3, $4, 4326)
            AND ST_Intersects(
              geom_valid,
              ST_MakeEnvelope($1, $2, $3, $4, 4326)
            )
        `;

        const result = await client.query(query, [
          minLng,
          minLat,
          maxLng,
          maxLat,
        ]);
        const count = parseInt(result.rows[0].feature_count);

        if (count > 0) {
          results.push({
            tableName: layer.table_name,
            section: layer.section,
            featureCount: count,
            bbox: result.rows[0].bbox ? JSON.parse(result.rows[0].bbox) : null,
          });

          console.log(`âœ… [DEBUG] ${layer.table_name}: ${count} features`);
        } else {
          console.log(`âšª [DEBUG] ${layer.table_name}: 0 features`);
        }
      } catch (error) {
        console.error(
          `âŒ [DEBUG] Error checking ${layer.table_name}:`,
          error.message,
        );
        results.push({
          tableName: layer.table_name,
          section: layer.section,
          error: error.message,
        });
      }
    }

    // Sort by feature count descending
    results.sort((a, b) => (b.featureCount || 0) - (a.featureCount || 0));

    console.log(`âœ… [DEBUG] Total tables checked: ${layersQuery.rows.length}`);
    console.log(
      `âœ… [DEBUG] Tables with data: ${results.filter((r) => r.featureCount > 0).length}`,
    );

    res.json({
      bounds: { minLat, minLng, maxLat, maxLng },
      totalTablesChecked: layersQuery.rows.length,
      tablesWithData: results.filter((r) => r.featureCount > 0).length,
      results: results,
    });
  } catch (error) {
    console.error("âŒ [DEBUG] Error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// DEBUG ENDPOINT - Cek layer yang ada di area administratif
app.post("/api/debug/layers-in-admin", async (req, res) => {
  const client = await pool.connect();

  try {
    const { level, name, tableName } = req.body;

    if (!level || !name) {
      return res.status(400).json({
        error: "Level and name required",
        example: { level: "provinsi", name: "DKI Jakarta" },
      });
    }

    const adminTables = {
      provinsi: "provinsi",
      kabupaten: "kab_kota",
      kecamatan: "kecamatan",
      kelurahan: "kel_desa",
    };

    const adminTable = adminTables[level];
    const adminColumn =
      level === "kabupaten"
        ? "kab_kota"
        : level === "kelurahan"
          ? "kel_desa"
          : level;

    console.log("ðŸ” [DEBUG] Checking layers in admin area:", { level, name });

    // Get admin area geometry
    const adminQuery = `
      SELECT ST_AsGeoJSON(ST_Union(geom_valid)) as geom_json
      FROM ${adminTable}
      WHERE ${adminColumn} = $1
    `;

    const adminResult = await client.query(adminQuery, [name]);

    if (adminResult.rows.length === 0 || !adminResult.rows[0].geom_json) {
      return res.status(404).json({ error: `${level} "${name}" not found` });
    }

    // Jika tableName spesifik diberikan
    if (tableName) {
      const query = `
        SELECT 
          COUNT(*) as feature_count,
          ST_AsGeoJSON(ST_Extent(l.geom_valid)) as bbox
        FROM ${tableName} l, ${adminTable} a
        WHERE a.${adminColumn} = $1
          AND l.geom_valid && a.geom_valid
          AND ST_Intersects(l.geom_valid, a.geom_valid)
      `;

      const result = await client.query(query, [name]);

      console.log(
        `âœ… [DEBUG] Table ${tableName} in ${level} ${name}:`,
        result.rows[0],
      );

      return res.json({
        tableName,
        adminArea: { level, name },
        featureCount: parseInt(result.rows[0].feature_count),
        bbox: result.rows[0].bbox ? JSON.parse(result.rows[0].bbox) : null,
      });
    }

    // Jika tidak ada tableName, cek semua layer
    const layersQuery = await client.query(`
      SELECT table_name, section 
      FROM layer_metadata 
      ORDER BY section, table_name
    `);

    const results = [];

    for (const layer of layersQuery.rows) {
      try {
        const query = `
          SELECT 
            COUNT(*) as feature_count,
            ST_AsGeoJSON(ST_Extent(l.geom_valid)) as bbox
          FROM ${layer.table_name} l, ${adminTable} a
          WHERE a.${adminColumn} = $1
            AND l.geom_valid && a.geom_valid
            AND ST_Intersects(l.geom_valid, a.geom_valid)
        `;

        const result = await client.query(query, [name]);
        const count = parseInt(result.rows[0].feature_count);

        if (count > 0) {
          results.push({
            tableName: layer.table_name,
            section: layer.section,
            featureCount: count,
            bbox: result.rows[0].bbox ? JSON.parse(result.rows[0].bbox) : null,
          });

          console.log(`âœ… [DEBUG] ${layer.table_name}: ${count} features`);
        } else {
          console.log(`âšª [DEBUG] ${layer.table_name}: 0 features`);
        }
      } catch (error) {
        console.error(
          `âŒ [DEBUG] Error checking ${layer.table_name}:`,
          error.message,
        );
        results.push({
          tableName: layer.table_name,
          section: layer.section,
          error: error.message,
        });
      }
    }

    results.sort((a, b) => (b.featureCount || 0) - (a.featureCount || 0));

    res.json({
      adminArea: { level, name },
      totalTablesChecked: layersQuery.rows.length,
      tablesWithData: results.filter((r) => r.featureCount > 0).length,
      results: results,
    });
  } catch (error) {
    console.error("âŒ [DEBUG] Error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// DEBUG ENDPOINT - Cek layer yang ada di DAS
app.post("/api/debug/layers-in-das", async (req, res) => {
  const client = await pool.connect();

  try {
    const { dasName, tableName } = req.body;

    if (!dasName) {
      return res.status(400).json({
        error: "DAS name required",
        example: { dasName: "Ciliwung" },
      });
    }

    console.log("ðŸ” [DEBUG] Checking layers in DAS:", dasName);

    // Jika tableName spesifik diberikan
    if (tableName) {
      const query = `
        SELECT 
          COUNT(*) as feature_count,
          ST_AsGeoJSON(ST_Extent(l.geom_valid)) as bbox
        FROM ${tableName} l, das_adm d
        WHERE d.nama_das = $1
          AND l.geom_valid && d.geom_valid
          AND ST_Intersects(l.geom_valid, d.geom_valid)
      `;

      const result = await client.query(query, [dasName]);

      console.log(
        `âœ… [DEBUG] Table ${tableName} in DAS ${dasName}:`,
        result.rows[0],
      );

      return res.json({
        tableName,
        dasName,
        featureCount: parseInt(result.rows[0].feature_count),
        bbox: result.rows[0].bbox ? JSON.parse(result.rows[0].bbox) : null,
      });
    }

    // Jika tidak ada tableName, cek semua layer
    const layersQuery = await client.query(`
      SELECT table_name, section 
      FROM layer_metadata 
      ORDER BY section, table_name
    `);

    const results = [];

    for (const layer of layersQuery.rows) {
      try {
        const query = `
          SELECT 
            COUNT(*) as feature_count,
            ST_AsGeoJSON(ST_Extent(l.geom_valid)) as bbox
          FROM ${layer.table_name} l, das_adm d
          WHERE d.nama_das = $1
            AND l.geom_valid && d.geom_valid
            AND ST_Intersects(l.geom_valid, d.geom_valid)
        `;

        const result = await client.query(query, [dasName]);
        const count = parseInt(result.rows[0].feature_count);

        if (count > 0) {
          results.push({
            tableName: layer.table_name,
            section: layer.section,
            featureCount: count,
            bbox: result.rows[0].bbox ? JSON.parse(result.rows[0].bbox) : null,
          });

          console.log(`âœ… [DEBUG] ${layer.table_name}: ${count} features`);
        } else {
          console.log(`âšª [DEBUG] ${layer.table_name}: 0 features`);
        }
      } catch (error) {
        console.error(
          `âŒ [DEBUG] Error checking ${layer.table_name}:`,
          error.message,
        );
        results.push({
          tableName: layer.table_name,
          section: layer.section,
          error: error.message,
        });
      }
    }

    results.sort((a, b) => (b.featureCount || 0) - (a.featureCount || 0));

    res.json({
      dasName,
      totalTablesChecked: layersQuery.rows.length,
      tablesWithData: results.filter((r) => r.featureCount > 0).length,
      results: results,
    });
  } catch (error) {
    console.error("âŒ [DEBUG] Error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ================= Akhir penambahan ================

// 5. Test Route - Check server status
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});
// ============================================================
// USER MANAGEMENT
// ============================================================

// GET /api/users
app.get("/api/users", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", status = "" } = req.query;

    const pageNumber = Math.max(parseInt(page) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
    const offset = (pageNumber - 1) * limitNumber;

    const params = [];
    const conditions = [];

    // Search username, email, full_name, phone
    if (search && String(search).trim() !== "") {
      params.push(`%${String(search).trim()}%`);

      conditions.push(`
        (
          username ILIKE $${params.length}
          OR email ILIKE $${params.length}
          OR full_name ILIKE $${params.length}
          OR phone ILIKE $${params.length}
        )
      `);
    }

    // Filter status
    if (status && String(status).trim() !== "") {
      params.push(String(status).trim());
      conditions.push(`status = $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Total data
    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM users
      ${whereClause}
    `;

    const countResult = await pool.query(countQuery, params);

    const total = countResult.rows[0]?.total || 0;

    // Data user
    const dataParams = [...params];

    dataParams.push(limitNumber);
    const limitParam = dataParams.length;

    dataParams.push(offset);
    const offsetParam = dataParams.length;

    const dataQuery = `
      SELECT
        id,
        username,
        email,
        full_name,
        phone,
        role_id,
        organization_id,
        unit_id,
        status,
        avatar,
        last_login,
        created_at,
        updated_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${limitParam}
      OFFSET $${offsetParam}
    `;

    const result = await pool.query(dataQuery, dataParams);

    const totalPages = Math.ceil(total / limitNumber);

    res.json({
      success: true,
      message: "Data users berhasil diambil",
      data: result.rows,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error("âŒ GET /api/users error:", error);

    res.status(500).json({
      success: false,
      message: "Gagal mengambil data users",
      error: error.message,
    });
  }
});

// ============================================================
// POST /api/users
// CREATE USER
// ============================================================
app.post("/api/users", async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      full_name,
      phone,
      role_id,
      organization_id,
      unit_id,
      status = "active",
      avatar = null,
    } = req.body;

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------
    if (!username || !email || !password || !full_name) {
      return res.status(400).json({
        success: false,
        message: "Username, email, password, dan nama lengkap wajib diisi",
      });
    }

    const cleanUsername = String(username).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanFullName = String(full_name).trim();

    if (cleanUsername.length < 3) {
      return res.status(400).json({
        success: false,
        message: "Username minimal 3 karakter",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password minimal 8 karakter",
      });
    }

    // Validasi email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Format email tidak valid",
      });
    }

    // Status hanya boleh active / inactive
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status user tidak valid",
      });
    }

    // --------------------------------------------------------
    // CHECK DUPLICATE USERNAME / EMAIL
    // --------------------------------------------------------
    const duplicateResult = await pool.query(
      `
      SELECT id, username, email
      FROM users
      WHERE LOWER(username) = LOWER($1)
         OR LOWER(email) = LOWER($2)
      LIMIT 1
      `,
      [cleanUsername, cleanEmail],
    );

    if (duplicateResult.rows.length > 0) {
      const existing = duplicateResult.rows[0];

      if (
        existing.username &&
        existing.username.toLowerCase() === cleanUsername.toLowerCase()
      ) {
        return res.status(409).json({
          success: false,
          message: "Username sudah digunakan",
        });
      }

      if (
        existing.email &&
        existing.email.toLowerCase() === cleanEmail.toLowerCase()
      ) {
        return res.status(409).json({
          success: false,
          message: "Email sudah digunakan",
        });
      }
    }

    // --------------------------------------------------------
    // HASH PASSWORD
    // Mengikuti helper hashPassword() yang sudah ada
    // di server.js
    // --------------------------------------------------------
    const passwordHash = hashPassword(password);

    // --------------------------------------------------------
    // INSERT USER
    // --------------------------------------------------------
    const insertQuery = `
      INSERT INTO users (
        username,
        email,
        password_hash,
        full_name,
        phone,
        role_id,
        organization_id,
        unit_id,
        status,
        avatar,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        NOW(),
        NOW()
      )
      RETURNING
        id,
        username,
        email,
        full_name,
        phone,
        role_id,
        organization_id,
        unit_id,
        status,
        avatar,
        last_login,
        created_at,
        updated_at
    `;

    const result = await pool.query(insertQuery, [
      cleanUsername,
      cleanEmail,
      passwordHash,
      cleanFullName,
      phone ? String(phone).trim() : null,
      role_id ? parseInt(role_id) : null,
      organization_id ? parseInt(organization_id) : null,
      unit_id ? parseInt(unit_id) : null,
      status,
      avatar,
    ]);

    // --------------------------------------------------------
    // RESPONSE
    // Password TIDAK dikirim kembali
    // --------------------------------------------------------
    res.status(201).json({
      success: true,
      message: "User berhasil ditambahkan",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("âŒ POST /api/users error:", error);

    res.status(500).json({
      success: false,
      message: "Gagal menambahkan user",
      error: error.message,
    });
  }
});

app.put("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const {
      username,
      email,
      full_name,
      phone,
      role_id,
      organization_id,
      unit_id,
      status,
      password,
    } = req.body;

    // ============================================
    // VALIDASI ID
    // ============================================

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID user tidak ditemukan.",
      });
    }

    // ============================================
    // VALIDASI FIELD WAJIB
    // ============================================

    if (!username || !username.trim()) {
      return res.status(400).json({
        success: false,
        message: "Username wajib diisi.",
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email wajib diisi.",
      });
    }

    if (!full_name || !full_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Nama lengkap wajib diisi.",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status wajib diisi.",
      });
    }

    // ============================================
    // CEK USER
    // ============================================

    const checkUser = await pool.query(
      `
      SELECT id
      FROM users
      WHERE id = $1
      `,
      [id],
    );

    if (checkUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan.",
      });
    }

    // ============================================
    // UPDATE TANPA PASSWORD
    // ============================================

    if (!password || !password.trim()) {
      const result = await pool.query(
        `
        UPDATE users
        SET
          username = $1,
          email = $2,
          full_name = $3,
          phone = $4,
          role_id = $5,
          organization_id = $6,
          unit_id = $7,
          status = $8,
          updated_at = NOW()
        WHERE id = $9
        RETURNING
          id,
          username,
          email,
          full_name,
          phone,
          role_id,
          organization_id,
          unit_id,
          status,
          last_login,
          created_at,
          updated_at
        `,
        [
          username.trim(),
          email.trim().toLowerCase(),
          full_name.trim(),
          phone || null,
          role_id || null,
          organization_id || null,
          unit_id || null,
          status,
          id,
        ],
      );

      return res.json({
        success: true,
        message: "User berhasil diperbarui.",
        data: result.rows[0],
      });
    }

    // ============================================
    // UPDATE DENGAN PASSWORD
    // ============================================

    const bcrypt = require("bcryptjs");

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      UPDATE users
      SET
        username = $1,
        email = $2,
        full_name = $3,
        phone = $4,
        role_id = $5,
        organization_id = $6,
        unit_id = $7,
        status = $8,
        password_hash = $9,
        updated_at = NOW()
      WHERE id = $10
      RETURNING
        id,
        username,
        email,
        full_name,
        phone,
        role_id,
        organization_id,
        unit_id,
        status,
        last_login,
        created_at,
        updated_at
      `,
      [
        username.trim(),
        email.trim().toLowerCase(),
        full_name.trim(),
        phone || null,
        role_id || null,
        organization_id || null,
        unit_id || null,
        status,
        passwordHash,
        id,
      ],
    );

    return res.json({
      success: true,
      message: "User berhasil diperbarui.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("PUT /api/users/:id ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memperbarui user.",
      error: error.message,
    });
  }
});
// ============================================================
// MASTER ROLE MANAGEMENT
// ============================================================

// GET /api/roles
// List + search + filter + pagination
app.get("/api/roles", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "10", 10), 1),
      100,
    );

    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "").trim();

    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (search) {
      conditions.push(`
        (
          name LIKE $1
          OR description LIKE $2
        )
      `);

      const keyword = `%${search}%`;
      params.push(keyword, keyword);
    }

    if (status && ["active", "inactive"].includes(status)) {
      const statusParam = params.length + 1;

      conditions.push(`status = $${statusParam}`);
      params.push(status);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Total data
    const countResult = await pool.query(
      `
        SELECT COUNT(*) AS total
        FROM master_role
        ${whereClause}
      `,
      params,
    );

    const total = Number(countResult.rows[0]?.total || 0);

    // Data
    const dataParams = [...params];

    const limitParam = dataParams.length + 1;
    const offsetParam = dataParams.length + 2;

    dataParams.push(limit, offset);

    const result = await pool.query(
      `
        SELECT
          id,
          name,
          description,
          status,
          created_at,
          updated_at
        FROM master_role
        ${whereClause}
        ORDER BY id DESC
        LIMIT $${limitParam}
        OFFSET $${offsetParam}
      `,
      dataParams,
    );

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/roles ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data role.",
      error: error.message,
    });
  }
});

// ============================================================
// GET SINGLE ROLE
// ============================================================

app.get("/api/roles/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID role tidak valid.",
      });
    }

    const result = await pool.query(
      `
        SELECT
          id,
          name,
          description,
          status,
          created_at,
          updated_at
        FROM master_role
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Role tidak ditemukan.",
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("GET /api/roles/:id ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil detail role.",
      error: error.message,
    });
  }
});

// ============================================================
// CREATE ROLE
// ============================================================

app.post("/api/roles", async (req, res) => {
  try {
    const { name, description = "", status = "active" } = req.body;

    const roleName = String(name || "").trim();
    const roleDescription = String(description || "").trim();
    const roleStatus = String(status || "active").trim();

    if (!roleName) {
      return res.status(400).json({
        success: false,
        message: "Nama role wajib diisi.",
      });
    }

    if (!["active", "inactive"].includes(roleStatus)) {
      return res.status(400).json({
        success: false,
        message: "Status role tidak valid.",
      });
    }

    const duplicate = await pool.query(
      `
        SELECT id
        FROM master_role
        WHERE LOWER(name) = LOWER($1)
        LIMIT 1
      `,
      [roleName],
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Nama role sudah digunakan.",
      });
    }

    const result = await pool.query(
      `
        INSERT INTO master_role
        (
          name,
          description,
          status
        )
        VALUES
        (
          $1,
          $2,
          $3
        )
        RETURNING
          id,
          name,
          description,
          status,
          created_at,
          updated_at
      `,
      [roleName, roleDescription || null, roleStatus],
    );

    return res.status(201).json({
      success: true,
      message: "Role berhasil dibuat.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("POST /api/roles ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal membuat role.",
      error: error.message,
    });
  }
});

// ============================================================
// UPDATE ROLE
// ============================================================

app.put("/api/roles/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID role tidak valid.",
      });
    }

    const { name, description = "", status = "active" } = req.body;

    const roleName = String(name || "").trim();
    const roleDescription = String(description || "").trim();
    const roleStatus = String(status || "active").trim();

    if (!roleName) {
      return res.status(400).json({
        success: false,
        message: "Nama role wajib diisi.",
      });
    }

    if (!["active", "inactive"].includes(roleStatus)) {
      return res.status(400).json({
        success: false,
        message: "Status role tidak valid.",
      });
    }

    const existing = await pool.query(
      `
        SELECT id
        FROM master_role
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Role tidak ditemukan.",
      });
    }

    const duplicate = await pool.query(
      `
        SELECT id
        FROM master_role
        WHERE LOWER(name) = LOWER($1)
          AND id <> $2
        LIMIT 1
      `,
      [roleName, id],
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Nama role sudah digunakan oleh role lain.",
      });
    }

    const result = await pool.query(
      `
        UPDATE master_role
        SET
          name = $1,
          description = $2,
          status = $3,
          updated_at = NOW()
        WHERE id = $4
        RETURNING
          id,
          name,
          description,
          status,
          created_at,
          updated_at
      `,
      [roleName, roleDescription || null, roleStatus, id],
    );

    return res.json({
      success: true,
      message: "Role berhasil diperbarui.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("PUT /api/roles/:id ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memperbarui role.",
      error: error.message,
    });
  }
});

// ============================================================
// DELETE ROLE
// ============================================================

app.delete("/api/roles/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID role tidak valid.",
      });
    }

    const existing = await pool.query(
      `
        SELECT
          id,
          name
        FROM master_role
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Role tidak ditemukan.",
      });
    }

    await pool.query(
      `
        DELETE FROM master_role
        WHERE id = $1
      `,
      [id],
    );

    return res.json({
      success: true,
      message: `Role "${existing.rows[0].name}" berhasil dihapus.`,
    });
  } catch (error) {
    console.error("DELETE /api/roles/:id ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal menghapus role.",
      error: error.message,
    });
  }
});

// Open-Meteo current weather endpoint
app.get("/api/weather/current", async (req, res) => {
  try {
    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({
        success: false,
        message: "latitude dan longitude wajib berupa angka.",
      });
    }

    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "Koordinat latitude/longitude tidak valid.",
      });
    }

    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current:
        "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure",
      timezone: "Asia/Jakarta",
    });

    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );

    if (!response.ok) {
      throw new Error(`Open-Meteo HTTP ${response.status}`);
    }

    const data = await response.json();

    return res.json({
      success: true,
      source: "Open-Meteo",
      latitude: data.latitude,
      longitude: data.longitude,
      timezone: data.timezone,
      current: data.current || null,
      current_units: data.current_units || null,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Open-Meteo current weather error:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data cuaca Open-Meteo.",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================
// GEOCODING PROXY
// Primary: Nominatim (OSM) with cache + strict rate limiting.
// Fallback: Photon when Nominatim is unavailable/rate-limited.
// Browser never calls public geocoders directly (avoids CORS).
// ============================================================
const geocodeCache = new Map();
let lastNominatimRequestAt = 0;
let geocodeQueue = Promise.resolve();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeWithNominatim(q) {
  const waitMs = Math.max(0, 1100 - (Date.now() - lastNominatimRequestAt));
  if (waitMs) await sleep(waitMs);
  lastNominatimRequestAt = Date.now();

  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "id",
    q,
  });

  const response = await fetchWithTimeout(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
        // Deliberate, identifiable application UA as required by Nominatim policy.
        "User-Agent": "SIMITIGASI-GIS/1.1 (+http://localhost:5173)",
      },
    },
    8000,
  );

  if (!response.ok) {
    const err = new Error(`Nominatim HTTP ${response.status}`);
    err.status = response.status;
    const retryAfter = Number(response.headers.get("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      err.retryAfterMs = Math.min(retryAfter * 1000, 10000);
    }
    throw err;
  }

  return await response.json();
}

async function geocodeWithPhoton(q) {
  const params = new URLSearchParams({
    q: `${q}, Indonesia`,
    limit: "1",
  });

  const response = await fetchWithTimeout(
    `https://photon.komoot.io/api/?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "SIMITIGASI-GIS/1.1 (+http://localhost:5173)",
      },
    },
    8000,
  );

  if (!response.ok) {
    throw new Error(`Photon HTTP ${response.status}`);
  }

  const payload = await response.json();
  const feature = payload?.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  const lon = Number(coordinates?.[0]);
  const lat = Number(coordinates?.[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];

  const props = feature?.properties || {};
  const displayName = [props.name, props.city, props.state, props.country]
    .filter(Boolean)
    .join(", ");

  // Normalize Photon into the same shape the frontend already expects from Nominatim.
  return [
    {
      lat: String(lat),
      lon: String(lon),
      display_name: displayName || q,
      source: "photon",
    },
  ];
}


async function reverseGeocodeWithNominatim(latitude, longitude) {
  const waitMs = Math.max(0, 1100 - (Date.now() - lastNominatimRequestAt));
  if (waitMs) await sleep(waitMs);
  lastNominatimRequestAt = Date.now();

  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(latitude),
    lon: String(longitude),
    zoom: "18",
    addressdetails: "1",
  });

  const response = await fetchWithTimeout(
    `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "SIMITIGASI-GIS/1.1 (+http://localhost:5173)",
      },
    },
    8000,
  );

  if (!response.ok) {
    const err = new Error(`Nominatim reverse HTTP ${response.status}`);
    err.status = response.status;
    const retryAfter = Number(response.headers.get("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      err.retryAfterMs = Math.min(retryAfter * 1000, 10000);
    }
    throw err;
  }

  const data = await response.json();

  // Jangan meneruskan response kosong/malformed sebagai lokasi yang valid.
  if (!data || typeof data !== "object" || !data.display_name) {
    throw new Error("Nominatim reverse response kosong/tidak valid.");
  }

  return {
    ...data,
    source: "nominatim",
  };
}

async function reverseGeocodeWithPhoton(latitude, longitude) {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
  });

  const response = await fetchWithTimeout(
    `https://photon.komoot.io/reverse?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "SIMITIGASI-GIS/1.1 (+http://localhost:5173)",
      },
    },
    8000,
  );

  if (!response.ok) {
    throw new Error(`Photon reverse HTTP ${response.status}`);
  }

  const payload = await response.json();
  const feature = payload?.features?.[0];

  if (!feature) {
    throw new Error("Photon reverse tidak menemukan lokasi.");
  }

  const props = feature?.properties || {};
  const coords = feature?.geometry?.coordinates || [];
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);

  const city = props.city || props.town || props.village || props.municipality;
  const county = props.county || props.district;
  const state = props.state;
  const country = props.country || "Indonesia";
  const postcode = props.postcode;

  const displayName = [
    props.name,
    props.street && props.housenumber
      ? `${props.street} ${props.housenumber}`
      : props.street,
    city,
    county,
    state,
    country,
  ]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .join(", ");

  if (!displayName) {
    throw new Error("Photon reverse response tidak memiliki nama lokasi.");
  }

  // Normalisasi Photon ke bentuk yang dipakai frontend:
  // display_name + address, tanpa mengubah koordinat/view peta.
  const address = {
    house_number: props.housenumber || undefined,
    road: props.street || undefined,
    neighbourhood: props.locality || props.neighbourhood || undefined,
    village: props.village || undefined,
    town: props.town || undefined,
    city: props.city || undefined,
    municipality: props.municipality || undefined,
    county: props.county || undefined,
    state_district: props.district || undefined,
    state: props.state || undefined,
    postcode: postcode || undefined,
    country: country || undefined,
    country_code: props.countrycode || "id",
  };

  Object.keys(address).forEach((key) => {
    if (address[key] === undefined || address[key] === null || address[key] === "") {
      delete address[key];
    }
  });

  return {
    lat: Number.isFinite(lat) ? String(lat) : String(latitude),
    lon: Number.isFinite(lon) ? String(lon) : String(longitude),
    display_name: displayName,
    address,
    source: "photon",
  };
}

app.get("/api/geocode/reverse", async (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return res.status(400).json({
      success: false,
      error: "Parameter lat/lon tidak valid.",
    });
  }

  // Cache per titik sampai 6 digit desimal agar GPS yang sama tidak
  // memukul provider geocoding berulang kali.
  const cacheKey = `reverse:${latitude.toFixed(6)}:${longitude.toFixed(6)}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.data);
  }

  // Satu antrean untuk provider geocoding supaya tidak membanjiri Nominatim.
  geocodeQueue = geocodeQueue
    .then(async () => {
      let data = null;
      let primaryError = null;

      // 1) Primary: Nominatim
      try {
        data = await reverseGeocodeWithNominatim(latitude, longitude);
        console.log(
          `âœ… Nominatim reverse geocoding: ${latitude}, ${longitude}`,
        );
      } catch (error) {
        primaryError = error;
        console.warn(
          "âš ï¸ Nominatim reverse geocoding unavailable:",
          error?.message || error,
        );

        // Jika provider meminta retry, tunggu sebelum fallback.
        if (error?.retryAfterMs) {
          await sleep(error.retryAfterMs);
        }
      }

      // 2) Fallback: Photon
      if (!data) {
        try {
          data = await reverseGeocodeWithPhoton(latitude, longitude);
          console.log(
            `âœ… Photon reverse geocoding fallback: ${latitude}, ${longitude}`,
          );
        } catch (fallbackError) {
          console.error(
            "âŒ Reverse geocoding fallback Photon gagal:",
            fallbackError,
          );

          if (primaryError) {
            throw new Error(
              `${primaryError.message}; fallback Photon: ${fallbackError.message}`,
            );
          }

          throw fallbackError;
        }
      }

      // Simpan hasil provider apa pun ke cache.
      geocodeCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      if (!res.headersSent) {
        return res.json(data);
      }
    })
    .catch((error) => {
      console.error("âŒ Reverse geocoding queue error:", error);
      if (!res.headersSent) {
        return res.status(502).json({
          success: false,
          error: "Gagal mendapatkan nama lokasi dari reverse geocoding.",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    });
});

app.get("/api/geocode/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 3) {
    return res.status(400).json({ error: "Parameter q minimal 3 karakter." });
  }

  const cacheKey = q.toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.data);
  }

  geocodeQueue = geocodeQueue
    .then(async () => {
      let data;
      let primaryError = null;

      try {
        data = await geocodeWithNominatim(q);
      } catch (error) {
        primaryError = error;
        console.warn(
          "âš ï¸ Nominatim geocoding unavailable:",
          error?.message || error,
        );

        // Respect Retry-After if Nominatim asks us to slow down before trying fallback.
        if (error?.retryAfterMs) await sleep(error.retryAfterMs);
      }

      if (!Array.isArray(data) || data.length === 0) {
        try {
          data = await geocodeWithPhoton(q);
          console.log(`âœ… Photon geocoding fallback: "${q}"`);
        } catch (fallbackError) {
          console.error("âŒ Geocoding fallback failed:", fallbackError);
          if (primaryError)
            throw new Error(
              `${primaryError.message}; fallback: ${fallbackError.message}`,
            );
          throw fallbackError;
        }
      }

      geocodeCache.set(cacheKey, {
        data,
        // Cache negative/positive results so repeated searches don't hammer providers.
        expiresAt: Date.now() + (data.length ? 10 : 2) * 60 * 1000,
      });
      res.json(data);
    })
    .catch((error) => {
      console.error("âŒ Geocoding error:", error);
      if (!res.headersSent) {
        res.status(502).json({
          error: "Gagal mencari lokasi.",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    });

  await geocodeQueue;
});

// ============================================================
// SIMITI ENTERPRISE â€” MEMBER / INSTITUTION REGISTRATION
// Adapted to current server.js: PostgreSQL + existing SHA-256 hashPassword()
// ============================================================
const ensureMemberRegistrationTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS member_organizations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        institution_type VARCHAR(120),
        province VARCHAR(120),
        address TEXT,
        website VARCHAR(255),
        status VARCHAR(30) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS member_registration_requests (
        id BIGSERIAL PRIMARY KEY,
        request_code VARCHAR(40) UNIQUE NOT NULL,
        institution_name VARCHAR(255) NOT NULL,
        institution_type VARCHAR(120),
        province VARCHAR(120),
        address TEXT,
        website VARCHAR(255),
        pic_name VARCHAR(180) NOT NULL,
        position VARCHAR(180),
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(60),
        username VARCHAR(100) NOT NULL,
        password_hash TEXT NOT NULL,
        reason TEXT,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        reviewed_by VARCHAR(120),
        reviewed_at TIMESTAMP,
        review_note TEXT,
        organization_id INTEGER,
        user_id INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS admin_notifications (
        id BIGSERIAL PRIMARY KEY,
        type VARCHAR(60) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        reference_type VARCHAR(80),
        reference_id BIGINT,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_member_registration_status ON member_registration_requests(status);
      CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON admin_notifications(is_read, created_at DESC);
    `);
    console.log("âœ… Member registration tables ready");
  } catch (error) {
    console.error("âŒ Member registration table init failed:", error.message);
  }
};
void ensureMemberRegistrationTables();

const memberRegistrationCode = () => {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `REG-${stamp}-${random}`;
};

const requireAdminMemberRegistration = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token)
    return res
      .status(401)
      .json({ success: false, message: "Access token required" });
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err)
      return res
        .status(403)
        .json({ success: false, message: "Invalid or expired token" });
    const role = String(
      decoded?.role_name || decoded?.role || "",
    ).toLowerCase();
    if (!["admin", "administrator", "superadmin"].includes(role)) {
      return res
        .status(403)
        .json({ success: false, message: "Admin access required" });
    }
    req.user = decoded;
    next();
  });
};

app.post("/api/member-registrations", async (req, res) => {
  try {
    const {
      institutionName,
      institutionType,
      province,
      address,
      website,
      picName,
      position,
      email,
      phone,
      username,
      password,
      reason,
      websiteTrap,
    } = req.body || {};
    if (websiteTrap)
      return res
        .status(400)
        .json({ success: false, message: "Permohonan tidak valid." });
    const clean = {
      institutionName: String(institutionName || "").trim(),
      institutionType: String(institutionType || "").trim(),
      province: String(province || "").trim(),
      address: String(address || "").trim(),
      website: String(website || "").trim(),
      picName: String(picName || "").trim(),
      position: String(position || "").trim(),
      email: String(email || "")
        .trim()
        .toLowerCase(),
      phone: String(phone || "").trim(),
      username: String(username || "").trim(),
      password: String(password || ""),
      reason: String(reason || "").trim(),
    };
    if (
      !clean.institutionName ||
      !clean.institutionType ||
      !clean.province ||
      !clean.address ||
      !clean.picName ||
      !clean.position ||
      !clean.email ||
      !clean.username ||
      !clean.password
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Data wajib belum lengkap." });
    }
    if (!/^\S+@\S+\.\S+$/.test(clean.email))
      return res
        .status(400)
        .json({ success: false, message: "Format email tidak valid." });
    if (clean.username.length < 4 || clean.password.length < 8)
      return res.status(400).json({
        success: false,
        message: "Username minimal 4 karakter dan password minimal 8 karakter.",
      });
    const duplicate = await pool.query(
      `SELECT id FROM users WHERE LOWER(username)=LOWER($1) OR LOWER(email)=LOWER($2) LIMIT 1`,
      [clean.username, clean.email],
    );
    if (duplicate.rows.length)
      return res
        .status(409)
        .json({ success: false, message: "Username/email sudah digunakan." });
    const pending = await pool.query(
      `SELECT id FROM member_registration_requests WHERE status='pending' AND (LOWER(username)=LOWER($1) OR LOWER(email)=LOWER($2)) LIMIT 1`,
      [clean.username, clean.email],
    );
    if (pending.rows.length)
      return res.status(409).json({
        success: false,
        message:
          "Permohonan dengan username/email tersebut masih menunggu approval.",
      });
    const requestCode = memberRegistrationCode();
    const passwordHash = hashPassword(clean.password);
    const result = await pool.query(
      `
      INSERT INTO member_registration_requests
      (request_code,institution_name,institution_type,province,address,website,pic_name,position,email,phone,username,password_hash,reason,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending')
      RETURNING id, request_code, status, created_at
    `,
      [
        requestCode,
        clean.institutionName,
        clean.institutionType,
        clean.province,
        clean.address,
        clean.website || null,
        clean.picName,
        clean.position,
        clean.email,
        clean.phone || null,
        clean.username,
        passwordHash,
        clean.reason || null,
      ],
    );
    const request = result.rows[0];
    await pool.query(
      `INSERT INTO admin_notifications (type,title,message,reference_type,reference_id) VALUES ($1,$2,$3,$4,$5)`,
      [
        "member_registration",
        "Permohonan Member Instansi Baru",
        `${clean.institutionName} mengajukan akses SIMITI Enterprise. PIC: ${clean.picName}.`,
        "member_registration_request",
        request.id,
      ],
    );
    return res.status(201).json({
      success: true,
      message:
        "Permohonan berhasil dikirim dan menunggu approval administrator.",
      data: request,
    });
  } catch (error) {
    console.error("POST /api/member-registrations ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal menyimpan permohonan member.",
      error: error.message,
    });
  }
});

app.get(
  "/api/admin/member-registrations/notification-count",
  requireAdminMemberRegistration,
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT COUNT(*)::int AS count FROM admin_notifications WHERE is_read=false AND type='member_registration'`,
      );
      return res.json({ success: true, count: result.rows[0]?.count || 0 });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
);

app.get(
  "/api/admin/member-registrations",
  requireAdminMemberRegistration,
  async (req, res) => {
    try {
      const status = String(req.query.status || "pending").trim();
      const allowed = ["pending", "approved", "rejected", "all"];
      if (!allowed.includes(status))
        return res
          .status(400)
          .json({ success: false, message: "Status tidak valid." });
      const params = [];
      const where = status === "all" ? "" : "WHERE r.status=$1";
      if (status !== "all") params.push(status);
      const result = await pool.query(
        `SELECT r.*, o.name AS organization_name FROM member_registration_requests r LEFT JOIN member_organizations o ON o.id=r.organization_id ${where} ORDER BY r.created_at DESC LIMIT 200`,
        params,
      );
      return res.json({ success: true, data: result.rows });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
);

app.put(
  "/api/admin/member-registrations/:id/approve",
  requireAdminMemberRegistration,
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const id = Number(req.params.id);
      const reviewNote = String(req.body?.reviewNote || "").trim();
      const requestResult = await client.query(
        `SELECT * FROM member_registration_requests WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!requestResult.rows.length)
        throw new Error("Permohonan tidak ditemukan.");
      const request = requestResult.rows[0];
      if (request.status !== "pending")
        throw new Error(`Permohonan sudah berstatus ${request.status}.`);
      const duplicateUser = await client.query(
        `SELECT id FROM users WHERE LOWER(username)=LOWER($1) OR LOWER(email)=LOWER($2) LIMIT 1`,
        [request.username, request.email],
      );
      if (duplicateUser.rows.length)
        throw new Error("Username/email sudah digunakan user lain.");
      let roleId = null;
      const roleResult = await client.query(
        `SELECT id FROM public.master_role WHERE LOWER(name) IN ('member','anggota') AND COALESCE(status,'active')='active' ORDER BY id LIMIT 1`,
      );
      roleId = roleResult.rows[0]?.id || null;
      if (!roleId) {
        const createdRole = await client.query(
          `INSERT INTO public.master_role (name,description,status) VALUES ('Member','Member instansi SIMITI','active') RETURNING id`,
        );
        roleId = createdRole.rows[0].id;
      }
      const orgResult = await client.query(
        `INSERT INTO member_organizations (name,institution_type,province,address,website,status) VALUES ($1,$2,$3,$4,$5,'active') RETURNING id`,
        [
          request.institution_name,
          request.institution_type,
          request.province,
          request.address,
          request.website || null,
        ],
      );
      const organizationId = orgResult.rows[0].id;
      const userResult = await client.query(
        `INSERT INTO users (username,email,password_hash,full_name,phone,role_id,organization_id,unit_id,status,avatar,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,'active',NULL,NOW(),NOW()) RETURNING id,username,email,full_name,phone,role_id,organization_id,status,created_at`,
        [
          request.username,
          request.email,
          request.password_hash,
          request.pic_name,
          request.phone || null,
          roleId,
          organizationId,
        ],
      );
      await client.query(
        `UPDATE member_registration_requests SET status='approved',reviewed_by=$1,reviewed_at=NOW(),review_note=$2,organization_id=$3,user_id=$4,updated_at=NOW() WHERE id=$5`,
        [
          req.user?.username || "admin",
          reviewNote || null,
          organizationId,
          userResult.rows[0].id,
          id,
        ],
      );
      await client.query(
        `UPDATE admin_notifications SET is_read=true WHERE reference_type='member_registration_request' AND reference_id=$1`,
        [id],
      );
      await client.query("COMMIT");
      return res.json({
        success: true,
        message: "Member instansi berhasil di-approve.",
        data: userResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      return res.status(400).json({ success: false, message: error.message });
    } finally {
      client.release();
    }
  },
);

app.put(
  "/api/admin/member-registrations/:id/reject",
  requireAdminMemberRegistration,
  async (req, res) => {
    try {
      const id = Number(req.params.id),
        reviewNote = String(req.body?.reviewNote || "").trim();
      const result = await pool.query(
        `UPDATE member_registration_requests SET status='rejected',reviewed_by=$1,reviewed_at=NOW(),review_note=$2,updated_at=NOW() WHERE id=$3 AND status='pending' RETURNING id,request_code,status,reviewed_at,review_note`,
        [req.user?.username || "admin", reviewNote || null, id],
      );
      if (!result.rows.length)
        return res.status(404).json({
          success: false,
          message: "Permohonan pending tidak ditemukan.",
        });
      await pool.query(
        `UPDATE admin_notifications SET is_read=true WHERE reference_type='member_registration_request' AND reference_id=$1`,
        [id],
      );
      return res.json({
        success: true,
        message: "Permohonan berhasil ditolak.",
        data: result.rows[0],
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
);

app.put(
  "/api/admin/notifications/:id/read",
  requireAdminMemberRegistration,
  async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE admin_notifications SET is_read=true WHERE id=$1 RETURNING id,is_read`,
        [Number(req.params.id)],
      );
      return res.json({ success: true, data: result.rows[0] || null });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
);

// ============================================================
// SIMITI PRO ENTERPRISE - LOCATION / GPS RISK ASSESSMENT
// GET /api/location-assessment?latitude=-6.2&longitude=106.8
// ============================================================
// ============================================================
// SIMITI PRO ENTERPRISE
// LOCATION / GPS RISK ASSESSMENT
//
// GET:
// /api/location-assessment?latitude=-6.2&longitude=106.8
//
// DATA SOURCE:
// - PostgreSQL / PostGIS
// - risk_layer_config
// - risk_class_score
// - risk_status_rule
//
// MY LOKASI:
// - 5 parameter
// - score 5 - 15
// - status berdasarkan risk_status_rule
//
// IMPORTANT:
// Frontend TIDAK menghitung MY LOKASI.
// Semua analisis dilakukan di backend.
// ============================================================

// ============================================================
// SIMITI - SPATIAL LOCATION DETECTION
// POST /api/spatial/detect-location
// Body: { latitude, longitude }
//
// Endpoint ini sengaja tidak bergantung pada /api/layers/*/geojson
// dan tidak memerlukan permission View layer untuk sekadar point-in-polygon.
// ============================================================
app.post("/api/spatial/detect-location", async (req, res) => {
  const latitude = Number(req.body?.latitude);
  const longitude = Number(req.body?.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return res.status(400).json({
      success: false,
      message: "Koordinat latitude/longitude tidak valid.",
    });
  }

  const point = "ST_SetSRID(ST_MakePoint($2, $1), 4326)";

  const findOne = async (sql, params = [latitude, longitude]) => {
    try {
      const result = await pool.query(sql, params);
      return result.rows[0] || null;
    } catch (error) {
      console.warn("âš ï¸ [SPATIAL DETECT] query layer gagal:", error.message);
      return null;
    }
  };

  try {
    const [provinsi, kabupaten, kecamatan, kelurahan, das] = await Promise.all([
      findOne(`
          SELECT provinsi
          FROM public.provinsi
          WHERE geom IS NOT NULL
            AND ST_Covers(
              CASE
                WHEN ST_SRID(geom) = 0 THEN ST_SetSRID(geom, 4326)
                WHEN ST_SRID(geom) = 4326 THEN geom
                ELSE ST_Transform(geom, 4326)
              END,
              ${point}
            )
          LIMIT 1
        `),

      findOne(`
          SELECT kab_kota
          FROM public.kab_kota
          WHERE geom IS NOT NULL
            AND ST_Covers(
              CASE
                WHEN ST_SRID(geom) = 0 THEN ST_SetSRID(geom, 4326)
                WHEN ST_SRID(geom) = 4326 THEN geom
                ELSE ST_Transform(geom, 4326)
              END,
              ${point}
            )
          LIMIT 1
        `),

      findOne(`
          SELECT kecamatan
          FROM public.kecamatan
          WHERE geom IS NOT NULL
            AND ST_Covers(
              CASE
                WHEN ST_SRID(geom) = 0 THEN ST_SetSRID(geom, 4326)
                WHEN ST_SRID(geom) = 4326 THEN geom
                ELSE ST_Transform(geom, 4326)
              END,
              ${point}
            )
          LIMIT 1
        `),

      findOne(`
          SELECT kel_desa
          FROM public.kel_desa
          WHERE geom IS NOT NULL
            AND ST_Covers(
              CASE
                WHEN ST_SRID(geom) = 0 THEN ST_SetSRID(geom, 4326)
                WHEN ST_SRID(geom) = 4326 THEN geom
                ELSE ST_Transform(geom, 4326)
              END,
              ${point}
            )
          LIMIT 1
        `),

      findOne(`
          SELECT nama_das, kode_das
          FROM public.das_adm
          WHERE geom IS NOT NULL
            AND ST_Covers(
              CASE
                WHEN ST_SRID(geom) = 0 THEN ST_SetSRID(geom, 4326)
                WHEN ST_SRID(geom) = 4326 THEN geom
                ELSE ST_Transform(geom, 4326)
              END,
              ${point}
            )
          LIMIT 1
        `),
    ]);

    return res.json({
      success: true,
      data: {
        provinsi: provinsi?.provinsi ?? "",
        kabupaten_kota: kabupaten?.kab_kota ?? "",
        kecamatan: kecamatan?.kecamatan ?? "",
        desa_kelurahan: kelurahan?.kel_desa ?? "",
        das: das?.nama_das ?? "",
        nama_das: das?.nama_das ?? "",
        kode_das: das?.kode_das ?? "",
      },
    });
  } catch (error) {
    console.error("âŒ /api/spatial/detect-location ERROR:", error);

    // Detection should never crash the location-entry workflow.
    return res.json({
      success: true,
      data: {
        provinsi: "",
        kabupaten_kota: "",
        kecamatan: "",
        desa_kelurahan: "",
        das: "",
        nama_das: "",
        kode_das: "",
      },
      warning: "Layer administrasi/DAS tidak dapat dibaca untuk titik ini.",
    });
  }
});

app.get("/api/location-assessment", async (req, res) => {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);

  const startedAt = Date.now();

  const checkpoint = (label) => {
    console.log(`â±ï¸ [LOCATION] ${label}: ${Date.now() - startedAt} ms`);
  };

  // ==========================================================
  // VALIDASI KOORDINAT
  // ==========================================================

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({
      success: false,
      message: "latitude dan longitude wajib berupa angka.",
    });
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({
      success: false,
      message: "Koordinat latitude/longitude tidak valid.",
    });
  }

  checkpoint("COORDINATE VALIDATED");

  // ==========================================================
  // HELPER
  // ==========================================================

  const quoteIdentifier = (value) => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(value))) {
      throw new Error(`Identifier database tidak valid: ${value}`);
    }

    return `"${value}"`;
  };

  // ==========================================================
  // POINT GPS
  //
  // longitude = X
  // latitude  = Y
  //
  // EPSG:4326
  // ==========================================================

  const point = `
    ST_SetSRID(
      ST_MakePoint($2, $1),
      4326
    )
  `;

  try {
    // ========================================================
    // 1. LOAD CONFIGURATION
    //
    // Jalankan 3 query configuration secara PARALLEL
    // ========================================================

    const [riskLayerResult, scoringResult, statusResult] = await Promise.all([
      pool.query(`
        SELECT
          id,
          risk_key,
          label,
          table_name,
          geometry_column,
          class_column,
          display_order
        FROM public.risk_layer_config
        WHERE enabled = TRUE
        ORDER BY display_order ASC, id ASC
      `),

      pool.query(`
        SELECT
          class_name,
          score
        FROM public.risk_class_score
        WHERE enabled = TRUE
      `),

      pool.query(`
        SELECT
          min_score,
          max_score,
          status
        FROM public.risk_status_rule
        WHERE enabled = TRUE
        ORDER BY min_score ASC
      `),
    ]);

    checkpoint("CONFIG LOADED");

    const riskLayers = riskLayerResult.rows;

    if (!riskLayers.length) {
      return res.status(500).json({
        success: false,
        message: "Konfigurasi layer risiko belum tersedia.",
      });
    }

    // ========================================================
    // SCORE MAP
    // ========================================================

    const scoreMap = new Map();

    for (const row of scoringResult.rows) {
      const normalizedClass = String(row.class_name || "")
        .trim()
        .toLowerCase();

      if (!normalizedClass) continue;

      scoreMap.set(normalizedClass, Number(row.score));
    }

    if (!scoreMap.size) {
      return res.status(500).json({
        success: false,
        message: "Konfigurasi scoring risiko belum tersedia.",
      });
    }

    // ========================================================
    // STATUS RULE
    // ========================================================

    const statusRules = statusResult.rows.map((row) => ({
      minScore: Number(row.min_score),
      maxScore: Number(row.max_score),
      status: row.status,
    }));

    if (!statusRules.length) {
      return res.status(500).json({
        success: false,
        message: "Konfigurasi status MY Lokasi belum tersedia.",
      });
    }

    const getStatusFromScore = (score) => {
      const numericScore = Number(score);

      const rule = statusRules.find(
        (item) =>
          numericScore >= item.minScore && numericScore <= item.maxScore,
      );

      return rule ? rule.status : null;
    };

    checkpoint("SCORING READY");

    // ========================================================
    // 2. ADMINISTRATIVE LOCATION + DAS
    //
    // PENTING:
    // Jangan pakai normalizedGeom().
    //
    // Semua layer yang kita cek sudah EPSG:4326.
    //
    // Jangan SELECT geometry.
    // Jangan ORDER BY ST_Area().
    // ========================================================

    const adminQuery = `
      SELECT

        (
          SELECT p.provinsi
          FROM public.provinsi p
          WHERE p.geom_valid IS NOT NULL
            AND p.geom_valid && ${point}
            AND ST_Covers(p.geom_valid, ${point})
          LIMIT 1
        ) AS provinsi,

        (
          SELECT k.kab_kota
          FROM public.kab_kota k
          WHERE k.geom_valid IS NOT NULL
            AND k.geom_valid && ${point}
            AND ST_Covers(k.geom_valid, ${point})
          LIMIT 1
        ) AS kabupaten,

        (
          SELECT k.kecamatan
          FROM public.kecamatan k
          WHERE k.geom_valid IS NOT NULL
            AND k.geom_valid && ${point}
            AND ST_Covers(k.geom_valid, ${point})
          LIMIT 1
        ) AS kecamatan,

        (
          SELECT k.kel_desa
          FROM public.kel_desa k
          WHERE k.geom_valid IS NOT NULL
            AND k.geom_valid && ${point}
            AND ST_Covers(k.geom_valid, ${point})
          LIMIT 1
        ) AS kelurahan,

        (
          SELECT d.nama_das
          FROM public.das_adm d
          WHERE d.geom_valid IS NOT NULL
            AND d.geom_valid && ${point}
            AND ST_Covers(d.geom_valid, ${point})
          LIMIT 1
        ) AS das
    `;    let admin = {};

    try {
      const adminResult = await pool.query(adminQuery, [latitude, longitude]);
      admin = adminResult.rows[0] || {};
    } catch (adminError) {
      console.warn(
        "âš ï¸ [LOCATION] ADMIN + DAS lookup gagal, assessment dilanjutkan:",
        adminError?.message || adminError,
      );
      admin = {};
    }

    checkpoint("ADMIN + DAS DONE");

    // ========================================================
    // 3. ANALYZE RISK LAYERS
    //
    // Semua risk query dijalankan PARALLEL.
    // ========================================================

    const riskPromises = riskLayers.map(async (definition) => {
      try {
        const tableName = quoteIdentifier(definition.table_name);

        const geometryColumn = quoteIdentifier(
          definition.geometry_column || "geom",
        );

        const classColumn = quoteIdentifier(definition.class_column || "kelas");

        // ==================================================
        // POSTGIS SRID NORMALIZATION
        //
        // Layer SRID 0 dianggap sudah memakai koordinat WGS84
        // (longitude/latitude), lalu diberi SRID 4326 di query.
        // Layer dengan SRID lain ditransform ke 4326.
        // Tidak ada perubahan permanen pada database.
        // ==================================================
        const normalizedGeometry = `(
          CASE
            WHEN ST_SRID(${geometryColumn}) = 0
              THEN ST_SetSRID(${geometryColumn}, 4326)
            WHEN ST_SRID(${geometryColumn}) = 4326
              THEN ${geometryColumn}
            ELSE ST_Transform(${geometryColumn}, 4326)
          END
        )`;

        const result = await pool.query(
          `
              SELECT
                ${classColumn} AS risk_class
              FROM public.${tableName}
              WHERE ${geometryColumn} IS NOT NULL
                AND (
                  (ST_SRID(${geometryColumn}) = 0 AND ${geometryColumn} && ST_Expand(ST_SetSRID(ST_MakePoint($2, $1), 0), 0.25))
                  OR
                  (ST_SRID(${geometryColumn}) = 4326 AND ${geometryColumn} && ST_Expand(${point}, 0.25))
                  OR
                  ST_SRID(${geometryColumn}) NOT IN (0, 4326)
                )
                AND ST_Covers(
                  ${normalizedGeometry},
                  ${point}
                )
              LIMIT 1
              `,
          [latitude, longitude],
        );

        const riskClass =
          result.rows[0]?.risk_class != null
            ? String(result.rows[0].risk_class).trim()
            : null;

        // ==================================================
        // TIDAK TERPETAKAN
        // ==================================================

        if (!riskClass) {
          return {
            key: definition.risk_key,
            label: definition.label,
            status: "Tidak terpetakan",
            class: null,
            score: null,
            source: definition.table_name,
            available: true,
          };
        }

        // ==================================================
        // SCORE DATABASE
        // ==================================================

        const normalizedClass = riskClass.toLowerCase();

        const score = scoreMap.get(normalizedClass);

        if (!Number.isFinite(score)) {
          return {
            key: definition.risk_key,
            label: definition.label,
            status: "Kelas tidak terkonfigurasi",
            class: riskClass,
            score: null,
            source: definition.table_name,
            available: true,
          };
        }

        return {
          key: definition.risk_key,
          label: definition.label,
          status: riskClass,
          class: riskClass,
          score,
          source: definition.table_name,
          available: true,
        };
      } catch (riskError) {
        console.warn(
          `âš ï¸ Risk layer failed: ${definition.table_name}`,
          riskError.message,
        );

        return {
          key: definition.risk_key,
          label: definition.label,
          status: "Tidak tersedia",
          class: null,
          score: null,
          source: definition.table_name,
          available: false,
          error: riskError.message,
        };
      }
    });

    const risks = await Promise.all(riskPromises);

    checkpoint("ALL RISK LAYERS DONE");

    // ========================================================
    // 4. MY LOKASI ENGINE
    // ========================================================

    const mappedRisks = risks.filter(
      (item) =>
        item.available === true &&
        item.score !== null &&
        item.score !== undefined &&
        Number.isFinite(Number(item.score)),
    );

    const expectedRiskLayerCount = riskLayers.length;

    const analyzedRiskLayerCount = mappedRisks.length;

    const complete =
      expectedRiskLayerCount > 0 &&
      analyzedRiskLayerCount === expectedRiskLayerCount;

    let myLokasiScore = null;
    let myLokasiStatus = null;

    if (complete) {
      const totalScore = mappedRisks.reduce(
        (sum, item) => sum + Number(item.score),
        0,
      );

      myLokasiScore = totalScore;

      myLokasiStatus = getStatusFromScore(totalScore);
    }

    checkpoint("MY LOKASI ENGINE DONE");

    // ========================================================
    // 5. API RISK INDEX
    //
    // METRIK TERPISAH
    // 0 - 100
    // ========================================================

    let apiRiskIndex = null;

    if (complete && mappedRisks.length > 0) {
      const totalScore = mappedRisks.reduce(
        (sum, item) => sum + Number(item.score),
        0,
      );

      const maximumScore = mappedRisks.length * 3;

      const minimumScore = mappedRisks.length * 1;

      if (maximumScore > minimumScore) {
        apiRiskIndex = Math.round(
          ((totalScore - minimumScore) / (maximumScore - minimumScore)) * 100,
        );
      }
    }

    // ========================================================
    // 6. RECOMMENDATIONS
    // ========================================================

    const recommendations = [];

    const addRecommendation = (title, detail, priority, source) => {
      if (!recommendations.some((item) => item.title === title)) {
        recommendations.push({
          title,
          detail,
          priority,
          source,
        });
      }
    };

    for (const item of mappedRisks) {
      const score = Number(item.score);

      if (score < 2) continue;

      const key = item.key;

      if (key === "banjir" || key === "banjir_bandang") {
        addRecommendation(
          "Pengendalian limpasan dan drainase",
          "Prioritaskan pengelolaan aliran permukaan, sempadan, dan kapasitas drainase di sekitar lokasi.",
          score >= 3 ? "Tinggi" : "Sedang",
          item.source,
        );
      }

      if (key === "longsor") {
        addRecommendation(
          "Konservasi tanah dan air",
          "Prioritaskan vegetasi penguat lereng, pengendalian erosi, dan pemeriksaan stabilitas lereng.",
          score >= 3 ? "Tinggi" : "Sedang",
          item.source,
        );
      }

      if (key === "kekeringan") {
        addRecommendation(
          "Konservasi sumber air",
          "Prioritaskan panen air hujan, perlindungan daerah tangkapan air, dan efisiensi penggunaan air.",
          score >= 3 ? "Tinggi" : "Sedang",
          item.source,
        );
      }

      if (key === "karhutla") {
        addRecommendation(
          "Pencegahan dan kesiapsiagaan karhutla",
          "Perkuat pemantauan hotspot dan kesiapsiagaan penanganan kebakaran hutan dan lahan.",
          score >= 3 ? "Tinggi" : "Sedang",
          item.source,
        );
      }
    }

    if (!recommendations.length && complete) {
      addRecommendation(
        "Pemantauan berkala",
        "Pertahankan pemantauan kondisi risiko dan informasi kebencanaan terkini pada lokasi.",
        "Rendah",
        "SIMITI",
      );
    }

    checkpoint("RECOMMENDATIONS DONE");

    // ========================================================
    // 7. RESPONSE
    // ========================================================

    const totalTime = Date.now() - startedAt;

    console.log(`ðŸš€ [LOCATION] TOTAL: ${totalTime} ms`);

    return res.json({
      success: true,

      source: "SIMITI PostgreSQL/PostGIS",

      analysisType: "GPS spatial risk assessment",

      generatedAt: new Date().toISOString(),

      processingTimeMs: totalTime,

      location: {
        latitude,
        longitude,

        administrative: {
          provinsi: admin.provinsi || null,

          kabupaten: admin.kabupaten || null,

          kecamatan: admin.kecamatan || null,

          kelurahan: admin.kelurahan || null,

          das: admin.das || null,
        },
      },

      risk: {
        status: myLokasiStatus,

        index: apiRiskIndex,

        scale: "0-100",

        methodology:
          "API Risk Index merupakan metrik normalisasi dari skor parameter risiko yang terpetakan. MY Lokasi menggunakan scoring dan status yang dikonfigurasi pada database SIMITI.",

        factors: risks,

        myLokasi: {
          score: myLokasiScore,

          minimum: riskLayers.length * 1,

          maximum: riskLayers.length * 3,

          status: myLokasiStatus,

          complete,

          analyzedParameters: analyzedRiskLayerCount,

          totalParameters: expectedRiskLayerCount,

          methodology:
            "Penjumlahan skor seluruh parameter risiko spasial yang terpetakan pada titik GPS.",

          parameters: mappedRisks.map((item) => ({
            key: item.key,
            label: item.label,
            class: item.class,
            score: item.score,
            source: item.source,
            available: item.available,
          })),
        },
      },

      recommendations,
    });
  } catch (error) {
    console.error("âŒ /api/location-assessment ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Gagal melakukan analisis lokasi GPS.",

      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================
// SIMITI ENTERPRISE - LOCATION PROXIMITY (ADDITIVE API)
// Tambahkan setelah route /api/location-assessment dan setelah
// ensureLokasiKegiatanTable() tersedia.
// Tidak mengubah endpoint existing.
// ============================================================
// ============================================================
// SIMITI ENTERPRISE - LOCATION PROXIMITY
// FIXED VERSION
//
// GET:
// /api/location-proximity
// ?latitude=-6.4089
// &longitude=106.7829
// &threatLimit=5
// &mitigationLimit=5
// &incidentLimit=5
// ============================================================

app.get("/api/location-proximity", async (req, res) => {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);

  const threatLimit = Math.min(
    Math.max(Number(req.query.threatLimit) || 5, 1),
    20,
  );

  const mitigationLimit = Math.min(
    Math.max(Number(req.query.mitigationLimit) || 5, 1),
    20,
  );

  const incidentLimit = Math.min(
    Math.max(Number(req.query.incidentLimit) || 5, 1),
    20,
  );

  const startedAt = Date.now();

  console.log("==============================================");
  console.log("ðŸ“ LOCATION PROXIMITY REQUEST");
  console.log({
    latitude,
    longitude,
    threatLimit,
    mitigationLimit,
    incidentLimit,
  });

  // ==========================================================
  // VALIDASI KOORDINAT
  // ==========================================================

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({
      success: false,
      message: "latitude dan longitude wajib berupa angka.",
    });
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({
      success: false,
      message: "Koordinat latitude/longitude tidak valid.",
    });
  }

  /*
   * $1 = latitude
   * $2 = longitude
   *
   * longitude = X
   * latitude  = Y
   */
  const point = "ST_SetSRID(ST_MakePoint($2, $1), 4326)";

  // Identifier database berasal dari risk_layer_config.
  // Tetap divalidasi sebelum dimasukkan ke SQL.
  const quoteIdentifier = (value) => {
    const normalized = String(value || "").trim();

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(normalized)) {
      throw new Error(`Identifier database tidak valid: ${value}`);
    }

    return `"${normalized}"`;
  };

  try {
    // ========================================================
    // 1. LOAD CONFIG + SCORING
    //
    // HARUS KONSISTEN DENGAN /api/location-assessment
    //
    // - risk_layer_config
    // - risk_class_score
    // - risk_status_rule
    // ========================================================

    console.log("ðŸ” [LOCATION PROXIMITY] Loading risk config + scoring...");

    const [riskConfigResult, scoringResult, statusResult] = await Promise.all([
      pool.query(`
        SELECT
          id,
          risk_key,
          label,
          table_name,
          geometry_column,
          class_column,
          display_order
        FROM public.risk_layer_config
        WHERE enabled = TRUE
        ORDER BY display_order ASC, id ASC
      `),

      pool.query(`
        SELECT
          class_name,
          score
        FROM public.risk_class_score
        WHERE enabled = TRUE
      `),

      pool.query(`
        SELECT
          min_score,
          max_score,
          status
        FROM public.risk_status_rule
        WHERE enabled = TRUE
        ORDER BY min_score ASC
      `),
    ]);

    const riskLayers = riskConfigResult.rows || [];

    if (!riskLayers.length) {
      return res.status(500).json({
        success: false,
        message: "Konfigurasi layer risiko belum tersedia.",
      });
    }

    const scoreMap = new Map();

    for (const row of scoringResult.rows || []) {
      const normalizedClass = String(row.class_name || "")
        .trim()
        .toLowerCase();

      if (!normalizedClass) continue;

      const score = Number(row.score);

      if (Number.isFinite(score)) {
        scoreMap.set(normalizedClass, score);
      }
    }

    if (!scoreMap.size) {
      return res.status(500).json({
        success: false,
        message: "Konfigurasi scoring risiko belum tersedia.",
      });
    }

    const statusRules = (statusResult.rows || []).map((row) => ({
      minScore: Number(row.min_score),
      maxScore: Number(row.max_score),
      status: row.status,
    }));

    if (!statusRules.length) {
      return res.status(500).json({
        success: false,
        message: "Konfigurasi status risiko belum tersedia.",
      });
    }

    const getStatusFromScore = (score) => {
      const numericScore = Number(score);

      if (!Number.isFinite(numericScore)) return null;

      const rule = statusRules.find(
        (item) =>
          numericScore >= item.minScore && numericScore <= item.maxScore,
      );

      return rule ? rule.status : null;
    };

    console.log(
      `âœ… [LOCATION PROXIMITY] Risk layers: ${riskLayers.length}, scoring classes: ${scoreMap.size}, status rules: ${statusRules.length}`,
    );

    // ========================================================
    // 2. THREATS
    //
    // Prioritas:
    //   1. INSIDE polygon
    //   2. SCORE tertinggi
    //   3. DISTANCE terdekat
    //
    // OPTIMIZED:
    // - Tetap 1 query per risk layer.
    // - Tidak mengubah struktur output threats.
    // - Tidak mengubah scoring.
    // - Tidak mengubah threatLimit.
    // - Tidak melakukan fallback full-table scan.
    // - BBox diperkecil menjadi radius pencarian yang wajar.
    // - ST_Distance hanya dihitung pada kandidat spatial.
    // ========================================================

    const threatResults = await Promise.all(
      riskLayers.map(async (definition) => {
        try {
          if (!definition.table_name) {
            console.warn(
              "[LOCATION PROXIMITY] Skip layer tanpa table_name:",
              definition.risk_key,
            );

            return [];
          }

          const tableName = quoteIdentifier(definition.table_name);

          const geometryColumn = quoteIdentifier(
            definition.geometry_column || "geom",
          );

          const classColumn = quoteIdentifier(
            definition.class_column || "kelas",
          );

          // ==================================================
          // POSTGIS SRID NORMALIZATION
          //
          // SRID 0    -> dianggap EPSG:4326
          // SRID 4326 -> dipakai langsung
          // SRID lain -> ditransform ke EPSG:4326
          //
          // Fungsi existing tetap dipertahankan.
          // ==================================================
          const normalizedGeometry = `(
        CASE
          WHEN ST_SRID(${geometryColumn}) = 0
            THEN ST_SetSRID(${geometryColumn}, 4326)

          WHEN ST_SRID(${geometryColumn}) = 4326
            THEN ${geometryColumn}

          ELSE ST_Transform(${geometryColumn}, 4326)
        END
      )`;

          // ==================================================
          // SEARCH RADIUS
          //
          // Sebelumnya bbox menggunakan 5 derajat.
          // Itu terlalu besar untuk proximity GPS.
          //
          // 0.25 derajat â‰ˆ Â±27 km di sekitar Indonesia.
          //
          // Nilai ini hanya membatasi kandidat spatial.
          // Urutan/output threats tetap sama.
          // ==================================================
          const SEARCH_RADIUS_DEG = 0.25;

          const nearbyQuery = `
        SELECT
          ${classColumn} AS risk_class,

          scoring.score AS risk_score,

          ST_Covers(
            ${normalizedGeometry},
            ${point}
          ) AS inside,

          CASE
            WHEN ST_Covers(
              ${normalizedGeometry},
              ${point}
            )
            THEN 0

            ELSE ROUND(
              ST_Distance(
                ${normalizedGeometry}::geography,
                ${point}::geography
              )
            )::bigint
          END AS distance_meters

        FROM public.${tableName}

        LEFT JOIN public.risk_class_score scoring
          ON LOWER(TRIM(scoring.class_name)) =
             LOWER(TRIM(CAST(${classColumn} AS TEXT)))
         AND scoring.enabled = TRUE

        WHERE ${geometryColumn} IS NOT NULL

          -- ==================================================
          -- FAST SPATIAL FILTER
          --
          -- Geometry asli tetap digunakan untuk bbox sehingga
          -- GiST/SP-GiST index masih berpeluang dipakai.
          -- ==================================================
          AND (
            (
              ST_SRID(${geometryColumn}) = 0
              AND ${geometryColumn} && ST_Expand(
                ST_SetSRID(
                  ST_MakePoint($2, $1),
                  4326
                ),
                ${SEARCH_RADIUS_DEG}
              )
            )

            OR

            (
              ST_SRID(${geometryColumn}) = 4326
              AND ${geometryColumn} && ST_Expand(
                ST_SetSRID(
                  ST_MakePoint($2, $1),
                  4326
                ),
                ${SEARCH_RADIUS_DEG}
              )
            )

            OR

            (
              ST_SRID(${geometryColumn}) NOT IN (0, 4326)
              AND ST_Intersects(
                ${normalizedGeometry},
                ST_Expand(
                  ${point},
                  ${SEARCH_RADIUS_DEG}
                )
              )
            )
          )

        ORDER BY
          ST_Covers(
            ${normalizedGeometry},
            ${point}
          ) DESC,

          scoring.score DESC NULLS LAST,

          ${normalizedGeometry} <-> ${point} ASC

        LIMIT 1
      `;

          const result = await pool.query(nearbyQuery, [latitude, longitude]);

          // ==================================================
          // IMPORTANT
          //
          // TIDAK ADA FALLBACK FULL TABLE SCAN.
          //
          // Kalau tidak ada feature dalam radius pencarian,
          // layer dianggap tidak memiliki threat terdekat.
          //
          // Ini mencegah query seperti:
          //
          // FROM table
          // WHERE geom IS NOT NULL
          // ORDER BY ST_Distance(...)
          //
          // yang bisa scan ratusan ribu feature.
          // ==================================================

          return (result.rows || []).map((row) => {
            const riskClass =
              row.risk_class !== null && row.risk_class !== undefined
                ? String(row.risk_class).trim()
                : null;

            const scoreFromDatabase = Number(row.risk_score);

            const score = Number.isFinite(scoreFromDatabase)
              ? scoreFromDatabase
              : riskClass
                ? (scoreMap.get(riskClass.toLowerCase()) ?? null)
                : null;

            const inside = Boolean(row.inside);

            return {
              key: definition.risk_key,

              label: definition.label || definition.risk_key,

              status: riskClass,

              // Score individual feature.
              score,

              // Tetap null karena level tidak berasal
              // dari risk_status_rule.
              level: null,

              // Feature yang berisi GPS = 0 meter.
              distanceMeters: inside
                ? 0
                : row.distance_meters !== null &&
                    row.distance_meters !== undefined
                  ? Number(row.distance_meters)
                  : null,

              inside,

              source: definition.table_name,
            };
          });
        } catch (error) {
          /*
           * Satu layer bermasalah tidak boleh membuat
           * seluruh endpoint menjadi 500.
           */
          console.warn(
            "âš ï¸ [LOCATION PROXIMITY] Risk layer skipped:",
            definition.risk_key,
            error.message,
          );

          return [];
        }
      }),
    );

    const threats = threatResults
      .flat()
      .sort((a, b) => {
        // ==================================================
        // 1. POLYGON YANG MENGANDUNG GPS
        // ==================================================
        if (Boolean(a.inside) !== Boolean(b.inside)) {
          return Boolean(b.inside) - Boolean(a.inside);
        }

        // ==================================================
        // 2. SCORE TERTINGGI
        // ==================================================
        const scoreA = Number.isFinite(Number(a.score))
          ? Number(a.score)
          : -Infinity;

        const scoreB = Number.isFinite(Number(b.score))
          ? Number(b.score)
          : -Infinity;

        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }

        // ==================================================
        // 3. DISTANCE TERDEKAT
        // ==================================================
        const distanceA = Number.isFinite(Number(a.distanceMeters))
          ? Number(a.distanceMeters)
          : Infinity;

        const distanceB = Number.isFinite(Number(b.distanceMeters))
          ? Number(b.distanceMeters)
          : Infinity;

        return distanceA - distanceB;
      })
      .slice(0, threatLimit);

    console.log(`âœ… [LOCATION PROXIMITY] Threats: ${threats.length}`);

    // ========================================================
    // 3. LOCATION RISK SUMMARY
    //
    // Untuk konsistensi dengan /api/location-assessment:
    // - gunakan 1 feature terbaik per risk layer
    // - jumlahkan score
    // - status ditentukan oleh risk_status_rule
    //
    // Ini terpisah dari ranking threats.
    // ========================================================

    const bestThreatByRiskKey = new Map();

    for (const threat of threats) {
      if (!Number.isFinite(Number(threat.score))) continue;

      if (!bestThreatByRiskKey.has(threat.key)) {
        bestThreatByRiskKey.set(threat.key, threat);
      }
    }

    const mappedThreats = Array.from(bestThreatByRiskKey.values());
    const expectedRiskLayerCount = riskLayers.length;
    const analyzedRiskLayerCount = mappedThreats.length;

    const complete =
      expectedRiskLayerCount > 0 &&
      analyzedRiskLayerCount === expectedRiskLayerCount;

    let riskScore = null;
    let riskStatus = null;

    if (complete) {
      riskScore = mappedThreats.reduce(
        (sum, item) => sum + Number(item.score),
        0,
      );

      riskStatus = getStatusFromScore(riskScore);
    }

    const riskLevel = riskStatus;

    // ========================================================
    // 4. LOKASI KEGIATAN / MITIGASI
    //
    // TETAP independent dari threat.
    // Sumber tetap:
    //   lokasi_kegiatan
    // ========================================================

    let mitigations = [];

    try {
      await ensureLokasiKegiatanTable();

      const mitigationResult = await pool.query(
        `
          SELECT
            id,
            kode,
            nama_kegiatan,
            jenis_kegiatan,
            status,
            instansi_pelaksana,
            provinsi,
            kabupaten_kota,
            kecamatan,
            desa_kelurahan,
            latitude,
            longitude,

            ROUND(
              ST_Distance(
                geom::geography,
                ${point}::geography
              )
            )::bigint AS distance_meters

          FROM public.lokasi_kegiatan

          WHERE geom IS NOT NULL

          ORDER BY
            geom <-> ${point}

          LIMIT $3
        `,
        [latitude, longitude, mitigationLimit],
      );

      mitigations = mitigationResult.rows.map((row) => ({
        ...row,

        latitude: row.latitude !== null ? Number(row.latitude) : null,
        longitude: row.longitude !== null ? Number(row.longitude) : null,

        distanceMeters:
          row.distance_meters !== null ? Number(row.distance_meters) : null,
      }));

      console.log(`âœ… [LOCATION PROXIMITY] Mitigations: ${mitigations.length}`);
    } catch (error) {
      console.warn(
        "âš ï¸ [LOCATION PROXIMITY] Mitigation query skipped:",
        error.message,
      );

      mitigations = [];
    }

    // ========================================================
    // 5. RIWAYAT KEJADIAN
    //
    // TETAP independent dari threat.
    // Sumber tetap:
    //   kejadian
    // ========================================================

    // ========================================================
    // 5. RIWAYAT KEJADIAN - BNPB
    //
    // Sumber:
    //   BNPB Data API
    //
    // Tidak lagi menggunakan:
    //   public.kejadian
    //
    // Tidak ada:
    //   k.geom
    //   ST_Transform
    //   ST_Distance PostGIS
    //
    // Proximity dihitung di memory setelah data BNPB
    // masuk ke cache.
    // ========================================================

    let incidents = [];

    try {
      const incidentStartedAt = Date.now();

      const bnpbRecords = await fetchBNPBIncidents();

      const toRad = (value) => (Number(value) * Math.PI) / 180;

      const distanceKm = (lat1, lon1, lat2, lon2) => {
        const R = 6371;

        const dLat = toRad(lat2 - lat1);

        const dLon = toRad(lon2 - lon1);

        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;

        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      incidents = bnpbRecords
        .map((row) => {
          const distanceKmValue = distanceKm(
            latitude,
            longitude,
            Number(row.latitude),
            Number(row.longitude),
          );

          return {
            id: row.id,

            disaster_type: row.disaster_type,

            event_date: row.event_date,

            latitude: Number(row.latitude),

            longitude: Number(row.longitude),

            province: row.province ?? null,

            kabupaten: row.kabupaten ?? null,

            source: row.source || "BNPB",

            distanceMeters: Math.round(distanceKmValue * 1000),
          };
        })
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, incidentLimit);

      console.log(`âœ… [LOCATION PROXIMITY] Incidents: ${incidents.length}`);

      console.log(
        `â±ï¸ [LOCATION PROXIMITY] BNPB INCIDENTS: ${
          Date.now() - incidentStartedAt
        } ms`,
      );
    } catch (error) {
      console.warn(
        "âš ï¸ [LOCATION PROXIMITY] BNPB incident adapter skipped:",
        error.message,
      );

      incidents = [];
    }

    // ========================================================
    // 6. RESPONSE
    // ========================================================

    const processingTimeMs = Date.now() - startedAt;

    console.log(`ðŸš€ [LOCATION PROXIMITY] TOTAL: ${processingTimeMs} ms`);

    console.log("==============================================");

    return res.json({
      success: true,

      source: "SIMITI PostgreSQL/PostGIS",

      analysisType: "GPS spatial proximity + risk scoring",

      generatedAt: new Date().toISOString(),

      processingTimeMs,

      location: {
        latitude,
        longitude,
      },

      // ======================================================
      // RISK SUMMARY
      //
      // Konsisten dengan /api/location-assessment:
      // total score -> risk_status_rule
      // ======================================================

      risk: {
        score: riskScore,

        status: riskStatus,

        level: riskLevel,

        complete,

        analyzedParameters: analyzedRiskLayerCount,

        totalParameters: expectedRiskLayerCount,

        minimum: expectedRiskLayerCount * 1,

        maximum: expectedRiskLayerCount * 3,

        methodology:
          "Penjumlahan skor feature risiko terbaik pada setiap parameter spasial yang relevan terhadap GPS, dengan status ditentukan oleh risk_status_rule.",

        parameters: mappedThreats.map((item) => ({
          key: item.key,
          label: item.label,
          class: item.status,
          score: item.score,
          source: item.source,
          inside: item.inside,
          distanceMeters: item.distanceMeters,
        })),
      },

      // ======================================================
      // THREATS
      //
      // Prioritas:
      // INSIDE -> SCORE -> DISTANCE
      // ======================================================

      threats,

      // ======================================================
      // MITIGATIONS
      //
      // Sumber: lokasi_kegiatan
      // ======================================================

      mitigations,

      // ======================================================
      // INCIDENTS
      //
      // Sumber: kejadian
      // ======================================================

      incidents,

      summary: {
        threatCount: threats.length,

        mitigationCount: mitigations.length,

        incidentCount: incidents.length,

        nearestThreatDistanceMeters: threats[0]?.distanceMeters ?? null,

        nearestMitigationDistanceMeters: mitigations[0]?.distanceMeters ?? null,

        nearestIncidentDistanceMeters: incidents[0]?.distanceMeters ?? null,

        highestThreatScore:
          threats.length > 0
            ? Math.max(
                ...threats
                  .map((item) => Number(item.score))
                  .filter(Number.isFinite),
              )
            : null,
      },
    });
  } catch (error) {
    console.error(
      "âŒ [LOCATION PROXIMITY] FATAL ERROR:",
      error instanceof Error ? error.message : String(error),
    );

    console.error("âŒ stack:", error instanceof Error ? error.stack : "");

    return res.status(500).json({
      success: false,

      message: "Gagal melakukan analisis kedekatan spasial.",

      error: error instanceof Error ? error.message : String(error),

      processingTimeMs: Date.now() - startedAt,
    });
  }
});

// ============================================================
// SIMITI - GPS -> BNPB -> ANCAMAN + TITIK AMAN TERDEKAT
// Konfigurasi BNPB dan pencarian titik aman sepenuhnya melalui .env.
// Tidak ada URL/layer/radius/step kandidat yang ditanam di source code.
// ============================================================

function readJsonEnv(name, fallback = []) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : fallback;
  } catch (error) {
    throw new Error(`${name} harus berupa JSON array yang valid.`);
  }
}

function getBnpbConfig() {
  const serviceUrl = String(process.env.BNPB_RISK_SERVICE_URL || "")
    .trim()
    .replace(/\/$/, "");
  const layers = readJsonEnv("BNPB_RISK_LAYERS_JSON");
  const safeMaxScore = Number(process.env.BNPB_SAFE_MAX_SCORE);
  const radiusMeters = Number(process.env.BNPB_SAFE_SEARCH_RADIUS_METERS);
  const stepMeters = Number(process.env.BNPB_SAFE_SEARCH_STEP_METERS);
  const bearingCount = Number(process.env.BNPB_SAFE_SEARCH_BEARINGS);
  const maxPoints = Number(process.env.BNPB_SAFE_SEARCH_MAX_POINTS);

  if (!serviceUrl || !layers.length) {
    throw new Error(
      "Konfigurasi BNPB belum lengkap: BNPB_RISK_SERVICE_URL dan BNPB_RISK_LAYERS_JSON wajib di .env.",
    );
  }

  const config = {
    serviceUrl,
    layers,
    safeMaxScore: Number.isFinite(safeMaxScore) ? safeMaxScore : null,
    radiusMeters: Number.isFinite(radiusMeters) ? radiusMeters : null,
    stepMeters: Number.isFinite(stepMeters) ? stepMeters : null,
    bearingCount: Number.isFinite(bearingCount) ? bearingCount : null,
    maxPoints: Number.isFinite(maxPoints) ? maxPoints : null,
  };

  if (
    config.safeMaxScore == null ||
    config.radiusMeters == null ||
    config.stepMeters == null ||
    config.bearingCount == null ||
    config.maxPoints == null ||
    config.radiusMeters <= 0 ||
    config.stepMeters <= 0 ||
    config.bearingCount < 4 ||
    config.maxPoints < 1
  ) {
    throw new Error(
      "Konfigurasi pencarian titik aman BNPB tidak valid. Isi BNPB_SAFE_MAX_SCORE, BNPB_SAFE_SEARCH_RADIUS_METERS, BNPB_SAFE_SEARCH_STEP_METERS, BNPB_SAFE_SEARCH_BEARINGS, BNPB_SAFE_SEARCH_MAX_POINTS.",
    );
  }

  return config;
}

const normalizeBnpbClass = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const normalizeBnpbRisk = (value) => {
  const v = normalizeBnpbClass(value);
  if (!v) return { class: null, score: null };
  if (
    v === "3" ||
    v.includes("sangat tinggi") ||
    v.includes("tinggi") ||
    v.includes("bahaya") ||
    v.includes("rawan")
  ) {
    return { class: "Tinggi", score: 3 };
  }
  if (
    v === "2" ||
    v.includes("sedang") ||
    v.includes("waspada") ||
    v.includes("siaga")
  ) {
    return { class: "Sedang", score: 2 };
  }
  if (v === "1" || v === "0" || v.includes("rendah") || v.includes("aman")) {
    return { class: "Rendah", score: 1 };
  }
  return { class: null, score: null };
};

const classifyBnpbAttributes = (attributes = {}) => {
  const entries = Object.entries(attributes || {}).filter(
    ([, value]) =>
      value !== null && value !== undefined && String(value).trim() !== "",
  );
  const preferred = entries.find(([key]) =>
    /kelas|class|status|risiko|risk|bahaya|hazard|indeks|index|tingkat|level/i.test(
      String(key),
    ),
  );
  const source =
    preferred ||
    entries.find(([, value]) =>
      /sangat tinggi|tinggi|sedang|rendah|aman|bahaya|rawan|^[0-3]$/i.test(
        String(value),
      ),
    );
  return {
    field: source ? String(source[0]) : null,
    value: source ? String(source[1]).trim() : null,
  };
};

const queryBnpbPoint = async (layer, latitude, longitude, config) => {
  const layerId = Number(layer.layerId);
  if (!Number.isInteger(layerId) || layerId < 0) {
    throw new Error(`layerId BNPB tidak valid untuk ${layer.key}.`);
  }

  const x = Number(longitude);
  const y = Number(latitude);
  const params = new URLSearchParams({
    f: "json",
    geometry: JSON.stringify({ x, y, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPoint",
    sr: "4326",
    layers: `all:${layerId}`,
    tolerance: "2",
    mapExtent: `${x - 0.01},${y - 0.01},${x + 0.01},${y + 0.01}`,
    imageDisplay: "1000,1000,96",
    returnGeometry: "false",
  });

  const response = await fetch(
    `${config.serviceUrl}/identify?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) throw new Error(`BNPB HTTP ${response.status}`);
  const json = await response.json();
  if (json?.error) throw new Error(json.error.message || "BNPB identify error");

  const result = Array.isArray(json?.results) ? json.results[0] : null;
  if (!result) {
    return {
      key: layer.key,
      label: layer.label || layer.key,
      category: layer.category || "Ancaman",
      layerId,
      inside: false,
      available: true,
      class: null,
      value: null,
      score: null,
      field: null,
      source: config.serviceUrl,
    };
  }

  const classified = classifyBnpbAttributes(result.attributes || {});
  const normalized = normalizeBnpbRisk(classified.value);
  return {
    key: layer.key,
    label: layer.label || layer.key,
    category: layer.category || "Ancaman",
    layerId,
    inside: true,
    available: true,
    class: normalized.class || classified.value,
    value: classified.value,
    score: normalized.score,
    level: normalized.class,
    field: classified.field,
    source: config.serviceUrl,
  };
};

const identifyBnpbAtPoint = async (
  latitude,
  longitude,
  config = getBnpbConfig(),
) =>
  Promise.all(
    config.layers.map(async (layer) => {
      try {
        return await queryBnpbPoint(layer, latitude, longitude, config);
      } catch (error) {
        return {
          key: layer.key,
          label: layer.label || layer.key,
          category: layer.category || "Ancaman",
          layerId: Number(layer.layerId),
          inside: false,
          available: false,
          class: null,
          value: null,
          score: null,
          level: null,
          field: null,
          source: config.serviceUrl,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

const isBnpbSafePoint = (layers, config) => {
  const usable = layers.filter((item) => item.available);
  if (usable.length !== config.layers.length) return false;
  return layers.every(
    (item) =>
      !item.inside ||
      (Number.isFinite(item.score) && item.score <= config.safeMaxScore),
  );
};

const destinationPoint = (
  latitude,
  longitude,
  distanceMeters,
  bearingDegrees,
) => {
  const earthRadius = 6371008.8;
  const angular = distanceMeters / earthRadius;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const lat1 = (latitude * Math.PI) / 180;
  const lon1 = (longitude * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: (lon2 * 180) / Math.PI,
  };
};

const distanceMeters = (lat1, lon1, lat2, lon2) => {
  const r = 6371008.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
};

const buildSafeSearchCandidates = (latitude, longitude, config) => {
  const points = [
    { latitude, longitude, distanceMeters: 0, bearingDegrees: 0 },
  ];
  const bearings = Math.max(4, Math.floor(config.bearingCount));
  const rings = Math.max(1, Math.ceil(config.radiusMeters / config.stepMeters));

  for (
    let ring = 1;
    ring <= rings && points.length < config.maxPoints;
    ring += 1
  ) {
    const radius = Math.min(ring * config.stepMeters, config.radiusMeters);
    for (let i = 0; i < bearings && points.length < config.maxPoints; i += 1) {
      const bearing = (360 / bearings) * i;
      const point = destinationPoint(latitude, longitude, radius, bearing);
      if (
        point.latitude < -90 ||
        point.latitude > 90 ||
        point.longitude < -180 ||
        point.longitude > 180
      )
        continue;
      points.push({
        ...point,
        distanceMeters: distanceMeters(
          latitude,
          longitude,
          point.latitude,
          point.longitude,
        ),
        bearingDegrees: bearing,
      });
    }
  }
  return points;
};

app.get("/api/location-bnpb", async (req, res) => {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return res.status(400).json({
      success: false,
      message: "latitude dan longitude wajib berupa koordinat valid.",
    });
  }

  const startedAt = Date.now();
  try {
    const config = getBnpbConfig();
    const disasterLayers = await identifyBnpbAtPoint(
      latitude,
      longitude,
      config,
    );
    const riskFactors = disasterLayers.map((item) => ({
      key: item.key,
      label: item.label,
      status: item.class,
      level: item.level,
      class: item.class,
      score: item.score,
      source: item.source,
      available: item.available && Number.isFinite(item.score),
      inside: item.inside,
      rawValue: item.value,
    }));

    const completeRisk =
      riskFactors.length === config.layers.length &&
      riskFactors.every((item) => item.available);
    const myLokasiScore = completeRisk
      ? riskFactors.reduce((sum, item) => sum + Number(item.score), 0)
      : null;
    const myLokasiStatus =
      myLokasiScore == null
        ? null
        : myLokasiScore <= 7
          ? "Aman"
          : myLokasiScore <= 10
            ? "Siaga"
            : myLokasiScore <= 13
              ? "Waspada"
              : "Rawan";
    const apiRiskIndex =
      myLokasiScore == null
        ? null
        : Math.round(
            ((myLokasiScore - config.layers.length) /
              Math.max(1, config.layers.length * 2)) *
              100,
          );
    const identifiedDisasters = disasterLayers
      .filter((item) => item.inside)
      .map((item) => ({
        key: item.key,
        label: item.label,
        category: item.category,
        class: item.class,
        field: item.field,
        score: item.score,
        source: item.source,
      }));

    const candidates = buildSafeSearchCandidates(latitude, longitude, config);
    let safeLocation = null;
    let checked = 0;

    for (const candidate of candidates) {
      const layers = await identifyBnpbAtPoint(
        candidate.latitude,
        candidate.longitude,
        config,
      );
      checked += 1;
      const safe = isBnpbSafePoint(layers, config);
      if (safe) {
        safeLocation = {
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          distanceMeters: candidate.distanceMeters,
          bearingDegrees: candidate.bearingDegrees,
          safe: true,
          verified: true,
          layers: layers.map((item) => ({
            key: item.key,
            label: item.label,
            class: item.class,
            score: item.score,
            source: item.source,
          })),
        };
        break;
      }
    }

    return res.json({
      success: true,
      source: "BNPB InaRISK REST API",
      analysisType:
        "GPS disaster identification + nearest safe point from BNPB hazard layers",
      generatedAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startedAt,
      location: { latitude, longitude },
      risk: {
        status: myLokasiStatus,
        score: myLokasiScore,
        index: apiRiskIndex,
        minimum: config.layers.length,
        maximum: config.layers.length * 3,
        complete: completeRisk,
        factors: riskFactors,
        methodology:
          "GPS -> BNPB -> seluruh layer ancaman -> skor layer -> pencarian radial -> titik pertama yang seluruh layer-nya memenuhi batas aman.",
      },
      disasters: identifiedDisasters,
      layers: disasterLayers.map((item) => ({
        key: item.key,
        label: item.label,
        category: item.category,
        inside: item.inside,
        available: item.available,
        class: item.class,
        field: item.field,
        source: item.source,
        error: item.error || null,
      })),
      safeLocation,
      search: {
        radiusMeters: config.radiusMeters,
        stepMeters: config.stepMeters,
        bearingCount: config.bearingCount,
        candidateCheckedCount: checked,
        maxPoints: config.maxPoints,
        safeMaxScore: config.safeMaxScore,
      },
      summary: {
        disasterCount: identifiedDisasters.length,
        layerCount: disasterLayers.length,
        availableLayerCount: disasterLayers.filter((item) => item.available)
          .length,
        safeFound: Boolean(safeLocation),
      },
    });
  } catch (error) {
    console.error("âŒ [LOCATION BNPB] ERROR:", error);
    return res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Gagal melakukan identifikasi bencana BNPB.",
      processingTimeMs: Date.now() - startedAt,
    });
  }
});

// ============================================================
// SIMITI ENTERPRISE - LOKASI KEGIATAN (isolated additive API)
// Tidak mengubah endpoint existing.
// ============================================================
async function ensureLokasiKegiatanTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lokasi_kegiatan (
      id SERIAL PRIMARY KEY,
      kode VARCHAR(60) UNIQUE NOT NULL,
      nama_kegiatan TEXT NOT NULL,
      jenis_kegiatan VARCHAR(120),
      tahun_pelaksanaan INTEGER,
      sumber_pendanaan TEXT,
      instansi_pelaksana TEXT,
      provinsi TEXT,
      kabupaten_kota TEXT,
      kecamatan TEXT,
      desa_kelurahan TEXT,
      luas_area DOUBLE PRECISION,
      status VARCHAR(40),
      keterangan TEXT,
      longitude DOUBLE PRECISION NOT NULL,
      latitude DOUBLE PRECISION NOT NULL,
      geom geometry(Point,4326),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  await pool.query(
    `ALTER TABLE lokasi_kegiatan ADD COLUMN IF NOT EXISTS kode_prov TEXT`,
  );
  await pool.query(
    `ALTER TABLE lokasi_kegiatan ADD COLUMN IF NOT EXISTS kode_kk TEXT`,
  );
  await pool.query(
    `ALTER TABLE lokasi_kegiatan ADD COLUMN IF NOT EXISTS kode_kec TEXT`,
  );
  await pool.query(
    `ALTER TABLE lokasi_kegiatan ADD COLUMN IF NOT EXISTS kode_kd TEXT`,
  );
  await pool.query(
    `ALTER TABLE lokasi_kegiatan ADD COLUMN IF NOT EXISTS das TEXT`,
  );
  await pool.query(
    `ALTER TABLE lokasi_kegiatan ADD COLUMN IF NOT EXISTS kode_das TEXT`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_lokasi_kegiatan_kode_das ON lokasi_kegiatan(kode_das)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_lokasi_kegiatan_kode_prov ON lokasi_kegiatan(kode_prov)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_lokasi_kegiatan_kode_kk ON lokasi_kegiatan(kode_kk)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_lokasi_kegiatan_kode_kec ON lokasi_kegiatan(kode_kec)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_lokasi_kegiatan_geom ON lokasi_kegiatan USING GIST (geom)`,
  );
}
ensureLokasiKegiatanTable().catch((err) =>
  console.error("Lokasi kegiatan table init:", err),
);

app.get("/api/lokasi-kegiatan", async (req, res) => {
  try {
    await ensureLokasiKegiatanTable();
    const { search = "", jenis = "", tahun = "", status = "" } = req.query;
    const params = [];
    const where = [];
    if (search) {
      params.push(`%${String(search)}%`);
      where.push(
        `(nama_kegiatan ILIKE $${params.length} OR instansi_pelaksana ILIKE $${params.length} OR kabupaten_kota ILIKE $${params.length})`,
      );
    }
    if (jenis) {
      params.push(String(jenis));
      where.push(`jenis_kegiatan=$${params.length}`);
    }
    if (tahun) {
      params.push(Number(tahun));
      where.push(`tahun_pelaksanaan=$${params.length}`);
    }
    if (status) {
      params.push(String(status));
      where.push(`status=$${params.length}`);
    }
    const q = `SELECT id,kode,nama_kegiatan,jenis_kegiatan,tahun_pelaksanaan,sumber_pendanaan,instansi_pelaksana,provinsi,kabupaten_kota,kecamatan,desa_kelurahan,luas_area,status,keterangan,longitude,latitude,created_at,updated_at FROM lokasi_kegiatan ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC`;
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Gagal mengambil data lokasi kegiatan" });
  }
});
app.get("/api/lokasi-kegiatan/:id", async (req, res) => {
  try {
    await ensureLokasiKegiatanTable();
    const r = await pool.query("SELECT * FROM lokasi_kegiatan WHERE id=$1", [
      req.params.id,
    ]);
    if (!r.rowCount)
      return res.status(404).json({ message: "Data tidak ditemukan" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ message: "Gagal mengambil data" });
  }
});
app.post("/api/lokasi-kegiatan", async (req, res) => {
  try {
    await ensureLokasiKegiatanTable();
    const b = req.body || {};
    const lat = Number(b.latitude),
      lng = Number(b.longitude);
    if (
      !b.nama_kegiatan ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    )
      return res
        .status(400)
        .json({ message: "Nama kegiatan dan koordinat valid wajib diisi." });
    const kode = `KGT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const r = await pool.query(
      `INSERT INTO lokasi_kegiatan (
    kode,
    nama_kegiatan,
    jenis_kegiatan,
    tahun_pelaksanaan,
    sumber_pendanaan,
    instansi_pelaksana,
    provinsi,
    kabupaten_kota,
    kecamatan,
    desa_kelurahan,
    kode_prov,
    kode_kk,
    kode_kec,
    kode_kd,
    das,
    kode_das,
    luas_area,
    status,
    keterangan,
    longitude,
    latitude,
    geom,
    updated_at
  )
  VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    $9,
    $10,
    $11,
    $12,
    $13,
    $14,
    $15,
    $16,
    $17,
    $18,
    $19,
    $20,
    $21,
    ST_SetSRID(ST_MakePoint($20, $21), 4326),
    NOW()
  )
  RETURNING *`,
      [
        kode,
        b.nama_kegiatan,
        b.jenis_kegiatan || null,
        b.tahun_pelaksanaan ? Number(b.tahun_pelaksanaan) : null,
        b.sumber_pendanaan || null,
        b.instansi_pelaksana || null,
        b.provinsi || null,
        b.kabupaten_kota || null,
        b.kecamatan || null,
        b.desa_kelurahan || null,
        b.kode_prov || null,
        b.kode_kk || null,
        b.kode_kec || null,
        b.kode_kd || null,
        b.das || null,
        b.kode_das || null,
        b.luas_area !== "" && b.luas_area != null ? Number(b.luas_area) : null,
        b.status || "Direncanakan",
        b.keterangan || null,

        // $20 = longitude
        lng,

        // $21 = latitude
        lat,
      ],
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error("\n========== LOKASI KEGIATAN ERROR ==========");
    console.error("Message :", e?.message);
    console.error("Code    :", e?.code);
    console.error("Detail  :", e?.detail);
    console.error("Hint    :", e?.hint);
    console.error("Table   :", e?.table);
    console.error("Column  :", e?.column);
    console.error("Constraint:", e?.constraint);
    console.error("Stack   :", e?.stack);
    console.error("===========================================\n");

    res.status(500).json({
      message: e?.message || "Gagal menyimpan lokasi kegiatan",
      code: e?.code || null,
      detail: e?.detail || null,
      hint: e?.hint || null,
    });
  }
});
app.put("/api/lokasi-kegiatan/:id", async (req, res) => {
  try {
    const b = req.body || {},
      lat = Number(b.latitude),
      lng = Number(b.longitude);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    )
      return res.status(400).json({ message: "Koordinat tidak valid" });
    const r = await pool.query(
      `UPDATE lokasi_kegiatan SET nama_kegiatan=$1,jenis_kegiatan=$2,tahun_pelaksanaan=$3,sumber_pendanaan=$4,instansi_pelaksana=$5,provinsi=$6,kabupaten_kota=$7,kecamatan=$8,desa_kelurahan=$9,kode_prov=$10,kode_kk=$11,kode_kec=$12,kode_kd=$13,das=$14,kode_das=$15,luas_area=$16,status=$17,keterangan=$18,longitude=$19,latitude=$20,geom=ST_SetSRID(ST_MakePoint($19,$20),4326),updated_at=NOW() WHERE id=$21 RETURNING *`,
      [
        b.nama_kegiatan,
        b.jenis_kegiatan || null,
        b.tahun_pelaksanaan ? Number(b.tahun_pelaksanaan) : null,
        b.sumber_pendanaan || null,
        b.instansi_pelaksana || null,
        b.provinsi || null,
        b.kabupaten_kota || null,
        b.kecamatan || null,
        b.desa_kelurahan || null,
        b.kode_prov || null,
        b.kode_kk || null,
        b.kode_kec || null,
        b.kode_kd || null,
        b.das || null,
        b.kode_das || null,
        b.luas_area !== "" && b.luas_area != null ? Number(b.luas_area) : null,
        b.status || "Direncanakan",
        b.keterangan || null,
        lng,
        lat,
        req.params.id,
      ],
    );
    if (!r.rowCount)
      return res.status(404).json({ message: "Data tidak ditemukan" });
    res.json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Gagal memperbarui lokasi kegiatan" });
  }
});
app.delete("/api/lokasi-kegiatan/:id", async (req, res) => {
  try {
    const r = await pool.query(
      "DELETE FROM lokasi_kegiatan WHERE id=$1 RETURNING id",
      [req.params.id],
    );
    if (!r.rowCount)
      return res.status(404).json({ message: "Data tidak ditemukan" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (e) {
    res.status(500).json({ message: "Gagal menghapus lokasi kegiatan" });
  }
});

// ============================================================
// SIMITI ENTERPRISE - USER LAYER AUTHORIZATION
// ============================================================

const USER_LAYER_AUTH_SQL = `
  CREATE TABLE IF NOT EXISTS user_layer_authorizations (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    layer_id INTEGER NOT NULL,
    can_view BOOLEAN NOT NULL DEFAULT FALSE,
    can_query BOOLEAN NOT NULL DEFAULT FALSE,
    can_export BOOLEAN NOT NULL DEFAULT FALSE,
    can_download BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_layer_authorization
      UNIQUE (user_id, layer_id),

    CONSTRAINT fk_ula_user
      FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE,

    CONSTRAINT fk_ula_layer
      FOREIGN KEY (layer_id)
      REFERENCES layer_metadata(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_ula_user
    ON user_layer_authorizations(user_id);

  CREATE INDEX IF NOT EXISTS idx_ula_layer
    ON user_layer_authorizations(layer_id);

  CREATE INDEX IF NOT EXISTS idx_ula_user_view
    ON user_layer_authorizations(user_id, can_view);

  CREATE INDEX IF NOT EXISTS idx_ula_layer_view
    ON user_layer_authorizations(layer_id, can_view);

  CREATE OR REPLACE FUNCTION update_user_layer_authorizations_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trg_user_layer_authorizations_updated_at
    ON user_layer_authorizations;

  CREATE TRIGGER trg_user_layer_authorizations_updated_at
    BEFORE UPDATE ON user_layer_authorizations
    FOR EACH ROW
    EXECUTE FUNCTION update_user_layer_authorizations_updated_at();
`;

async function ensureUserLayerAuthorizationTable() {
  await pool.query(USER_LAYER_AUTH_SQL);
}

ensureUserLayerAuthorizationTable().catch((error) => {
  console.error("âŒ User layer authorization table init:", error);
});

function parsePositiveId(value, fieldName) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error(`${fieldName} tidak valid.`);
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function normalizePermissionPayload(body = {}) {
  return {
    can_view: Boolean(body.can_view),
    can_query: Boolean(body.can_query),
    can_export: Boolean(body.can_export),
    can_download: Boolean(body.can_download),
    can_manage: Boolean(body.can_manage),
  };
}

// ============================================================
// ADMIN-ONLY USER LAYER AUTHORIZATION MANAGEMENT
// ============================================================

function requireLayerAuthorizationAdmin(req, res, next) {
  const decoded = getDecodedToken(req);

  if (!decoded) {
    return res.status(401).json({
      success: false,
      message: "Access token required.",
    });
  }

  if (!isPrivilegedLayerToken(decoded)) {
    return res.status(403).json({
      success: false,
      message: "Admin access required.",
    });
  }

  req.user = decoded;
  next();
}

// GET authorization for the currently logged-in user.
// Super Admin/admin token mendapat akses penuh untuk kebutuhan operasional.
app.get("/api/my-layer-authorizations", async (req, res) => {
  try {
    const decoded = getDecodedToken(req);
    if (!decoded) {
      return res
        .status(401)
        .json({ success: false, message: "Access token required." });
    }

    const privileged = isPrivilegedLayerToken(decoded);
    const userId = Number(decoded.id ?? decoded.user_id ?? decoded.userId);

    if (!privileged && (!Number.isInteger(userId) || userId <= 0)) {
      return res
        .status(403)
        .json({ success: false, message: "User ID pada token tidak valid." });
    }

    const result = await pool.query(
      `
      SELECT
        lm.id AS layer_id,
        lm.table_name,
        lm.section,
        ${privileged ? "TRUE" : "COALESCE(ula.can_view, FALSE)"} AS can_view,
        ${privileged ? "TRUE" : "COALESCE(ula.can_query, FALSE)"} AS can_query,
        ${privileged ? "TRUE" : "COALESCE(ula.can_export, FALSE)"} AS can_export,
        ${privileged ? "TRUE" : "COALESCE(ula.can_download, FALSE)"} AS can_download,
        ${privileged ? "TRUE" : "COALESCE(ula.can_manage, FALSE)"} AS can_manage
      FROM layer_metadata lm
      ${privileged ? "" : "LEFT JOIN user_layer_authorizations ula ON ula.layer_id = lm.id AND ula.user_id = $1"}
      ${privileged ? "" : "WHERE COALESCE(ula.can_view, FALSE) = TRUE"}
      ORDER BY lm.section ASC, lm.table_name ASC, lm.id ASC
    `,
      privileged ? [] : [userId],
    );

    return res.json({
      success: true,
      user_id: privileged ? null : userId,
      privileged,
      data: result.rows,
    });
  } catch (error) {
    console.error("GET /api/my-layer-authorizations ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal mengambil authorization layer user.",
      error: error.message,
    });
  }
});

// GET authorization catalog: layers + users + statistics.
app.get("/api/user-authorizations/catalog", requireLayerAuthorizationAdmin, async (req, res) => {
  try {
    await ensureUserLayerAuthorizationTable();

    const [layersResult, usersResult, statsResult] = await Promise.all([
      pool.query(`
        SELECT
          id,
          table_name,
          section,
          original_files,
          created_at,
          updated_at
        FROM layer_metadata
        ORDER BY section ASC, table_name ASC, id ASC
      `),
      pool.query(`
        SELECT
          u.id,
          u.username,
          u.email,
          u.full_name,
          u.role_id,
          COALESCE(r.name, 'Tanpa Role') AS role_name,
          u.organization_id,
          u.unit_id,
          u.status
        FROM users u
        LEFT JOIN master_role r ON r.id = u.role_id
        ORDER BY u.status ASC, u.full_name ASC, u.username ASC, u.id ASC
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_assignments,
          COUNT(*) FILTER (WHERE can_view)::int AS active_view,
          COUNT(*) FILTER (
            WHERE can_view OR can_query OR can_export OR can_download OR can_manage
          )::int AS active_permissions,
          COUNT(DISTINCT user_id)::int AS users_with_authorization,
          COUNT(DISTINCT layer_id)::int AS layers_with_authorization
        FROM user_layer_authorizations
      `),
    ]);

    return res.json({
      success: true,
      data: {
        layers: layersResult.rows,
        users: usersResult.rows,
        statistics: statsResult.rows[0] || {
          total_assignments: 0,
          active_view: 0,
          active_permissions: 0,
          users_with_authorization: 0,
          layers_with_authorization: 0,
        },
      },
    });
  } catch (error) {
    console.error("GET /api/user-authorizations/catalog ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal mengambil catalog authorization.",
      error: error.message,
    });
  }
});

// GET all authorizations for one user.
app.get("/api/user-authorizations/user/:userId", requireLayerAuthorizationAdmin, async (req, res) => {
  try {
    await ensureUserLayerAuthorizationTable();
    const userId = parsePositiveId(req.params.userId, "User ID");

    const userResult = await pool.query(
      `
      SELECT
        u.id,
        u.username,
        u.email,
        u.full_name,
        u.role_id,
        COALESCE(r.name, 'Tanpa Role') AS role_name,
        u.organization_id,
        u.unit_id,
        u.status
      FROM users u
      LEFT JOIN master_role r ON r.id = u.role_id
      WHERE u.id = $1
      LIMIT 1
    `,
      [userId],
    );

    if (!userResult.rowCount) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan.",
      });
    }

    const result = await pool.query(
      `
      SELECT
        ula.id,
        ula.user_id,
        ula.layer_id,
        lm.table_name,
        lm.section,
        ula.can_view,
        ula.can_query,
        ula.can_export,
        ula.can_download,
        ula.can_manage,
        ula.created_at,
        ula.updated_at
      FROM user_layer_authorizations ula
      INNER JOIN layer_metadata lm ON lm.id = ula.layer_id
      WHERE ula.user_id = $1
      ORDER BY lm.section ASC, lm.table_name ASC, lm.id ASC
    `,
      [userId],
    );

    return res.json({
      success: true,
      user: userResult.rows[0],
      data: result.rows,
    });
  } catch (error) {
    console.error("GET /api/user-authorizations/user/:userId ERROR:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Gagal mengambil authorization user.",
    });
  }
});

// GET one user + one layer authorization.
app.get("/api/user-authorizations/:userId/:layerId", requireLayerAuthorizationAdmin, async (req, res) => {
  try {
    await ensureUserLayerAuthorizationTable();

    const userId = parsePositiveId(req.params.userId, "User ID");
    const layerId = parsePositiveId(req.params.layerId, "Layer ID");

    const result = await pool.query(
      `
      SELECT
        ula.id,
        ula.user_id,
        ula.layer_id,
        lm.table_name,
        lm.section,
        ula.can_view,
        ula.can_query,
        ula.can_export,
        ula.can_download,
        ula.can_manage,
        ula.created_at,
        ula.updated_at
      FROM user_layer_authorizations ula
      INNER JOIN layer_metadata lm ON lm.id = ula.layer_id
      WHERE ula.user_id = $1
        AND ula.layer_id = $2
      LIMIT 1
    `,
      [userId, layerId],
    );

    return res.json({
      success: true,
      data: result.rows[0] || null,
    });
  } catch (error) {
    console.error(
      "GET /api/user-authorizations/:userId/:layerId ERROR:",
      error,
    );
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Gagal mengambil authorization.",
    });
  }
});

// POST = create or upsert one authorization.
app.post("/api/user-authorizations", requireLayerAuthorizationAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureUserLayerAuthorizationTable();

    const userId = parsePositiveId(req.body?.user_id, "User ID");
    const layerId = parsePositiveId(req.body?.layer_id, "Layer ID");
    const permissions = normalizePermissionPayload(req.body);

    const userCheck = await client.query(
      "SELECT id FROM users WHERE id = $1 LIMIT 1",
      [userId],
    );
    if (!userCheck.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan.",
      });
    }

    const layerCheck = await client.query(
      "SELECT id FROM layer_metadata WHERE id = $1 LIMIT 1",
      [layerId],
    );
    if (!layerCheck.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Layer metadata tidak ditemukan.",
      });
    }

    const result = await client.query(
      `
      INSERT INTO user_layer_authorizations
        (user_id, layer_id, can_view, can_query, can_export, can_download, can_manage)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id, layer_id)
      DO UPDATE SET
        can_view = EXCLUDED.can_view,
        can_query = EXCLUDED.can_query,
        can_export = EXCLUDED.can_export,
        can_download = EXCLUDED.can_download,
        can_manage = EXCLUDED.can_manage,
        updated_at = NOW()
      RETURNING *
    `,
      [
        userId,
        layerId,
        permissions.can_view,
        permissions.can_query,
        permissions.can_export,
        permissions.can_download,
        permissions.can_manage,
      ],
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Authorization berhasil disimpan.",
      data: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST /api/user-authorizations ERROR:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Gagal menyimpan authorization.",
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// PUT = update one authorization.
app.put("/api/user-authorizations/:userId/:layerId", requireLayerAuthorizationAdmin, async (req, res) => {
  try {
    await ensureUserLayerAuthorizationTable();

    const userId = parsePositiveId(req.params.userId, "User ID");
    const layerId = parsePositiveId(req.params.layerId, "Layer ID");
    const permissions = normalizePermissionPayload(req.body);

    const result = await pool.query(
      `
      UPDATE user_layer_authorizations
      SET
        can_view = $1,
        can_query = $2,
        can_export = $3,
        can_download = $4,
        can_manage = $5,
        updated_at = NOW()
      WHERE user_id = $6
        AND layer_id = $7
      RETURNING *
    `,
      [
        permissions.can_view,
        permissions.can_query,
        permissions.can_export,
        permissions.can_download,
        permissions.can_manage,
        userId,
        layerId,
      ],
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Authorization belum tersedia untuk user/layer tersebut.",
      });
    }

    return res.json({
      success: true,
      message: "Authorization berhasil diperbarui.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error(
      "PUT /api/user-authorizations/:userId/:layerId ERROR:",
      error,
    );
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Gagal memperbarui authorization.",
    });
  }
});

// DELETE = remove authorization assignment.
app.delete("/api/user-authorizations/:userId/:layerId", requireLayerAuthorizationAdmin, async (req, res) => {
  try {
    await ensureUserLayerAuthorizationTable();

    const userId = parsePositiveId(req.params.userId, "User ID");
    const layerId = parsePositiveId(req.params.layerId, "Layer ID");

    const result = await pool.query(
      `
      DELETE FROM user_layer_authorizations
      WHERE user_id = $1
        AND layer_id = $2
      RETURNING id
    `,
      [userId, layerId],
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Authorization tidak ditemukan.",
      });
    }

    return res.json({
      success: true,
      message: "Authorization berhasil dicabut.",
      id: result.rows[0].id,
    });
  } catch (error) {
    console.error(
      "DELETE /api/user-authorizations/:userId/:layerId ERROR:",
      error,
    );
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Gagal mencabut authorization.",
    });
  }
});

// Bulk save = one transaction for the whole visible matrix.
app.put("/api/user-authorizations/user/:userId/bulk", requireLayerAuthorizationAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureUserLayerAuthorizationTable();

    const userId = parsePositiveId(req.params.userId, "User ID");
    const assignments = Array.isArray(req.body?.assignments)
      ? req.body.assignments
      : [];

    const userCheck = await client.query(
      "SELECT id FROM users WHERE id = $1 LIMIT 1",
      [userId],
    );

    if (!userCheck.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan.",
      });
    }

    const normalized = [];
    const seen = new Set();

    for (const item of assignments) {
      const layerId = parsePositiveId(item?.layer_id, "Layer ID");
      const key = `${userId}:${layerId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      normalized.push({
        layer_id: layerId,
        ...normalizePermissionPayload(item),
      });
    }

    for (const item of normalized) {
      const layerCheck = await client.query(
        "SELECT id FROM layer_metadata WHERE id = $1 LIMIT 1",
        [item.layer_id],
      );

      if (!layerCheck.rowCount) {
        throw Object.assign(
          new Error(`Layer ID ${item.layer_id} tidak ditemukan.`),
          { statusCode: 400 },
        );
      }

      await client.query(
        `
        INSERT INTO user_layer_authorizations
          (user_id, layer_id, can_view, can_query, can_export, can_download, can_manage)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (user_id, layer_id)
        DO UPDATE SET
          can_view = EXCLUDED.can_view,
          can_query = EXCLUDED.can_query,
          can_export = EXCLUDED.can_export,
          can_download = EXCLUDED.can_download,
          can_manage = EXCLUDED.can_manage,
          updated_at = NOW()
      `,
        [
          userId,
          item.layer_id,
          item.can_view,
          item.can_query,
          item.can_export,
          item.can_download,
          item.can_manage,
        ],
      );
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: `Authorization ${normalized.length} layer berhasil disimpan.`,
      data: normalized,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(
      "PUT /api/user-authorizations/user/:userId/bulk ERROR:",
      error,
    );
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Gagal menyimpan bulk authorization.",
    });
  } finally {
    client.release();
  }
});

// Permission helper for future protected data endpoints.
// Usage: app.get("/api/...", requireLayerPermission("can_view"), handler)
function requireLayerPermission(permission = "can_view") {
  const allowed = new Set([
    "can_view",
    "can_query",
    "can_export",
    "can_download",
    "can_manage",
  ]);

  return async (req, res, next) => {
    try {
      if (!allowed.has(permission)) {
        return res.status(500).json({
          success: false,
          message: "Permission authorization tidak valid.",
        });
      }

      const tokenUserId = req.user?.id ?? req.user?.user_id ?? req.user?.userId;

      const layerId = Number(
        req.params?.layerId ??
          req.params?.id ??
          req.query?.layerId ??
          req.body?.layer_id,
      );

      if (!tokenUserId || !Number.isInteger(layerId) || layerId <= 0) {
        return res.status(400).json({
          success: false,
          message: "User login dan layer ID wajib tersedia.",
        });
      }

      const result = await pool.query(
        `
        SELECT ${permission} AS allowed
        FROM user_layer_authorizations
        WHERE user_id = $1
          AND layer_id = $2
        LIMIT 1
      `,
        [tokenUserId, layerId],
      );

      if (!result.rowCount || result.rows[0].allowed !== true) {
        return res.status(403).json({
          success: false,
          message: `Akses ${permission} untuk layer ini ditolak.`,
        });
      }

      next();
    } catch (error) {
      console.error("requireLayerPermission ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Gagal memvalidasi permission layer.",
      });
    }
  };
}

// ============================================================
// END USER LAYER AUTHORIZATION
// ============================================================

// ============================================================
// INFORMATION CENTER - DATA REQUEST & FEEDBACK
// ============================================================
// SMTP .env:
// SMTP_HOST=smtp.gmail.com
// SMTP_PORT=587
// SMTP_SECURE=false
// SMTP_USER=your-email@example.com
// SMTP_PASS=your-app-password
// SMTP_FROM="SIMITI <your-email@example.com>"
// ADMIN_EMAIL=admin@example.com
//
// Optional:
// INFO_CENTER_MAX_FILE_SIZE_MB=10
// DATA_REQUEST_UPLOAD_DIR=uploads/data-requests
// ============================================================

const infoCenterUploadDir = path.resolve(
  __dirname,
  process.env.DATA_REQUEST_UPLOAD_DIR || "uploads/data-requests",
);

if (!fs.existsSync(infoCenterUploadDir)) {
  fs.mkdirSync(infoCenterUploadDir, { recursive: true });
}

const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure =
  String(process.env.SMTP_SECURE || "").toLowerCase() === "true" ||
  smtpPort === 465;

const smtpConfigured =
  Boolean(process.env.SMTP_HOST) &&
  Boolean(process.env.SMTP_USER) &&
  Boolean(process.env.SMTP_PASS) &&
  Boolean(process.env.ADMIN_EMAIL);

const infoCenterTransporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

const infoCenterMaxFileSize =
  Math.max(1, Number(process.env.INFO_CENTER_MAX_FILE_SIZE_MB || 10)) *
  1024 *
  1024;

const infoCenterAllowedMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const infoCenterAllowedExtensions = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".csv",
  ".zip",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
]);

const infoCenterStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, infoCenterUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeBase =
      path
        .basename(file.originalname || "attachment", ext)
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 80) || "attachment";

    cb(
      null,
      `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${safeBase}${ext}`,
    );
  },
});

const infoCenterUpload = multer({
  storage: infoCenterStorage,
  limits: {
    fileSize: infoCenterMaxFileSize,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const mimeAllowed = infoCenterAllowedMimeTypes.has(
      String(file.mimetype || "").toLowerCase(),
    );
    const extAllowed = infoCenterAllowedExtensions.has(ext);

    if (mimeAllowed && extAllowed) {
      return cb(null, true);
    }

    return cb(
      new Error(
        "Tipe lampiran tidak diizinkan. Gunakan PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, CSV/TXT, ZIP, JPG/JPEG/PNG/WEBP.",
      ),
    );
  },
});

function sanitizeInfoCenterText(value, maxLength = 5000) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/\u0000/g, "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLength);
}

function sanitizeInfoCenterEmail(value) {
  const email = sanitizeInfoCenterText(value, 254).toLowerCase();
  if (!email) return "";
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
  return valid ? email : "";
}

function firstInfoCenterValue(body, keys, maxLength = 5000) {
  for (const key of keys) {
    const value = body?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return sanitizeInfoCenterText(value, maxLength);
    }
  }
  return "";
}

function getInfoCenterClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();

  return sanitizeInfoCenterText(
    forwarded || req.ip || req.socket?.remoteAddress || "",
    100,
  );
}

function removeInfoCenterUploadedFile(file) {
  if (!file?.path) return;
  try {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  } catch (cleanupError) {
    console.error("Information Center file cleanup error:", cleanupError);
  }
}

async function ensureInformationCenterTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.data_requests (
      id BIGSERIAL PRIMARY KEY,
      request_code VARCHAR(40) UNIQUE NOT NULL,
      name VARCHAR(200) NOT NULL,
      institution VARCHAR(250),
      email VARCHAR(254) NOT NULL,
      phone VARCHAR(50),
      data_requested TEXT NOT NULL,
      purpose TEXT,
      description TEXT,
      attachment_original_name VARCHAR(500),
      attachment_filename VARCHAR(500),
      attachment_path TEXT,
      attachment_mimetype VARCHAR(200),
      attachment_size BIGINT,
      status VARCHAR(30) NOT NULL DEFAULT 'submitted',
      ip_address VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_data_requests_email
      ON public.data_requests(email)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_data_requests_status
      ON public.data_requests(status)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.feedback (
      id BIGSERIAL PRIMARY KEY,
      feedback_code VARCHAR(40) UNIQUE NOT NULL,
      name VARCHAR(200),
      email VARCHAR(254),
      category VARCHAR(100),
      rating INTEGER,
      message TEXT NOT NULL,
      ip_address VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_feedback_created_at
      ON public.feedback(created_at DESC)
  `);
}

ensureInformationCenterTables().catch((error) => {
  console.error("âŒ Information Center table init:", error);
});

async function sendInfoCenterEmail({ subject, text, html, attachments = [] }) {
  if (!infoCenterTransporter) {
    throw Object.assign(
      new Error(
        "SMTP belum dikonfigurasi. Isi SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, dan ADMIN_EMAIL di backend .env.",
      ),
      { code: "SMTP_NOT_CONFIGURED" },
    );
  }

  return infoCenterTransporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.ADMIN_EMAIL,
    replyTo: undefined,
    subject,
    text,
    html,
    attachments,
  });
}

function buildInfoCenterAttachment(file) {
  if (!file?.path) return [];
  return [
    {
      filename: file.originalname,
      path: file.path,
      contentType: file.mimetype,
    },
  ];
}

app.get("/api/information-center/health", async (_req, res) => {
  let database = false;

  try {
    await pool.query("SELECT 1");
    database = true;
  } catch (error) {
    console.error("Information Center DB health error:", error);
  }

  return res.json({
    success: true,
    database,
    smtpConfigured,
    uploadDirectory: infoCenterUploadDir,
    maxFileSizeMB: infoCenterMaxFileSize / (1024 * 1024),
  });
});

app.post(
  "/api/data-request",
  infoCenterUpload.single("attachment"),
  async (req, res) => {
    const file = req.file;

    try {
      const name = firstInfoCenterValue(
        req.body,
        ["name", "nama", "fullName", "nama_lengkap"],
        200,
      );
      const institution = firstInfoCenterValue(
        req.body,
        ["institution", "instansi", "organization", "organisasi"],
        250,
      );
      const email = sanitizeInfoCenterEmail(
        firstInfoCenterValue(req.body, ["email", "emailAddress"]),
      );
      const phone = firstInfoCenterValue(
        req.body,
        ["phone", "telepon", "no_hp", "phoneNumber"],
        50,
      );
      const dataRequested = firstInfoCenterValue(
        req.body,
        ["dataRequested", "data_requested", "data", "requestedData"],
        10000,
      );
      const purpose = firstInfoCenterValue(
        req.body,
        ["purpose", "tujuan", "keperluan"],
        5000,
      );
      const description = firstInfoCenterValue(
        req.body,
        ["description", "deskripsi", "detail", "message"],
        10000,
      );

      if (!name || !email || !dataRequested) {
        removeInfoCenterUploadedFile(file);
        return res.status(400).json({
          success: false,
          message: "Nama, email, dan data yang dimohon wajib diisi.",
          fields: {
            name: !name ? "required" : null,
            email: !email ? "valid email required" : null,
            dataRequested: !dataRequested ? "required" : null,
          },
        });
      }

      const requestCode = `DR-${new Date()
        .toISOString()
        .replace(/\D/g, "")
        .slice(0, 14)}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

      const insert = await pool.query(
        `
        INSERT INTO public.data_requests
          (
            request_code,
            name,
            institution,
            email,
            phone,
            data_requested,
            purpose,
            description,
            attachment_original_name,
            attachment_filename,
            attachment_path,
            attachment_mimetype,
            attachment_size,
            ip_address
          )
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING
          id,
          request_code,
          status,
          created_at
        `,
        [
          requestCode,
          name,
          institution || null,
          email,
          phone || null,
          dataRequested,
          purpose || null,
          description || null,
          file?.originalname || null,
          file?.filename || null,
          file?.path
            ? path.relative(__dirname, file.path).replace(/\\/g, "/")
            : null,
          file?.mimetype || null,
          file?.size || null,
          getInfoCenterClientIp(req),
        ],
      );

      const row = insert.rows[0];

      const emailText = [
        "PERMOHONAN DATA SIMITI",
        "",
        `Kode Permohonan : ${row.request_code}`,
        `Nama            : ${name}`,
        `Instansi        : ${institution || "-"}`,
        `Email           : ${email}`,
        `Telepon         : ${phone || "-"}`,
        "",
        "Data yang dimohon:",
        dataRequested,
        "",
        "Tujuan:",
        purpose || "-",
        "",
        "Keterangan:",
        description || "-",
        "",
        `Lampiran        : ${file?.originalname || "Tidak ada"}`,
      ].join("\n");

      let emailSent = false;
      let emailError = null;

      try {
        await sendInfoCenterEmail({
          subject: `[SIMITI] Permohonan Data ${row.request_code}`,
          text: emailText,
          html: `
            <h2>Permohonan Data SIMITI</h2>
            <table cellpadding="6" cellspacing="0" border="0">
              <tr><td><strong>Kode</strong></td><td>${row.request_code}</td></tr>
              <tr><td><strong>Nama</strong></td><td>${name}</td></tr>
              <tr><td><strong>Instansi</strong></td><td>${institution || "-"}</td></tr>
              <tr><td><strong>Email</strong></td><td>${email}</td></tr>
              <tr><td><strong>Telepon</strong></td><td>${phone || "-"}</td></tr>
            </table>
            <h3>Data yang dimohon</h3>
            <p>${dataRequested.replace(/\n/g, "<br>")}</p>
            <h3>Tujuan</h3>
            <p>${(purpose || "-").replace(/\n/g, "<br>")}</p>
            <h3>Keterangan</h3>
            <p>${(description || "-").replace(/\n/g, "<br>")}</p>
            <p><strong>Lampiran:</strong> ${file?.originalname || "Tidak ada"}</p>
          `,
          attachments: buildInfoCenterAttachment(file),
        });
        emailSent = true;
      } catch (mailError) {
        emailError = mailError;
        console.error(
          "POST /api/data-request SMTP ERROR:",
          mailError?.message || mailError,
        );
      }

      return res.status(201).json({
        success: true,
        message: emailSent
          ? "Permohonan data berhasil dikirim."
          : "Permohonan data berhasil disimpan, tetapi notifikasi email belum terkirim.",
        data: {
          id: row.id,
          requestCode: row.request_code,
          status: row.status,
          createdAt: row.created_at,
          emailSent,
        },
        ...(emailError && process.env.NODE_ENV !== "production"
          ? { emailError: emailError.message }
          : {}),
      });
    } catch (error) {
      removeInfoCenterUploadedFile(file);
      console.error("POST /api/data-request ERROR:", error);

      const status =
        error?.code === "LIMIT_FILE_SIZE"
          ? 400
          : error?.code === "LIMIT_UNEXPECTED_FILE"
            ? 400
            : 500;

      return res.status(status).json({
        success: false,
        message:
          error?.code === "LIMIT_FILE_SIZE"
            ? `Lampiran terlalu besar. Maksimal ${Math.round(
                infoCenterMaxFileSize / (1024 * 1024),
              )} MB.`
            : error?.message ||
              "Terjadi kesalahan saat memproses permohonan data.",
      });
    }
  },
);

app.post("/api/feedback", async (req, res) => {
  try {
    const name = firstInfoCenterValue(
      req.body,
      ["name", "nama", "fullName", "nama_lengkap"],
      200,
    );
    const emailRaw = firstInfoCenterValue(
      req.body,
      ["email", "emailAddress"],
      254,
    );
    const email = emailRaw ? sanitizeInfoCenterEmail(emailRaw) : "";
    const category = firstInfoCenterValue(
      req.body,
      ["category", "kategori", "type", "jenis"],
      100,
    );
    const message = firstInfoCenterValue(
      req.body,
      ["message", "pesan", "feedback", "saran", "kritik"],
      10000,
    );

    const ratingRaw = firstInfoCenterValue(
      req.body,
      ["rating", "nilai", "score"],
      20,
    );
    const ratingNumber = ratingRaw === "" ? null : Number(ratingRaw);
    const rating =
      Number.isInteger(ratingNumber) && ratingNumber >= 1 && ratingNumber <= 5
        ? ratingNumber
        : null;

    if (emailRaw && !email) {
      return res.status(400).json({
        success: false,
        message: "Format email tidak valid.",
      });
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Saran atau kritik wajib diisi.",
      });
    }

    const feedbackCode = `FB-${new Date()
      .toISOString()
      .replace(/\D/g, "")
      .slice(0, 14)}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    const insert = await pool.query(
      `
      INSERT INTO public.feedback
        (
          feedback_code,
          name,
          email,
          category,
          rating,
          message,
          ip_address
        )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, feedback_code, created_at
      `,
      [
        feedbackCode,
        name || null,
        email || null,
        category || null,
        rating,
        message,
        getInfoCenterClientIp(req),
      ],
    );

    const row = insert.rows[0];

    const emailText = [
      "SARAN & KRITIK SIMITI",
      "",
      `Kode       : ${row.feedback_code}`,
      `Nama       : ${name || "-"}`,
      `Email      : ${email || "-"}`,
      `Kategori   : ${category || "-"}`,
      `Rating     : ${rating ?? "-"}`,
      "",
      "Pesan:",
      message,
    ].join("\n");

    let emailSent = false;
    let emailError = null;

    try {
      await sendInfoCenterEmail({
        subject: `[SIMITI] Saran & Kritik ${row.feedback_code}`,
        text: emailText,
        html: `
          <h2>Saran &amp; Kritik SIMITI</h2>
          <p><strong>Kode:</strong> ${row.feedback_code}</p>
          <p><strong>Nama:</strong> ${name || "-"}</p>
          <p><strong>Email:</strong> ${email || "-"}</p>
          <p><strong>Kategori:</strong> ${category || "-"}</p>
          <p><strong>Rating:</strong> ${rating ?? "-"}</p>
          <h3>Pesan</h3>
          <p>${message.replace(/\n/g, "<br>")}</p>
        `,
      });
      emailSent = true;
    } catch (mailError) {
      emailError = mailError;
      console.error(
        "POST /api/feedback SMTP ERROR:",
        mailError?.message || mailError,
      );
    }

    return res.status(201).json({
      success: true,
      message: emailSent
        ? "Saran & kritik berhasil dikirim."
        : "Saran & kritik berhasil disimpan, tetapi notifikasi email belum terkirim.",
      data: {
        id: row.id,
        feedbackCode: row.feedback_code,
        createdAt: row.created_at,
        emailSent,
      },
      ...(emailError && process.env.NODE_ENV !== "production"
        ? { emailError: emailError.message }
        : {}),
    });
  } catch (error) {
    console.error("POST /api/feedback ERROR:", error);

    return res.status(500).json({
      success: false,
      message:
        error?.message || "Terjadi kesalahan saat mengirim saran & kritik.",
    });
  }
});

// ============================================================
// SIMITI ENTERPRISE - /api/lokasi COMPATIBILITY ROUTES
// Additive compatibility layer for Lokasi.tsx.
// Tidak mengubah /api/lokasi-kegiatan atau endpoint existing.
// ============================================================

async function ensureLokasiApiTable() {
  await ensureLokasiKegiatanTable();
}

function lokasiApiWhere(req) {
  const {
    search = "",
    activity_type = "",
    status = "",
    year = "",
    province = "",
    das = "",
  } = req.query || {};

  const params = [];
  const where = [];

  const add = (value, sql) => {
    params.push(value);
    where.push(sql.replace(/\$PARAM/g, `$${params.length}`));
  };

  if (String(search).trim()) {
    const q = `%${String(search).trim()}%`;
    params.push(q);
    const n = params.length;
    where.push(
      `(nama_kegiatan ILIKE $${n}
        OR jenis_kegiatan ILIKE $${n}
        OR instansi_pelaksana ILIKE $${n}
        OR provinsi ILIKE $${n}
        OR kabupaten_kota ILIKE $${n}
        OR kecamatan ILIKE $${n}
        OR desa_kelurahan ILIKE $${n}
        OR kode ILIKE $${n})`,
    );
  }

  if (String(activity_type).trim()) {
    add(String(activity_type).trim(), `jenis_kegiatan=$PARAM`);
  }

  if (String(status).trim()) {
    add(String(status).trim(), `status=$PARAM`);
  }

  if (String(year).trim() && Number.isFinite(Number(year))) {
    add(Number(year), `tahun_pelaksanaan=$PARAM`);
  }

  if (String(province).trim()) {
    add(String(province).trim(), `provinsi=$PARAM`);
  }

  // lokasi_kegiatan saat ini tidak memiliki kolom DAS.
  // Jika das dikirim, gunakan keterangan sebagai fallback agar
  // endpoint tetap kompatibel tanpa mengubah schema existing.
  if (String(das).trim()) {
    add(`%${String(das).trim()}%`, `das ILIKE $PARAM`);
  }

  return {
    params,
    clause: where.length ? `WHERE ${where.join(" AND ")}` : "",
  };
}

const LOKASI_SORT_COLUMNS = {
  updatedAt: "updated_at",
  name: "nama_kegiatan",
  year: "tahun_pelaksanaan",
  area: "luas_area",
};

function lokasiApiOrder(req) {
  const sortBy = String(req.query?.sort_by || "updatedAt");
  const sortDirection =
    String(req.query?.sort_direction || "desc").toLowerCase() === "asc"
      ? "ASC"
      : "DESC";

  const column = LOKASI_SORT_COLUMNS[sortBy] || LOKASI_SORT_COLUMNS.updatedAt;
  return `ORDER BY ${column} ${sortDirection} NULLS LAST, id DESC`;
}

app.get("/api/lokasi/statistics", async (req, res) => {
  try {
    await ensureLokasiApiTable();

    const { params, clause } = lokasiApiWhere(req);

    const result = await pool.query(
      `
      SELECT
        COUNT(*)::int AS "totalLocations",
        COALESCE(SUM(luas_area), 0)::double precision AS "totalArea",
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(status, '')) IN ('berjalan', 'aktif', 'proses', 'sedang berjalan')
        )::int AS "activeLocations",
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(status, '')) IN ('selesai', 'completed', 'terverifikasi', 'verified')
        )::int AS "completedLocations",
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(status, '')) LIKE '%verifikasi%'
             OR LOWER(COALESCE(status, '')) LIKE '%menunggu%'
        )::int AS "pendingVerification",
        0::int AS "documentedLocations"
      FROM lokasi_kegiatan
      ${clause}
      `,
      params,
    );

    res.json({
      success: true,
      data: result.rows[0] || {
        totalLocations: 0,
        totalArea: 0,
        activeLocations: 0,
        completedLocations: 0,
        pendingVerification: 0,
        documentedLocations: 0,
      },
    });
  } catch (error) {
    console.error("GET /api/lokasi/statistics ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil statistik lokasi.",
      error: error?.message || String(error),
    });
  }
});

app.get("/api/lokasi/filters", async (req, res) => {
  try {
    await ensureLokasiApiTable();

    const [activityTypes, provinces, dasRows] = await Promise.all([
      pool.query(`
        SELECT DISTINCT jenis_kegiatan AS value
        FROM lokasi_kegiatan
        WHERE jenis_kegiatan IS NOT NULL
          AND BTRIM(jenis_kegiatan) <> ''
        ORDER BY value
      `),
      pool.query(`
        SELECT DISTINCT provinsi AS value
        FROM lokasi_kegiatan
        WHERE provinsi IS NOT NULL
          AND BTRIM(provinsi) <> ''
        ORDER BY value
      `),
      pool.query(`
        SELECT DISTINCT das AS value
        FROM lokasi_kegiatan
        WHERE das IS NOT NULL
          AND BTRIM(das) <> ''
        ORDER BY value
      `),
    ]);

    res.json({
      success: true,
      activityTypes: activityTypes.rows.map((r) => r.value),
      provinces: provinces.rows.map((r) => r.value),
      das: dasRows.rows.map((r) => r.value),
    });
  } catch (error) {
    console.error("GET /api/lokasi/filters ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil filter lokasi.",
      activityTypes: [],
      provinces: [],
      das: [],
    });
  }
});

app.get("/api/lokasi/export", async (req, res) => {
  try {
    await ensureLokasiApiTable();

    const { params, clause } = lokasiApiWhere(req);

    const ids = Array.isArray(req.query?.["ids[]"])
      ? req.query["ids[]"]
      : req.query?.["ids[]"]
        ? [req.query["ids[]"]]
        : [];

    let finalClause = clause;
    const finalParams = [...params];

    if (ids.length) {
      const validIds = ids
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0);

      if (validIds.length) {
        const placeholders = validIds.map((id) => {
          finalParams.push(id);
          return `$${finalParams.length}`;
        });
        finalClause += `${finalClause ? " AND " : "WHERE "}id IN (${placeholders.join(",")})`;
      }
    }

    const result = await pool.query(
      `
      SELECT
        id,
        kode,
        nama_kegiatan AS "Nama Kegiatan",
        jenis_kegiatan AS "Jenis Kegiatan",
        tahun_pelaksanaan AS "Tahun",
        sumber_pendanaan AS "Sumber Pendanaan",
        instansi_pelaksana AS "Instansi Pelaksana",
        provinsi AS "Provinsi",
        kabupaten_kota AS "Kabupaten/Kota",
        kecamatan AS "Kecamatan",
        desa_kelurahan AS "Desa/Kelurahan",
        luas_area AS "Luas Area (ha)",
        status AS "Status",
        keterangan AS "Keterangan",
        latitude AS "Latitude",
        longitude AS "Longitude",
        created_at AS "Created At",
        das AS "DAS",
        updated_at AS "Updated At"
      FROM lokasi_kegiatan
      ${finalClause}
      ${lokasiApiOrder(req)}
      `,
      finalParams,
    );

    const worksheet = XLSX.utils.json_to_sheet(result.rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Lokasi");

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    const filename = `SIMITI_Lokasi_${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error("GET /api/lokasi/export ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Gagal melakukan export data lokasi.",
      error: error?.message || String(error),
    });
  }
});

app.get("/api/lokasi", async (req, res) => {
  try {
    await ensureLokasiApiTable();

    const pageRaw = Number(req.query?.page || 1);
    const limitRaw = Number(req.query?.limit || 10);

    const page =
      Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(Math.floor(limitRaw), 500)
        : 10;

    const offset = (page - 1) * limit;
    const { params, clause } = lokasiApiWhere(req);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM lokasi_kegiatan ${clause}`,
      params,
    );

    const dataParams = [...params, limit, offset];

    const result = await pool.query(
      `
      SELECT
        id,
        kode,
        nama_kegiatan,
        jenis_kegiatan,
        tahun_pelaksanaan,
        sumber_pendanaan,
        instansi_pelaksana,
        provinsi,
        kabupaten_kota,
        kecamatan,
        desa_kelurahan,
        luas_area,
        status,
        keterangan,
        longitude,
        latitude,
        created_at,
        das,
        updated_at
      FROM lokasi_kegiatan
      ${clause}
      ${lokasiApiOrder(req)}
      LIMIT $${dataParams.length - 1}
      OFFSET $${dataParams.length}
      `,
      dataParams,
    );

    // Bentuk response sengaja mengikuti kontrak Lokasi.tsx:
    // result.data + result.total.
    res.json({
      success: true,
      data: result.rows,
      total: Number(countResult.rows[0]?.total || 0),
      page,
      limit,
    });
  } catch (error) {
    console.error("GET /api/lokasi ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data lokasi.",
      error: error?.message || String(error),
      data: [],
      total: 0,
    });
  }
});

// ============================================================
// SIMITI - MASTER ADMINISTRASI HIERARCHY
// Provinsi -> Kabupaten/Kota -> Kecamatan -> Desa/Kelurahan
// Menggunakan tabel existing public.provinsi, public.kab_kota,
// public.kecamatan, public.kel_desa.
// ============================================================

app.get("/api/master/provinsi", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT kode_prov, provinsi
      FROM public.provinsi
      WHERE NULLIF(BTRIM(kode_prov::text), '') IS NOT NULL
        AND NULLIF(BTRIM(provinsi::text), '') IS NOT NULL
      ORDER BY provinsi
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("GET /api/master/provinsi:", error);
    res
      .status(500)
      .json({ success: false, message: "Gagal mengambil master provinsi." });
  }
});

app.get("/api/master/kab-kota", async (req, res) => {
  try {
    const kodeProv = String(req.query.kode_prov || "").trim();
    if (!kodeProv)
      return res
        .status(400)
        .json({ success: false, message: "kode_prov wajib diisi." });
    const result = await pool.query(
      `
      SELECT kode_kk, kode_prov, kab_kota, provinsi
      FROM public.kab_kota
      WHERE kode_prov::text = $1
        AND NULLIF(BTRIM(kode_kk::text), '') IS NOT NULL
        AND NULLIF(BTRIM(kab_kota::text), '') IS NOT NULL
      ORDER BY kab_kota
    `,
      [kodeProv],
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("GET /api/master/kab-kota:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil master kabupaten/kota.",
    });
  }
});

app.get("/api/master/kecamatan", async (req, res) => {
  try {
    const kodeKk = String(req.query.kode_kk || "").trim();
    if (!kodeKk)
      return res
        .status(400)
        .json({ success: false, message: "kode_kk wajib diisi." });
    const result = await pool.query(
      `
      SELECT kode_kec, kode_kk, kecamatan, kab_kota, provinsi
      FROM public.kecamatan
      WHERE kode_kk::text = $1
        AND NULLIF(BTRIM(kode_kec::text), '') IS NOT NULL
        AND NULLIF(BTRIM(kecamatan::text), '') IS NOT NULL
      ORDER BY kecamatan
    `,
      [kodeKk],
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("GET /api/master/kecamatan:", error);
    res
      .status(500)
      .json({ success: false, message: "Gagal mengambil master kecamatan." });
  }
});

app.get("/api/master/kel-desa", async (req, res) => {
  try {
    const kodeKec = String(req.query.kode_kec || "").trim();
    if (!kodeKec)
      return res
        .status(400)
        .json({ success: false, message: "kode_kec wajib diisi." });
    const result = await pool.query(
      `
      SELECT kode_kd, kode_kec, kode_kk, kode_prov, kel_desa, kecamatan, kab_kota, provinsi
      FROM public.kel_desa
      WHERE kode_kec::text = $1
        AND NULLIF(BTRIM(kode_kd::text), '') IS NOT NULL
        AND NULLIF(BTRIM(kel_desa::text), '') IS NOT NULL
      ORDER BY kel_desa
    `,
      [kodeKec],
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("GET /api/master/kel-desa:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil master desa/kelurahan.",
    });
  }
});

// Satu endpoint alternatif untuk client yang ingin memuat semua master sekaligus.
app.get("/api/master/administrasi", async (req, res) => {
  try {
    const [provinsi, kabKota, kecamatan, kelDesa] = await Promise.all([
      pool.query(
        `SELECT kode_prov, provinsi FROM public.provinsi ORDER BY provinsi`,
      ),
      pool.query(
        `SELECT kode_kk, kode_prov, kab_kota, provinsi FROM public.kab_kota ORDER BY kab_kota`,
      ),
      pool.query(
        `SELECT kode_kec, kode_kk, kecamatan, kab_kota, provinsi FROM public.kecamatan ORDER BY kecamatan`,
      ),
      pool.query(
        `SELECT kode_kd, kode_kec, kode_kk, kode_prov, kel_desa, kecamatan, kab_kota, provinsi FROM public.kel_desa ORDER BY kel_desa`,
      ),
    ]);
    res.json({
      success: true,
      data: {
        provinsi: provinsi.rows,
        kabKota: kabKota.rows,
        kecamatan: kecamatan.rows,
        kelDesa: kelDesa.rows,
      },
    });
  } catch (error) {
    console.error("GET /api/master/administrasi:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil master administrasi.",
    });
  }
});

// ============================================================
// ENDPOINT DAS - opsional; dipertahankan terpisah agar tidak
// mengganggu tabel administrasi yang sudah ada.
// ============================================================
app.get("/api/master/das", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

    // Jangan pernah mengirim 225 ribu record DAS ke browser.
    // Endpoint ini wajib memakai pencarian server-side + LIMIT.
    if (search.length < 2) {
      return res.json({ success: true, data: [], total: 0 });
    }

    const like = `%${search}%`;
    const result = await pool.query(
      `SELECT DISTINCT ON (COALESCE(NULLIF(BTRIM(kode_das::text), ''), '__NO_CODE__:' || BTRIM(nama_das::text)))
          kode_das::text AS kode_das,
          BTRIM(nama_das::text) AS nama_das,
          BTRIM(wadmpr::text) AS provinsi,
          BTRIM(wadmkk::text) AS kabupaten_kota,
          BTRIM(wadmkc::text) AS kecamatan,
          BTRIM(wadmkd::text) AS desa_kelurahan
       FROM public.das_adm
       WHERE (nama_das::text ILIKE $1 OR kode_das::text ILIKE $1)
         AND NULLIF(BTRIM(nama_das::text), '') IS NOT NULL
       ORDER BY COALESCE(NULLIF(BTRIM(kode_das::text), ''), '__NO_CODE__:' || BTRIM(nama_das::text)),
                BTRIM(nama_das::text)
       LIMIT $2`,
      [like, limit],
    );

    res.json({ success: true, data: result.rows, total: result.rowCount });
  } catch (error) {
    console.error("GET /api/master/das:", error);
    res
      .status(500)
      .json({ success: false, message: "Gagal mencari master DAS." });
  }
});

// ==================== SIPEAT / TMA INTEGRATION ====================
// SIPEAT API key tetap di backend. Frontend TIDAK pernah menerima key.
// Endpoint lama /api/sipeat dipertahankan.
// Endpoint /api/tma dipertahankan untuk data realtime.
// Tambahan:
//   GET /api/tma/history?range=7d&sensor_id=...
//   GET /api/tma/history?range=30d&sensor_id=...
//
// Catatan: histori yang disimpan backend mulai tersedia sejak fitur ini aktif.
// Backend tidak mengarang data historis yang belum pernah diterima dari SIPEAT.

const SIPEAT_API_URL =
  process.env.SIPEAT_API_URL || "https://sipeat-2026.web.app/api";
const SIPEAT_API_KEY = process.env.SIPEAT_API_KEY || "";

const SIPEAT_TIMEOUT_MS = Number(process.env.SIPEAT_TIMEOUT_MS || 15000);
const TMA_HISTORY_ENABLED =
  String(process.env.TMA_HISTORY_ENABLED || "true").toLowerCase() !== "false";
const TMA_HISTORY_RETENTION_DAYS = Math.max(
  7,
  Number(process.env.TMA_HISTORY_RETENTION_DAYS || 180),
);

let tmaHistoryTableReady = false;

function normalizeMetricValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const text = String(value).trim().replace(",", ".");
  if (!text) return null;

  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function pickFirst(obj, aliases) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

  const normalized = new Map(
    Object.entries(obj).map(([key, value]) => [
      key.toLowerCase().replace(/[\s_\-./()]+/g, ""),
      value,
    ]),
  );

  for (const alias of aliases) {
    const value = normalized.get(
      alias.toLowerCase().replace(/[\s_\-./()]+/g, ""),
    );
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function findFirstObjectValue(root, aliases) {
  const wanted = new Set(
    aliases.map((x) => x.toLowerCase().replace(/[\s_\-./()]+/g, "")),
  );

  const visited = new Set();

  function walk(value) {
    if (!value || typeof value !== "object") return null;
    if (visited.has(value)) return null;
    visited.add(value);

    if (!Array.isArray(value)) {
      for (const [key, item] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase().replace(/[\s_\-./()]+/g, "");
        if (wanted.has(normalizedKey) && item !== null && item !== "") {
          return item;
        }
      }
    }

    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      const found = walk(child);
      if (found !== null && found !== undefined) return found;
    }

    return null;
  }

  return walk(root);
}

function findCandidateSensorRecords(payload) {
  const records = [];
  const visited = new Set();

  function walk(value, parentKey = "") {
    if (!value || typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) walk(item, parentKey);
      return;
    }

    const keys = Object.keys(value);
    const hasSensorLikeField = keys.some((key) =>
      [
        "id",
        "sensorid",
        "sensor_id",
        "deviceid",
        "device_id",
        "stationid",
        "station_id",
        "tma",
        "tinggimukaair",
        "waterlevel",
        "water_level",
        "suhu",
        "temperature",
        "kelembaban",
        "humidity",
        "ph",
        "ec",
        "battery",
        "curahhujan",
        "curah_hujan",
        "rainfall",
      ].includes(key.toLowerCase().replace(/[\s_\-./()]+/g, "")),
    );

    if (hasSensorLikeField) records.push(value);

    for (const [key, child] of Object.entries(value)) {
      if (child && typeof child === "object") walk(child, key);
    }
  }

  walk(payload);

  // Jika payload sendiri adalah satu record sensor.
  if (records.length === 0 && payload && typeof payload === "object") {
    records.push(payload);
  }

  // Hindari menyimpan object yang sama berkali-kali.
  return [...new Set(records)];
}

function normalizeSipeatRecord(record, fallbackPayload) {
  const source = record || fallbackPayload || {};

  const sensorId =
    pickFirst(source, [
      "sensor_id",
      "sensorId",
      "sensorid",
      "device_id",
      "deviceId",
      "deviceid",
      "station_id",
      "stationId",
      "stationid",
      "id",
      "kode_sensor",
      "kodeSensor",
    ]) ||
    findFirstObjectValue(source, [
      "sensor_id",
      "sensorId",
      "sensorid",
      "device_id",
      "deviceId",
      "deviceid",
      "station_id",
      "stationId",
      "stationid",
    ]) ||
    "unknown";

  const observedAt =
    pickFirst(source, [
      "timestamp",
      "datetime",
      "date_time",
      "dateTime",
      "time",
      "waktu",
      "observed_at",
      "observedAt",
      "created_at",
      "createdAt",
      "acquisition_time",
    ]) || null;

  return {
    sensor_id: String(sensorId),
    observed_at: observedAt ? new Date(observedAt).toISOString() : null,
    tma: normalizeMetricValue(
      pickFirst(source, [
        "tma",
        "tinggi_muka_air",
        "tinggiMukaAir",
        "tinggimukaair",
        "water_level",
        "waterLevel",
        "level",
      ]),
    ),
    suhu: normalizeMetricValue(
      pickFirst(source, ["suhu", "temperature", "temp"]),
    ),
    kelembaban: normalizeMetricValue(
      pickFirst(source, ["kelembaban", "humidity", "rh"]),
    ),
    ph: normalizeMetricValue(pickFirst(source, ["ph", "pH"])),
    ec: normalizeMetricValue(
      pickFirst(source, ["ec", "electrical_conductivity", "conductivity"]),
    ),
    battery: normalizeMetricValue(
      pickFirst(source, [
        "battery",
        "battery_level",
        "batteryLevel",
        "baterai",
      ]),
    ),
    curah_hujan: normalizeMetricValue(
      pickFirst(source, [
        "curah_hujan",
        "curahHujan",
        "curahhujan",
        "rainfall",
        "rain",
        "rainfall_online",
      ]),
    ),
  };
}

async function ensureTmaHistoryTable() {
  if (!TMA_HISTORY_ENABLED || tmaHistoryTableReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.sipeat_tma_history (
      id BIGSERIAL PRIMARY KEY,
      sensor_id VARCHAR(255) NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      observed_at TIMESTAMPTZ NULL,
      tma DOUBLE PRECISION NULL,
      suhu DOUBLE PRECISION NULL,
      kelembaban DOUBLE PRECISION NULL,
      ph DOUBLE PRECISION NULL,
      ec DOUBLE PRECISION NULL,
      battery DOUBLE PRECISION NULL,
      curah_hujan DOUBLE PRECISION NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sipeat_tma_history_sensor_time
      ON public.sipeat_tma_history (sensor_id, captured_at DESC);

    CREATE INDEX IF NOT EXISTS idx_sipeat_tma_history_captured_at
      ON public.sipeat_tma_history (captured_at DESC);
  `);

  tmaHistoryTableReady = true;
}

async function saveSipeatHistory(payload) {
  if (!TMA_HISTORY_ENABLED) return 0;

  try {
    await ensureTmaHistoryTable();

    const records = findCandidateSensorRecords(payload);
    const rows = records.map((record) =>
      normalizeSipeatRecord(record, payload),
    );

    let saved = 0;

    for (const row of rows) {
      const hasMetric = [
        row.tma,
        row.suhu,
        row.kelembaban,
        row.ph,
        row.ec,
        row.battery,
        row.curah_hujan,
      ].some((value) => value !== null);

      if (!hasMetric) continue;

      await pool.query(
        `
          INSERT INTO public.sipeat_tma_history
            (
              sensor_id, observed_at, tma, suhu, kelembaban,
              ph, ec, battery, curah_hujan, payload
            )
          VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        `,
        [
          row.sensor_id,
          row.observed_at,
          row.tma,
          row.suhu,
          row.kelembaban,
          row.ph,
          row.ec,
          row.battery,
          row.curah_hujan,
          JSON.stringify(row),
        ],
      );

      saved++;
    }

    // Retensi otomatis agar tabel tidak tumbuh tanpa batas.
    await pool.query(
      `
        DELETE FROM public.sipeat_tma_history
        WHERE captured_at < NOW() - ($1 * INTERVAL '1 day')
      `,
      [TMA_HISTORY_RETENTION_DAYS],
    );

    return saved;
  } catch (error) {
    // Histori tidak boleh membuat endpoint realtime gagal.
    console.error("âš ï¸ Gagal menyimpan histori SIPEAT:", error.message);
    return 0;
  }
}

async function fetchSipeatData({ sensorId = "all", lastdata = "" } = {}) {
  if (!SIPEAT_API_KEY) {
    const error = new Error("SIPEAT_API_KEY belum dikonfigurasi di backend.");
    error.statusCode = 500;
    throw error;
  }

  const sipeatUrl = new URL(SIPEAT_API_URL);
  sipeatUrl.searchParams.set("key", SIPEAT_API_KEY);
  sipeatUrl.searchParams.set("ID", sensorId || "all");
  sipeatUrl.searchParams.set("lastdata", lastdata ?? "");

  console.log(
    "ðŸ“¡ SIPEAT request:",
    sipeatUrl.origin + sipeatUrl.pathname,
    `ID=${sensorId || "all"}`,
  );

  const response = await fetchWithTimeout(
    sipeatUrl.toString(),
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
    SIPEAT_TIMEOUT_MS,
  );

  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("âŒ Response SIPEAT bukan JSON:", text.slice(0, 1000));
    const error = new Error("Response dari SIPEAT bukan JSON yang valid.");
    error.statusCode = 502;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`SIPEAT HTTP ${response.status}`);
    error.statusCode = response.status;
    error.responseData = data;
    throw error;
  }

  return data;
}

// ==================== SIPEAT PROXY ====================
// Endpoint existing dipertahankan agar frontend lama tidak rusak.
app.get("/api/sipeat", async (req, res) => {
  try {
    const data = await fetchSipeatData({
      sensorId: req.query.id || "all",
      lastdata: req.query.lastdata ?? "",
    });

    // Simpan snapshot tanpa menunggu proses histori selesai.
    void saveSipeatHistory(data);

    return res.json(data);
  } catch (error) {
    console.error("âŒ SIPEAT proxy error:", error);

    return res.status(error.statusCode || 502).json(
      error.responseData || {
        success: false,
        message: error.message || "Gagal mengambil data dari SIPEAT.",
      },
    );
  }
});

// ==================== TMA REALTIME ====================
// Default tetap realtime. Tidak mengubah kontrak frontend lama.
app.get("/api/tma", async (req, res) => {
  try {
    const data = await fetchSipeatData({
      sensorId: req.query.sensor_id || req.query.id || "all",
      lastdata: req.query.lastdata ?? "",
    });

    await saveSipeatHistory(data);

    // Pertahankan response SIPEAT apa adanya agar frontend lama tidak rusak.
    // Informasi histori hanya disimpan di backend.
    return res.json(data);
  } catch (error) {
    console.error("âŒ TMA/SIPEAT error:", error);

    return res.status(error.statusCode || 502).json(
      error.responseData || {
        success: false,
        message: "Gagal mengambil data TMA dari SIPEAT.",
        error: error.message,
      },
    );
  }
});

// ==================== TMA HISTORI ====================
// GET /api/tma/history?range=7d
// GET /api/tma/history?range=30d&sensor_id=xxx
// GET /api/tma/history?from=2026-09-01&to=2026-09-17&sensor_id=xxx
app.get("/api/tma/history", async (req, res) => {
  try {
    await ensureTmaHistoryTable();

    const rangeText = String(req.query.range || "7d").toLowerCase();
    const sensorId = req.query.sensor_id || req.query.id || null;

    const allowedRanges = {
      "7d": 7,
      "30d": 30,
      "90d": 90,
      "180d": 180,
    };

    let fromDate;
    let toDate = new Date();

    if (req.query.from || req.query.to) {
      if (!req.query.from || !req.query.to) {
        return res.status(400).json({
          success: false,
          message: "Parameter from dan to harus dikirim bersama.",
        });
      }

      fromDate = new Date(`${req.query.from}T00:00:00+07:00`);
      toDate = new Date(`${req.query.to}T23:59:59.999+07:00`);

      if (
        Number.isNaN(fromDate.getTime()) ||
        Number.isNaN(toDate.getTime()) ||
        fromDate > toDate
      ) {
        return res.status(400).json({
          success: false,
          message: "Rentang tanggal tidak valid.",
        });
      }
    } else {
      const days = allowedRanges[rangeText] || 7;
      fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    }

    const result = await pool.query(
      `
        SELECT
          id,
          sensor_id,
          captured_at,
          observed_at,
          tma,
          suhu,
          kelembaban,
          ph,
          ec,
          battery,
          curah_hujan
        FROM public.sipeat_tma_history
        WHERE captured_at >= $1
          AND captured_at <= $2
          AND ($3::text IS NULL OR sensor_id = $3)
        ORDER BY captured_at ASC
      `,
      [fromDate.toISOString(), toDate.toISOString(), sensorId],
    );

    const rows = result.rows.map((row) => ({
      ...row,
      captured_at: row.captured_at
        ? new Date(row.captured_at).toISOString()
        : null,
      observed_at: row.observed_at
        ? new Date(row.observed_at).toISOString()
        : null,
    }));

    return res.json({
      success: true,
      source: "SIMITIGASI PostgreSQL â† SIPEAT",
      range: req.query.from || req.query.to ? "custom" : rangeText,
      sensor_id: sensorId,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("âŒ TMA history error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil histori TMA.",
      error: error.message,
    });
  }
});

// ==================== TMA HISTORY STATS ====================
app.get("/api/tma/history/stats", async (req, res) => {
  try {
    await ensureTmaHistoryTable();

    const rangeText = String(req.query.range || "7d").toLowerCase();
    const allowedRanges = { "7d": 7, "30d": 30, "90d": 90, "180d": 180 };
    const days = allowedRanges[rangeText] || 7;
    const sensorId = req.query.sensor_id || req.query.id || null;

    const result = await pool.query(
      `
        SELECT
          COUNT(*)::int AS total_readings,
          COUNT(DISTINCT sensor_id)::int AS total_sensors,
          MIN(tma) AS tma_min,
          MAX(tma) AS tma_max,
          AVG(tma) AS tma_avg,
          MIN(suhu) AS suhu_min,
          MAX(suhu) AS suhu_max,
          AVG(suhu) AS suhu_avg,
          MIN(kelembaban) AS kelembaban_min,
          MAX(kelembaban) AS kelembaban_max,
          AVG(kelembaban) AS kelembaban_avg,
          MIN(ph) AS ph_min,
          MAX(ph) AS ph_max,
          AVG(ph) AS ph_avg,
          MIN(ec) AS ec_min,
          MAX(ec) AS ec_max,
          AVG(ec) AS ec_avg,
          MIN(battery) AS battery_min,
          MAX(battery) AS battery_max,
          AVG(battery) AS battery_avg,
          MIN(curah_hujan) AS curah_hujan_min,
          MAX(curah_hujan) AS curah_hujan_max,
          AVG(curah_hujan) AS curah_hujan_avg
        FROM public.sipeat_tma_history
        WHERE captured_at >= NOW() - ($1 * INTERVAL '1 day')
          AND ($2::text IS NULL OR sensor_id = $2)
      `,
      [days, sensorId],
    );

    return res.json({
      success: true,
      range: rangeText,
      sensor_id: sensorId,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("âŒ TMA history stats error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil statistik histori TMA.",
      error: error.message,
    });
  }
});

// 404 handler
app.use((req, res) => {
  console.warn(`âš ï¸ [404] ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: "Route not found",
    method: req.method,
    path: req.originalUrl,
  });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`ðŸ”¥ SIMITIGASI API READY`);
  console.log(
    `ðŸ”¥ GEOJSON ROUTE REGISTERED: GET /api/layers/:tableName/geojson`,
  );
  console.log(
    `ðŸ”¥ GEOJSON HEALTH ROUTE: GET /api/layers/:tableName/geojson/health`,
  );
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`ðŸ”¥ LAYER OVERLAY CATALOG: GET /api/layer-overlay/catalog`);
  console.log(`ðŸ”¥ LAYER OVERLAY DATA: GET /api/layer-overlay/data/:layerId`);
  console.log(`ðŸ”¥ LAYER OVERLAY HEALTH: GET /api/layer-overlay/health`);
});

server.timeout = 7200000; // 2 hours
server.keepAliveTimeout = 7200000; // 2 hours
server.headersTimeout = 7210000; // Slightly higher than keepAliveTimeout

// Increase max headers count for large multipart uploads
server.maxHeadersCount = 3000;