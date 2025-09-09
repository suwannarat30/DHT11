// frontend.js
const express = require("express");
const path = require("path");
const app = express();

const PUBLIC_DIR = path.join(__dirname, "public");

// เสิร์ฟไฟล์ static ใน public/
app.use(express.static(PUBLIC_DIR));

// ถ้ารีเควสต์ / แล้วไม่เจอไฟล์ ให้ส่ง index.html
app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(4000, "0.0.0.0", () => {
  console.log("Frontend running on 0.0.0.0:4000");
});
