const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const RED = require("node-red");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 10000;

// ==========================
// MIDDLEWARE
// ==========================
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ==========================
// HEALTH CHECK
// ==========================
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "fm-power-peak-server",
    message: "Servidor activo"
  });
});

// ==========================
// NODE-RED SETUP
// ==========================
const userDir = path.join(process.cwd(), ".node-red");

if (!fs.existsSync(userDir)) {
  fs.mkdirSync(userDir, { recursive: true });
}

const settings = {
  httpAdminRoot: "/red",
  httpNodeRoot: "/",
  userDir
};

RED.init(server, settings);

app.use(settings.httpAdminRoot, RED.httpAdmin);
app.use(settings.httpNodeRoot, RED.httpNode);

// ==========================
// START SERVER
// ==========================
server.listen(PORT, "0.0.0.0", async () => {
  try {
    await RED.start();
    console.log(`FM POWER PEAK server running on port ${PORT}`);
  } catch (err) {
    console.error("Error starting Node-RED:", err);
    process.exit(1);
  }
});
