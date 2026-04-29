#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <WebServer.h>
#include <HTTPClient.h>

#define LED_R 4
#define LED_G 5
#define LED_B 6

const char* ssid = "SHY";
const char* password = "shy1990814";

const char* mqtt_server = "broker.emqx.io";

const char* backend_url = "https://esp32-backend-production-cfe5.up.railway.app";

const char* device_id = "led001";
const char* device_password = "pass123";

const char* topic_command = "esp32/led001/command";
const char* topic_status = "esp32/led001/status";

WiFiClient espClient;
PubSubClient mqttClient(espClient);
WebServer server(80);

int colorState = 0;
String currentColor = "OFF";

void updateBackendStatus();

void setLedColor(int state) {
  digitalWrite(LED_R, state == 0 ? HIGH : LOW);
  digitalWrite(LED_G, state == 1 ? HIGH : LOW);
  digitalWrite(LED_B, state == 2 ? HIGH : LOW);
}

void publishStatus() {
  String statusMsg = "Color: " + currentColor;
  mqttClient.publish(topic_status, statusMsg.c_str());
  updateBackendStatus();
}

void updateBackendStatus() {
  HTTPClient http;
  http.begin(String(backend_url) + "/api/device/status");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  String payload = "{\"deviceId\":\"" + String(device_id) + "\",\"currentColor\":\"" + currentColor + "\"}";

  int httpCode = http.POST(payload);
  if (httpCode > 0) {
    Serial.printf("Backend status update: %d\n", httpCode);
  } else {
    Serial.println("Backend update failed");
  }
  http.end();
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("] ");

  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println(message);

  if (message == "red") {
    colorState = 0;
    currentColor = "Red";
    setLedColor(0);
    publishStatus();
  } else if (message == "green") {
    colorState = 1;
    currentColor = "Green";
    setLedColor(1);
    publishStatus();
  } else if (message == "blue") {
    colorState = 2;
    currentColor = "Blue";
    setLedColor(2);
    publishStatus();
  } else if (message == "off") {
    colorState = 3;
    currentColor = "OFF";
    setLedColor(3);
    publishStatus();
  } else if (message == "status") {
    publishStatus();
  }
}

void mqttReconnect() {
  while (!mqttClient.connected()) {
    Serial.print("Attempting MQTT connection...");
    String clientId = "ESP32Client-";
    clientId += String(random(1000));
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println("connected");
      mqttClient.subscribe(topic_command);
      mqttClient.publish(topic_status, "ESP32 RGB LED Online! Device: led001");
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void handleRoot() {
  String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ESP32 Device Info</title>
  <style>
    body { font-family: Arial; text-align: center; padding: 50px; background: #f0f0f0; }
    h1 { color: #333; }
    .info-box { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
    .info-item { margin: 15px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
    .label { color: #666; font-size: 14px; }
    .value { color: #333; font-size: 18px; font-weight: bold; margin-top: 5px; }
    .status-online { color: green; }
    .current-color { font-size: 24px; margin-top: 20px; }
  </style>
</head>
<body>
  <h1>RGB LED Controller</h1>
  <div class="info-box">
    <div class="info-item">
      <div class="label">Device ID</div>
      <div class="value">led001</div>
    </div>
    <div class="info-item">
      <div class="label">Status</div>
      <div class="value status-online">Online</div>
    </div>
    <div class="info-item">
      <div class="label">Current Color</div>
      <div class="value current-color">OFF</div>
    </div>
  </div>
  <p style="margin-top:20px; font-size:14px; color:#666;">
    Backend: esp32-backend.up.railway.app
  </p>
</body>
</html>
  )rawliteral";
  server.send(200, "text/html", html);
}

void setup() {
  Serial.begin(115200);

  pinMode(LED_R, OUTPUT);
  pinMode(LED_G, OUTPUT);
  pinMode(LED_B, OUTPUT);

  digitalWrite(LED_R, LOW);
  digitalWrite(LED_G, LOW);
  digitalWrite(LED_B, LOW);

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  Serial.print("Backend URL: ");
  Serial.println(backend_url);
  Serial.print("Device ID: ");
  Serial.println(device_id);
  Serial.print("MQTT Topics: ");
  Serial.println(topic_command);
  Serial.println(topic_status);

  mqttClient.setServer(mqtt_server, 1883);
  mqttClient.setCallback(mqttCallback);

  server.on("/", handleRoot);
  server.begin();
}

void loop() {
  server.handleClient();

  if (!mqttClient.connected()) {
    mqttReconnect();
  }
  mqttClient.loop();
}
