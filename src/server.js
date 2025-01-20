import express from 'express';
import cors from 'cors';
import { WebSocket, WebSocketServer } from 'ws';
import request from 'request';
import * as fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 8000;

// Create WebSocket server
const wss = new WebSocketServer({ port: 8001 });

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Constants
const API_REGIONS = {
  as: 'https://as-apia.coolkit.cc',
  cn: 'https://cn-apia.coolkit.cn',
  eu: 'https://eu-apia.coolkit.cc',
  us: 'https://us-apia.coolkit.cc'
};

// WebSocket connections store
const wsConnections = new Map();

// WebSocket server setup
wss.on('connection', (ws, req) => {
  const token = req.url.split('token=')[1];
  if (token) {
    wsConnections.set(token, ws);
    console.log(`WebSocket client connected with token: ${token}`);

    ws.on('close', () => {
      wsConnections.delete(token);
      console.log(`WebSocket client disconnected: ${token}`);
    });
  }
});

// Broadcast device updates to connected clients
const broadcastDeviceUpdate = (token, deviceUpdate) => {
  const ws = wsConnections.get(token);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(deviceUpdate));
  }
};

// API Routes
app.get('/', (req, res) => {
  res.json({ message: 'Smart Home API Server Running' });
});

// Login route with OAuth2
app.post('/api/login', async (req, res) => {
  try {
    const tokenFilePath = path.resolve('./token.json');

    if (fs.existsSync(tokenFilePath)) {
      const tokenData = JSON.parse(fs.readFileSync(tokenFilePath, 'utf-8'));
      if (tokenData && !isTokenExpired(tokenData)) {
        return res.status(200).json({ token: tokenData });
      }
    }

    // OAuth2 implementation for new login
    const { app_id, app_secret, email, password } = req.body;
    
    const options = {
      method: 'POST',
      url: `${API_REGIONS.as}/v2/user/login`,
      headers: {
        'Content-Type': 'application/json',
        'X-CK-App-Id': app_id,
        'Authorization': `Sign ${generateAuthSign(app_secret)}`
      },
      body: JSON.stringify({
        email,
        password,
        countryCode: '+1' // Adjustable based on user's region
      })
    };

    request(options, (error, response, body) => {
      if (error) {
        return res.status(500).json({ error: 'Login failed' });
      }
      
      const loginData = JSON.parse(body);
      fs.writeFileSync(tokenFilePath, JSON.stringify(loginData));
      res.status(200).json(loginData);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all devices with real-time updates
app.get('/api/devices', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const options = {
      method: 'GET',
      url: `${API_REGIONS.as}/v2/device/thing`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    request(options, (error, response, body) => {
      if (error) {
        return res.status(500).json({ error: 'Failed to fetch devices' });
      }

      const devices = JSON.parse(body).data;
      
      // Process and format device data
      const formattedDevices = devices.thingList.map(device => ({
        id: device.itemData.deviceid,
        name: device.itemData.name,
        status: getDeviceStatus(device.itemData.params),
        power: {
          daily: (device.itemData.params.dayKwh || 0) / 100,
          monthly: (device.itemData.params.monthKwh || 0) / 100
        },
        online: device.itemData.online,
        type: device.itemData.productModel
      }));

      res.status(200).json(formattedDevices);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle device state with WebSocket update
app.post('/api/device/:deviceId/toggle', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { state } = req.body;
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(deviceId, state)

    const options = {
      method: 'POST',
      url: `${API_REGIONS.as}/v2/device/thing/status`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 1,
        id: deviceId,
        params: {
          switch: state
        }
      })
    };

    request(options, (error, response, body) => {
      if (error) {
        return res.status(500).json({ error: 'Failed to toggle device' });
      }

      const result = JSON.parse(body);

      console.log(result)
      
      // Broadcast device state change to WebSocket clients
      broadcastDeviceUpdate(token, {
        type: 'deviceUpdate',
        deviceId,
        state
      });

      res.status(200).json(result);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get device power consumption statistics
app.get('/api/device/:deviceId/power-stats', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const options = {
      method: 'GET',
      url: `${API_REGIONS.as}/v2/device/thing/stats`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      qs: {
        deviceid: deviceId,
        type: 'power'
      }
    };

    request(options, (error, response, body) => {
      if (error) {
        return res.status(500).json({ error: 'Failed to fetch power statistics' });
      }

      const stats = JSON.parse(body);
      res.status(200).json(stats);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper Functions
const getDeviceStatus = (params) => {
  if (params.switch) {
    return params.switch;
  }
  if (Array.isArray(params.switches) && params.switches.length > 0) {
    return params.switches[0].switch;
  }
  return 'unknown';
};

const isTokenExpired = (tokenData) => {
  const expirationTime = tokenData.data?.at;
  if (!expirationTime) return true;
  return Date.now() > expirationTime * 1000;
};

const generateAuthSign = (appSecret) => {
  // Implement your authentication signature generation logic here
  // This should match eWeLink's requirements for API authentication
  return appSecret; // Placeholder - implement actual signing logic
};

// Error Handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`HTTP Server running on port ${PORT}`);
  console.log(`WebSocket Server running on port 8001`);
  console.log(`API endpoint at: http://localhost:${PORT}/api`);
});