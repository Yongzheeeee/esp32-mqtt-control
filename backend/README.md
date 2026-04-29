# ESP32 IoT Backend

## Railway Deployment

### 1. Environment Variables

Before deploying, set these environment variables in Railway:

- `MONGODB_URI` - Your MongoDB Atlas connection string
  ```
  mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?appName=Cluster0
  ```
- `JWT_SECRET` - Your secret key for JWT tokens (use a random string)
- `MQTT_BROKER` - MQTT broker URL (default: mqtt://broker.emqx.io:1883)

### 2. Deploy

1. Push this code to a GitHub repository
2. In Railway, click "Connect GitHub Repo"
3. Select your repository
4. Add environment variables in Variables section
5. Deploy

### 3. API Endpoints

#### User Registration
```
POST /api/register
Body: { "username": "user1", "password": "123456" }
```

#### User Login
```
POST /api/login
Body: { "username": "user1", "password": "123456" }
Response: { "token": "xxx", "username": "user1", "deviceId": null }
```

#### Register Device
```
POST /api/device/register
Headers: Authorization: Bearer <token>
Body: { "deviceId": "led001", "devicePassword": "pass123" }
```

#### Control Device
```
POST /api/device/control
Headers: Authorization: Bearer <token>
Body: { "command": "red" }
Commands: red, green, blue, off, status
```

#### Get Device Status
```
GET /api/device/status
Headers: Authorization: Bearer <token>
```

#### Get Profile
```
GET /api/profile
Headers: Authorization: Bearer <token>
```
