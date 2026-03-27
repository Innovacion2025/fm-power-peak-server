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
});
