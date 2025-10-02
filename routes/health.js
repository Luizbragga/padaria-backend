// routes/health.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

router.get("/", (_req, res) => {
  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  const dbStateCode = mongoose.connection?.readyState ?? 0;
  const payload = {
    status: "ok",
    uptime: process.uptime(), // segundos
    timestamp: new Date().toISOString(),
    db: {
      connected: dbStateCode === 1,
      state: states[dbStateCode] || String(dbStateCode),
    },
  };

  // Se DB estiver desconectado, sinalizar com 503 para health externo (ex: load balancer)
  const httpCode = payload.db.connected ? 200 : 503;
  res.status(httpCode).json(payload);
});

module.exports = router;
