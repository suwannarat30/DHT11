#include <WiFi.h>
#include <HTTPClient.h>
#include "DHT.h"
#include "esp_wifi.h"   // <-- ใช้ตั้งประเทศแทน WiFi.setCountry()

// ======= USER CONFIG =======
#define WIFI_SSID   "Areena"          // ชื่อ Wi-Fi 2.4GHz
#define WIFI_PASS   "12345678"        // รหัสผ่าน
#define BACKEND_URL "http://172.20.10.7:3000/temperature"  // IP พีซีที่รัน backend
#define DHTPIN      4
#define DHTTYPE     DHT11
#define POST_INTERVAL_MS       5000
#define WIFI_RETRY_INTERVAL_MS 15000
// ===========================

DHT dht(DHTPIN, DHTTYPE);
unsigned long lastPost = 0;
unsigned long lastWifiTry = 0;
bool wifiTrying = false;

static void setCountryTH() {
  // ตั้งประเทศให้รองรับ channel 1–13 (ทางเลือก, ไม่บังคับ)
  wifi_country_t ctry = {
    .cc = "TH",      // Country code
    .schan = 1,      // start channel
    .nchan = 13,     // number of channels
    .policy = WIFI_COUNTRY_POLICY_AUTO
  };
  esp_wifi_set_country(&ctry);
}

void startWifiOnce() {
  wifiTrying = true;
  lastWifiTry = millis();

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);

  // เคลียร์สถานะเดิมก่อนเริ่มใหม่
  WiFi.disconnect(true, true);
  delay(300);

  // ตั้งประเทศ (ถ้าตั้งไม่ได้ก็ไม่เป็นไร)
  setCountryTH();

  Serial.printf("Connecting to WiFi SSID: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

void maintainWifi() {
  if (WiFi.status() != WL_CONNECTED && !wifiTrying &&
      millis() - lastWifiTry > WIFI_RETRY_INTERVAL_MS) {
    startWifiOnce();
  }

  if (wifiTrying) {
    static unsigned long t0 = 0;
    if (t0 == 0) t0 = millis();

    if (WiFi.status() == WL_CONNECTED) {
      wifiTrying = false; t0 = 0;
      Serial.println("✅ WiFi connected.");
      Serial.print("🌐 IP: "); Serial.println(WiFi.localIP());
    } else if (millis() - t0 > 8000) {
      wifiTrying = false; t0 = 0;
      Serial.println("❌ WiFi connect failed this round, will retry later.");
    }
  }
}

String makeJson(float t, float h) {
  String s = "{\"temperature\":";
  s += String(t, 1);
  s += ",\"humidity\":";
  s += String(h, 1);
  s += "}";
  return s;
}

void postTelemetry(float t, float h) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("ℹ️ Skip POST: WiFi not connected.");
    return;
  }
  HTTPClient http;
  http.setTimeout(10000); // เพิ่ม timeout 10 วินาที
  http.begin(BACKEND_URL);                // HTTP
  http.addHeader("Content-Type", "application/json");
  String payload = makeJson(t, h);
  int code = http.POST(payload);
  Serial.printf("POST %s -> %d\n", payload.c_str(), code);
  if (code > 0) Serial.println(http.getString());
  else Serial.println("❌ POST failed, check backend IP/port, firewall, or backend status.");
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(200);
  dht.begin();
  startWifiOnce();

  // แสดง IP backend ที่จะเชื่อมต่อ
  Serial.print("Backend URL: ");
  Serial.println(BACKEND_URL);
}

void loop() {
  maintainWifi();

  unsigned long now = millis();
  if (now - lastPost >= POST_INTERVAL_MS) {
    lastPost = now;
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (isnan(t) || isnan(h)) {
      Serial.println("⚠️ DHT read failed, skip this cycle");
    } else {
      Serial.printf("DHT11 -> T=%.1f°C  H=%.1f%%\n", t, h);
      postTelemetry(t, h);
    }
  }
}