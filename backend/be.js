// backend/be.js  (Polling version — No WebSocket)
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// อนุญาตเฉพาะ origin ที่ไว้ใจได้ (แก้เป็นโดเมนจริงของคุณด้วย)
const ALLOW_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'https://dht-11-mkzt.vercel.app',   // Vercel frontend ของคุณ
]);

app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOW_ORIGINS.has(origin)),
}));

app.use(express.json()); // ไม่ต้อง body-parser แล้ว

// เก็บค่าล่าสุดไว้ในหน่วยความจำ
let latest = { temperature: null, humidity: null, at: null };

// ESP32 จะ POST มาที่นี่
app.post('/temperature', (req, res) => {
  const { temperature, humidity } = req.body || {};
  if (typeof temperature !== 'number' || typeof humidity !== 'number') {
    return res.status(400).json({ error: 'Invalid payload: need number temperature & humidity' });
  }
  latest = { temperature, humidity, at: Date.now() };
  console.log('Received:', latest);
  res.json({ ok: true });
});

// Frontend ดึงค่าล่าสุดจากตรงนี้ (Polling)
app.get('/data', (_req, res) => {
  res.json(latest);
});

// Health check
app.get('/health', (_req, res) => res.send('ok'));

app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
