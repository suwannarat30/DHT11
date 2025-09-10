const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const WebSocket = require('ws'); // นำเข้าไลบรารี ws ทั้งหมด

const app = express();
const port = 3000;

// สร้าง WebSocket server
const wss = new WebSocket.Server({ port: 3001 }); // ใช้ WebSocket.Server

app.use(cors()); // อนุญาตการเข้าถึงจาก Frontend
app.use(bodyParser.json()); // ใช้เพียงครั้งเดียวเท่านั้น

// HTTP endpoint สำหรับรับข้อมูลจาก ESP32
app.post('/temperature', (req, res) => {
  const data = req.body;
  console.log('Received:', data);

  // ส่งข้อมูลไปยังทุก client ที่เชื่อมต่อผ่าน WebSocket
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) { // เปลี่ยนเป็น WebSocket.OPEN
      client.send(JSON.stringify(data));
    }
  });

  res.send('OK');
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});

wss.on('listening', () => {
  console.log('WebSocket server listening on port 3001');
});