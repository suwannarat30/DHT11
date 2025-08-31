// be.js
// Backend: ดึงอากาศจาก Open-Meteo → ส่งต่อให้ frontend และบันทึกสรุปลง MongoDB
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ==== Config ====
const PORT = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://root:password@localhost:27017/?authSource=admin";
const DB_NAME = process.env.DB_NAME || "weather";

// ==== เมืองตัวอย่าง ====
const CITY_COORDS = {
  bangkok:      { nameTH: "กรุงเทพฯ",   latitude: 13.7563, longitude: 100.5018 },
  "chiang mai": { nameTH: "เชียงใหม่",  latitude: 18.7883, longitude: 98.9853 },
  phuket:       { nameTH: "ภูเก็ต",     latitude: 7.8804,  longitude: 98.3923 },
  "khon kaen":  { nameTH: "ขอนแก่น",   latitude: 16.4419, longitude: 102.8350 }
};

// ==== Mongo Model ====
const observationSchema = new mongoose.Schema({
  city: String,
  latitude: Number,
  longitude: Number,
  temp: Number,
  windspeed: Number,
  provider_time_utc: String,
  fetched_at: { type: Date, default: Date.now }
}, { collection: "observations" });

const Observation = mongoose.model("Observation", observationSchema);

// ==== Connect Mongo ====
(async () => {
  try {
    await mongoose.connect(MONGO_URI, { dbName: DB_NAME });
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ Mongo connection error:", err.message);
    process.exit(1);
  }
})();

// ==== Weather helpers ====
function wmoToTextTH(code) {
  const c = Number(code);
  if ([0].includes(c)) return "ท้องฟ้าแจ่มใส";
  if ([1].includes(c)) return "มีเมฆเป็นบางส่วน";
  if ([2].includes(c)) return "เมฆเป็นส่วนมาก";
  if ([3].includes(c)) return "มีเมฆมาก";
  if ([45,48].includes(c)) return "มีหมอก / น้ำค้างแข็ง";
  if ([51,53,55,61,63,65,80,81,82].includes(c)) return "ฝนตก";
  if ([56,57,66,67].includes(c)) return "ฝนเยือกแข็ง";
  if ([71,73,75,77,85,86].includes(c)) return "หิมะตก";
  if ([95,96,99].includes(c)) return "พายุฝนฟ้าคะนอง";
  return "สภาพอากาศไม่ทราบแน่ชัด";
}
function wmoToEmoji(code) {
  const c = Number(code);
  if (c === 0) return "☀️";
  if ([1,2].includes(c)) return "⛅️";
  if (c === 3) return "☁️";
  if ([51,53,55,61,63,65,80,81,82].includes(c)) return "🌧️";
  if ([95,96,99].includes(c)) return "⛈️";
  if ([45,48].includes(c)) return "🌫️";
  if ([71,73,75,77,85,86].includes(c)) return "❄️";
  return "🌡️";
}

function getCityInfo(cityRaw) {
  const key = (cityRaw || "").trim().toLowerCase();
  return CITY_COORDS[key] ? { key, ...CITY_COORDS[key] } : { key: "bangkok", ...CITY_COORDS["bangkok"] };
}

async function fetchFromOpenMeteo({ latitude, longitude }) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability,weather_code");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo error ${res.status}`);
  return res.json();
}

