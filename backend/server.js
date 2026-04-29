const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const mqtt = require('mqtt');

const app = express();
app.use(express.json());
app.use(cors());

const JWT_SECRET = process.env.JWT_SECRET || 'esp32-iot-secret-key-2024';
const MONGODB_URI = process.env.MONGODB_URI;
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://broker.emqx.io:1883';
const DEFAULT_DEVICE_ID = process.env.DEFAULT_DEVICE_ID || 'led001';
const DEFAULT_DEVICE_PASSWORD = process.env.DEFAULT_DEVICE_PASSWORD || 'pass123';

console.log('Starting ESP32 Backend...');
console.log('MONGODB_URI:', MONGODB_URI ? 'SET' : 'NOT SET');

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI environment variable is not set!');
  process.exit(1);
}

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  devicePassword: { type: String, required: true },
  currentColor: { type: String, default: 'OFF' },
  lastSeen: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Device = mongoose.model('Device', deviceSchema);

let mqttClient = null;

function connectMQTT() {
  mqttClient = mqtt.connect(MQTT_BROKER);

  mqttClient.on('connect', () => {
    console.log('Connected to MQTT Broker');
    mqttClient.subscribe('esp32/+/status');
    mqttClient.subscribe(`esp32/${DEFAULT_DEVICE_ID}/command`);
  });

  mqttClient.on('message', (topic, message) => {
    const parts = topic.split('/');
    if (parts[2] === 'status') {
      const deviceId = parts[1];
      const color = message.toString();
      Device.findOneAndUpdate(
        { deviceId },
        { currentColor: color, lastSeen: new Date() },
        { upsert: false }
      ).catch(err => console.error('Update device color error:', err.message));
    }
  });

  mqttClient.on('error', (err) => {
    console.error('MQTT error:', err.message);
  });
}

connectMQTT();

async function ensureDefaultDevice() {
  try {
    const device = await Device.findOne({ deviceId: DEFAULT_DEVICE_ID });
    if (!device) {
      const newDevice = new Device({
        deviceId: DEFAULT_DEVICE_ID,
        devicePassword: DEFAULT_DEVICE_PASSWORD
      });
      await newDevice.save();
      console.log('Default device created:', DEFAULT_DEVICE_ID);
    } else {
      console.log('Default device already exists');
    }
  } catch (err) {
    console.error('Ensure device error:', err.message);
  }
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    console.log('User registered:', username);
    res.json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    console.log('User logged in:', username);
    res.json({
      token,
      username: user.username,
      deviceId: DEFAULT_DEVICE_ID
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

app.post('/api/device/control', authMiddleware, async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'Command required' });
    }
    if (mqttClient && mqttClient.connected) {
      mqttClient.publish(`esp32/${DEFAULT_DEVICE_ID}/command`, command);
      console.log(`User ${req.username} sent command: ${command}`);
      res.json({ success: true, command, deviceId: DEFAULT_DEVICE_ID });
    } else {
      res.status(500).json({ error: 'MQTT not connected' });
    }
  } catch (err) {
    console.error('Control error:', err.message);
    res.status(500).json({ error: 'Control failed' });
  }
});

app.get('/api/device/status', authMiddleware, async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: DEFAULT_DEVICE_ID });
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json({
      deviceId: device.deviceId,
      currentColor: device.currentColor,
      lastSeen: device.lastSeen
    });
  } catch (err) {
    console.error('Status error:', err.message);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    res.json({ ...user.toObject(), deviceId: DEFAULT_DEVICE_ID });
  } catch (err) {
    console.error('Profile error:', err.message);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'OK', service: 'ESP32 Backend API' });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    mqtt: mqttClient && mqttClient.connected ? 'connected' : 'disconnected'
  });
});

const PORT = process.env.PORT || 3000;

mongoose.connection.once('open', () => {
  console.log('MongoDB connection opened');
  ensureDefaultDevice();
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
