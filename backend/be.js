// be.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const { setTimeout: sleep } = require('timers/promises');

// node-fetch v3 (ESM) ใน CommonJS: ใช้ dynamic import
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

/* --------------------- App & IO --------------------- */
const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'] })); // TODO: โปรดจำกัด origin ในโปรดักชัน
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

/* --------------------- ENV & Validation --------------------- */
const {
  PORT = '5000',
  MONGO_URL,
  LAT = '13.7563',
  LON = '100.5018',
  POLL_INTERVAL_SECONDS = '60',
  API_KEY, // OpenWeatherMap API key
  KEEP_DAYS = '14', // เก็บข้อมูลย้อนหลังกี่วัน (TTL)
  REQUEST_TIMEOUT_MS = '8000', // timeout เรียก API ภายนอก
  MAX_RETRIES = '3', // retry ถ้าเรียก API ล้มเหลว
} = process.env;

const pollSec = Number(POLL_INTERVAL_SECONDS);
const keepDays = Number(KEEP_DAYS);
const reqTimeout = Number(REQUEST_TIMEOUT_MS);
const maxRetries = Number(MAX_RETRIES);

if (!MONGO_URL) throw new Error('Missing MONGO_URL in environment variables.');
if (!API_KEY) throw new Error('Missing API_KEY in environment variables.');
if (!(pollSec > 0)) throw new Error('Invalid POLL_INTERVAL_SECONDS.');
if (!(keepDays > 0)) throw new Error('Invalid KEEP_DAYS.');
if (!(reqTimeout >= 1000)) throw new Error('Invalid REQUEST_TIMEOUT_MS.');
if (!(maxRetries >= 0)) throw new Error('Invalid MAX_RETRIES.');

/* --------------------- MongoDB --------------------- */
mongoose
  .connect(MONGO_URL)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

const WeatherSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now, index: true },
    temperature: Number,
    windspeed: Number,
    winddirection: Number,
    weathercode: Number,
    raw: Object,
  },
  { versionKey: false }
);

// TTL index: ลบเอกสารอัตโนมัติเมื่อครบ KEEP_DAYS
WeatherSchema.index({ timestamp: 1 }, { expireAfterSeconds: keepDays * 24 * 60 * 60 });

const Weather = mongoose.model('Weather', WeatherSchema);

/* --------------------- Helpers --------------------- */
async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/* --------------------- Polling --------------------- */
async function fetchAndSaveAndEmit({ lat, lon, apiKey }) {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${encodeURIComponent(
    lat
  )}&lon=${encodeURIComponent(lon)}&appid=${encodeURIComponent(apiKey)}&units=metric`;

  let attempt = 0;
  while (true) {
    try {
      const res = await fetchWithTimeout(url, reqTimeout);
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`Weather API error ${res.status}: ${errorText.slice(0, 300)}`);
      }

      const data = await res.json();

      const doc = new Weather({
        timestamp: new Date(),
        temperature: data?.main?.temp ?? null,
        windspeed: data?.wind?.speed ?? null,
        winddirection: data?.wind?.deg ?? null,
        weathercode: data?.weather?.[0]?.id ?? null,
        raw: data,
      });

      await doc.save();
      console.log(
        `[weather] ${doc.timestamp.toISOString()} temp=${doc.temperature}C wind=${doc.windspeed}m/s`
      );

      io.emit('weather_update', {
        _id: doc._id,
        timestamp: doc.timestamp,
        temperature: doc.temperature,
        windspeed: doc.windspeed,
        winddirection: doc.winddirection,
        weathercode: doc.weathercode,
      });

      return; // success
    } catch (err) {
      attempt += 1;
      const retrying = attempt <= maxRetries;
      console.error(
        `fetchAndSaveAndEmit error (attempt ${attempt}/${maxRetries}) -> ${err.message}${
          retrying ? ' | retrying...' : ''
        }`
      );
      if (!retrying) return;

      // exponential backoff with jitter
      const delayMs = Math.min(30000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 500);
      await sleep(delayMs);
    }
  }
}

/* --------------------- Scheduler --------------------- */
const poll = () => fetchAndSaveAndEmit({ lat: LAT, lon: LON, apiKey: API_KEY });

// run immediately, then interval
poll();
const interval = setInterval(poll, pollSec * 1000);

/* --------------------- Routes --------------------- */
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

// optional: endpoint อ่านค่าล่าสุด (เผื่อ client ไม่ได้ใช้ socket.io)
app.get('/api/weather/latest', async (_req, res) => {
  try {
    const last = await Weather.findOne().sort({ timestamp: -1 }).lean();
    res.json({ data: last || null });
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
});

/* --------------------- Start & Shutdown --------------------- */
const port = Number(PORT);
const listener = server.listen(port, (err) => {
  if (err) {
    console.error('Server start error:', err);
    process.exit(1);
  }
  console.log(`Backend listening on http://localhost:${port}`);
});

async function gracefulShutdown(code = 0) {
  try {
    clearInterval(interval);
    io.close();
    listener.close();
    await mongoose.connection.close();
  } catch (_) {
    // ignore
  } finally {
    process.exit(code);
  }
}

process.on('SIGINT', () => gracefulShutdown(0));
process.on('SIGTERM', () => gracefulShutdown(0));
