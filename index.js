const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const RED = require("node-red");
const { Pool } = require("pg");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 10000;
const NODE_ENV = process.env.NODE_ENV || "development";
const DB_SSL = (process.env.DB_SSL || "true").toLowerCase() === "true";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? (DB_SSL ? { rejectUnauthorized: false } : false)
    : false,
});

async function ensureDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS peak_devices (
      device_id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      device_name TEXT,
      model TEXT,
      fw TEXT,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS peak_counters_latest (
      device_id TEXT NOT NULL,
      counter_slave_id INTEGER NOT NULL,
      counter_index INTEGER,
      counter_name TEXT,
      counter_type TEXT,
      counter_value BIGINT,
      counter_online BOOLEAN,
      counter_fail_count INTEGER,
      conn_mode TEXT,
      ip TEXT,
      rssi INTEGER,
      uptime_ms BIGINT,
      device_timestamp_ms BIGINT,
      server_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (device_id, counter_slave_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS peak_counters_readings (
      id BIGSERIAL PRIMARY KEY,
      device_id TEXT NOT NULL,
      counter_slave_id INTEGER NOT NULL,
      counter_index INTEGER,
      counter_name TEXT,
      counter_type TEXT,
      counter_value BIGINT,
      counter_online BOOLEAN,
      counter_fail_count INTEGER,
      conn_mode TEXT,
      ip TEXT,
      rssi INTEGER,
      uptime_ms BIGINT,
      device_timestamp_ms BIGINT,
      server_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_peak_readings_device_time
    ON peak_counters_readings(device_id, server_time DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_peak_readings_device_slave_time
    ON peak_counters_readings(device_id, counter_slave_id, server_time DESC);
  `);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.locals.pool = pool;

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({
      ok: true,
      service: "fm-power-peak-server",
      env: NODE_ENV,
      db: true
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "db_error",
      message: err.message
    });
  }
});

app.get("/api/peak/devices", async (req, res) => {
  try {
    const q = `
      SELECT
        d.device_id,
        d.device_name,
        d.model,
        d.fw,
        d.enabled,
        MAX(l.server_time) AS last_seen,
        COUNT(l.counter_slave_id) AS counters_count
      FROM peak_devices d
      LEFT JOIN peak_counters_latest l
        ON l.device_id = d.device_id
      GROUP BY d.device_id, d.device_name, d.model, d.fw, d.enabled
      ORDER BY d.device_id ASC;
    `;
    const { rows } = await pool.query(q);
    res.status(200).json({ ok: true, devices: rows });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "devices_query_error",
      message: err.message
    });
  }
});

app.get("/api/peak/devices/:device_id/latest", async (req, res) => {
  try {
    const { device_id } = req.params;
    const q = `
      SELECT *
      FROM peak_counters_latest
      WHERE device_id = $1
      ORDER BY counter_slave_id ASC;
    `;
    const { rows } = await pool.query(q, [device_id]);
    res.status(200).json({ ok: true, device_id, counters: rows });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "latest_query_error",
      message: err.message
    });
  }
});

app.get("/api/peak/devices/:device_id/readings", async (req, res) => {
  try {
    const { device_id } = req.params;
    const slaveId = req.query.slave_id ? Number(req.query.slave_id) : null;
    const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 1000);

    let q = `
      SELECT *
      FROM peak_counters_readings
      WHERE device_id = $1
    `;
    const params = [device_id];

    if (slaveId !== null && Number.isFinite(slaveId)) {
      q += ` AND counter_slave_id = $2 `;
      params.push(slaveId);
    }

    q += ` ORDER BY server_time DESC LIMIT $${params.length + 1} `;
    params.push(limit);

    const { rows } = await pool.query(q, params);
    res.status(200).json({ ok: true, device_id, readings: rows });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "readings_query_error",
      message: err.message
    });
  }
});

const userDir = path.join(process.cwd(), ".node-red");
if (!fs.existsSync(userDir)) {
  fs.mkdirSync(userDir, { recursive: true });
}

const settings = {
  httpAdminRoot: "/red",
  httpNodeRoot: "/",
  userDir,
  functionGlobalContext: {
    pool: pool
  }
};

RED.init(server, settings);
app.use(settings.httpAdminRoot, RED.httpAdmin);
app.use(settings.httpNodeRoot, RED.httpNode);

async function main() {
  await ensureDb();

  server.listen(PORT, "0.0.0.0", async () => {
    try {
      await RED.start();
      console.log(`FM POWER PEAK server listening on port ${PORT}`);
    } catch (err) {
      console.error("Error starting Node-RED:", err);
      process.exit(1);
    }
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
