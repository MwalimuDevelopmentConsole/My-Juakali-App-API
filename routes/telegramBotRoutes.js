const express = require("express");
const axios = require("axios");
const router = express.Router();

// The bot service runs locally on the same server (port 4000 by default)
const BOT_SERVICE_URL = process.env.BOT_SERVICE_URL || "http://127.0.0.1:4040" || "http://localhost:4040";

/**
 * Universal proxy forwarder: Forwards any request from /api/telegram-bot/*
 * directly to the local craftoryBot service on http://127.0.0.1:4000/api/*
 */
router.all("*", async (req, res) => {
  const targetPath = req.params[0] ? req.params[0] : req.path;
  const targetUrl = `${BOT_SERVICE_URL}/api${targetPath}`;

  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.body,
      params: req.query,
      headers: {
        "Content-Type": "application/json",
        ...(process.env.BOT_API_SECRET
          ? { "x-bot-secret": process.env.BOT_API_SECRET }
          : {}),
      },
      timeout: 15000,
    });

    return res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }

    if (error.code === "ECONNREFUSED") {
      return res.status(503).json({
        status: "offline",
        error: "Telegram Bot Service is offline (port 4000 unreachable).",
      });
    }

    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
