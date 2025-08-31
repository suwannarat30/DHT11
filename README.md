# Weather (iOS-style UI)

## Run Mongo (Docker)
```bash
docker run --name some-mongo \
  -p 27017:27017 \
  -v /home/$USER/weather/mongodb/data:/data/db \
  -e MONGO_INITDB_ROOT_USERNAME=root \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  -d mongo:latest --auth
```

## Backend
```bash
cd backend
npm install
npm start
# ถ้าพอร์ตชน: PORT=5001 npm start
```

## Frontend
```bash
cd frontend
npm install
npm start
# ถ้าพอร์ตชน: PORT=4001 npm start
```

เปิด http://localhost:4000
เลือกเมือง → โหลดข้อมูล → เห็น UI คล้าย iOS Weather
ทุกครั้งที่เรียก /api/weather จะบันทึก observation ปัจจุบันลง MongoDB
