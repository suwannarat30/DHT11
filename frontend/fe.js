// fe.js — static server (public/) with host 0.0.0.0 + port fallback + LAN URLs
const express = require("express");
const path = require("path");
const os = require("os");

const app = express();

// เสิร์ฟไฟล์ใน public/ และเติม .html อัตโนมัติถ้าไม่ใส่ (เช่น / = /index.html)
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

// ค่าตั้งต้น
const BASE_PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || "0.0.0.0";

// พิมพ์ URL ให้ใช้งานสะดวก (localhost + IP ในวง LAN)
function printUrls(port) {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) addrs.push(net.address);
    }
  }
  console.log("\n✅ Frontend running:");
  console.log(`   • Local:  http://localhost:${port}`);
  addrs.forEach(a => console.log(`   • LAN:    http://${a}:${port}`));
}

// ลองพอร์ตถัดไปอัตโนมัติถ้าชน
function start(port, triesLeft = 10) {
  const server = app.listen(port, HOST, () => {
    printUrls(port);
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && triesLeft > 0) {
      const next = port + 1;
      console.warn(`⚠️ Port ${port} busy, trying ${next}...`);
      start(next, triesLeft - 1);
    } else {
      console.error("❌ Cannot start frontend:", err.message);
      process.exit(1);
    }
  });
}

start(BASE_PORT);
