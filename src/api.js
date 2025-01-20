// functions/api.js
import express from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import request from 'request';
import { WebSocket, WebSocketServer } from 'ws';

const app = express();
const router = express.Router();

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

// Note: WebSocket functionality will need to be handled differently in serverless
// Consider using a service like Pusher or Firebase for real-time updates

// API Routes
router.get('/', (req, res) => {
  res.json({ message: 'Smart Home API Server Running' });
});

// Login route with OAuth2
router.post('/login', async (req, res) => {
  try {
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
        countryCode: '+1'
      })
    };

    request(options, (error, response, body) => {
      if (error) {
        return res.status(500).json({ error: 'Login failed' });
      }
      
      const loginData = JSON.parse(body);
      res.status(200).json(loginData);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all devices
router.get('/devices', async (req, res) => {
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

// Toggle device state
router.post('/device/:deviceId/toggle', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { state } = req.body;
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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
      res.status(200).json(result);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get device power consumption statistics
router.get('/device/:deviceId/power-stats', async (req, res) => {
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

const generateAuthSign = (appSecret) => {
  // Implement your authentication signature generation logic here
  return appSecret; // Placeholder - implement actual signing logic
};

app.use('/.netlify/functions/api', router);

// Error Handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export const handler = serverless(app);