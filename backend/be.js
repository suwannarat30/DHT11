// backend.js
const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");

const app = express();
const HTTP_PORT = 3000;
const WS_PORT = 3001;

app.use(cors());
app.use(express.json());

const wss = new WebSocket.Server({ port: WS_PORT });
wss.on("listening", () => console.log(`WS on 0.0.0.0:${WS_PORT}`));

app.get("/", (_req, res) => res.send("ok"));

app.post("/temperature", (req, res) => {
  const payload = { ...req.body, ts: Date.now() };
  console.log("POST /temperature", payload);
  // broadcast
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(payload));
  });
  res.status(201).json({ ok: true });
});

app.listen(HTTP_PORT, "0.0.0.0", () => console.log(`HTTP on 0.0.0.0:${HTTP_PORT}`));