function shapeResponse(cityInfo, raw) {
  const current = raw.current || {};
  const hourly = raw.hourly || {};
  const daily  = raw.daily  || {};

  // เดิม (ลบออก)
// const hourlyArr = [];
// const lenH = Math.min(24, (hourly.time || []).length);
// for (let i = 0; i < lenH; i++) {
//   hourlyArr.push({
//     time: hourly.time[i],
//     temp: hourly.temperature_2m?.[i] ?? null,
//     precip_prob: hourly.precipitation_probability?.[i] ?? null,
//     wmo: hourly.weather_code?.[i] ?? null,
//     icon: wmoToEmoji(hourly.weather_code?.[i])
//   });
// }

// ใหม่ (ใส่แทน)
const hourlyArr = (hourly.time || []).map((t, i) => ({
  time: t,
  temp: hourly.temperature_2m?.[i] ?? null,
  precip_prob: hourly.precipitation_probability?.[i] ?? null,
  wmo: hourly.weather_code?.[i] ?? null,
  icon: wmoToEmoji(hourly.weather_code?.[i]),
})).slice(0, 72); // เผื่อ 72 ชม. (พอสำหรับ "ตอนนี้" + 24 ชม. ข้ามเที่ยงคืน)


  const dailyArr = [];
  const lenD = Math.min(10, (daily.time || []).length);
  for (let i = 0; i < lenD; i++) {
    dailyArr.push({
      date: daily.time[i],
      tmin: daily.temperature_2m_min?.[i] ?? null,
      tmax: daily.temperature_2m_max?.[i] ?? null,
      precip_prob_max: daily.precipitation_probability_max?.[i] ?? null
    });
  }

  const alertHeavyRain = (daily.precipitation_probability_max || []).some(v => (v ?? 0) > 60);

  let nextRainTime = null;
  for (let i = 0; i < (hourly.precipitation_probability || []).length; i++) {
    const p = hourly.precipitation_probability[i];
    const t = hourly.time[i];
    if ((p ?? 0) >= 40) { nextRainTime = t; break; }
  }

  return {
    city_key: cityInfo.key,
    city_name_th: cityInfo.nameTH,
    latitude: cityInfo.latitude,
    longitude: cityInfo.longitude,
    current: {
      temp: current.temperature_2m ?? null,
      windspeed: current.wind_speed_10m ?? null,
      wmo: current.weather_code ?? null,
      icon: wmoToEmoji(current.weather_code),
      desc_th: wmoToTextTH(current.weather_code),
      time_utc: current.time ?? null
    },
    hourly: hourlyArr,
    daily: dailyArr,
    alert: alertHeavyRain ? "⚠️ คำเตือนเรื่องฝนตกหนัก" : null,
    next_rain_time: nextRainTime,
    provider: "open-meteo"
  };
}

// ==== Routes ====
app.get("/api/health", (req,res) => res.json({ok:true, service:"weather-backend"}));

app.get("/api/cities", (req,res) => {
  const cities = Object.entries(CITY_COORDS).map(([key, v]) => ({ key, nameTH: v.nameTH }));
  res.json({ ok:true, cities });
});

app.get("/api/weather", async (req,res) => {
  try {
    const { city: cityRaw = "bangkok" } = req.query;
    const cityInfo = getCityInfo(cityRaw);

    const raw = await fetchFromOpenMeteo(cityInfo);
    const shaped = shapeResponse(cityInfo, raw);

    await Observation.create({
      city: cityInfo.key,
      latitude: cityInfo.latitude,
      longitude: cityInfo.longitude,
      temp: shaped.current.temp,
      windspeed: shaped.current.windspeed,
      provider_time_utc: shaped.current.time_utc
    });

    res.json({ ok:true, data: shaped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok:false, error: err.message });
  }
});

app.get("/api/history", async (req,res) => {
  try {
    const { city: cityRaw, limit = 50 } = req.query;
    const q = {};
    if (cityRaw) q.city = (cityRaw || "").toLowerCase().trim();
    const items = await Observation.find(q).sort({fetched_at:-1}).limit(Number(limit));
    res.json({ ok:true, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok:false, error: err.message });
  }
});

function start(port, triesLeft=5) {
  const server = app.listen(port, () => {
    console.log(`✅ Backend running on http://localhost:${port}`);
    console.log(`Try: curl "http://localhost:${port}/api/weather?city=bangkok"`);
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && triesLeft > 0) {
      const next = port + 1;
      console.warn(`⚠️ Port ${port} busy, trying ${next}...`);
      start(next, triesLeft-1);
    } else {
      console.error("❌ Cannot start server:", err.message);
      process.exit(1);
    }
  });
}
start(PORT);
