import express from 'express'
import cors from 'cors'
import eWeLink from 'ewelink-api-next'
//import Koa from 'koa'
//import bodyParser from 'koa-bodyparser'
//import Router from 'koa-router'
import { client, redirectUrl, randomString } from './config.js'
import * as fs from 'fs'
import open from 'open';

const app = express();

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

//app.use(bodyParser())

//const router = new Router()

// Store active connections (in production, use Redis or similar)
const userConnections = new Map();

// Root route for testing
app.get('/', (req, res) => {
  res.json({ message: 'Smart Home API Server Running' });
});

// API route for testing
app.get('/api', (req, res) => {
  res.json({ message: 'API endpoint working' });
});

// Login route
app.post('/api/login', async (req, res) => {
  try {
  console.log("login request came")
    // Get login URL
    const loginUrl = client.oauth.createLoginUrl({
      redirectUrl: redirectUrl,
      grantType: 'authorization_code',
      state: randomString(10),
    });

    console.log('Generated login URL:', loginUrl); // Debug log

    // Automatically redirect the user to the login URL
    return res.status(200).json({ loginUrl: loginUrl });
  } catch (error) {
    console.error('Login error:', error); // Debug log
    res.status(500).json({ error: error.message });
  }
});

// Redirect URL route
app.get('/redirectUrl', async (req, res) => {
  try {
    const { code, region } = req.query;

    if (!code || !region) {
      return res.status(400).json({ error: 'Code and region are required' });
    }

    console.log('Authorization Code:', code);
    console.log('Region:', region);

    // Fetch token
    const tokenResponse = await client.oauth.getToken({
      region,
      redirectUrl,
      code,
    });

    tokenResponse['region'] = region;

    // Save token to file (for demonstration purposes)
    fs.writeFileSync('./token.json', JSON.stringify(tokenResponse, null, 2));
    console.log('Token Response:', tokenResponse);

    // Return the token response
    res.json(tokenResponse);
  } catch (error) {
    console.error('Error fetching token:', error); // Debug log
    res.status(500).json({ error: error.message });
  }
});


// Get device power state
app.get('/api/device/:deviceId/power', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const connection = userConnections.get(token);
    if (!connection) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const powerState = await connection.getDevicePowerState(deviceId);
    res.json(powerState);
  } catch (error) {
    console.error('Get power state error:', error); // Debug log
    res.status(500).json({ error: error.message });
  }
});

// Get device power usage
app.get('/api/device/:deviceId/usage', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const connection = userConnections.get(token);
    if (!connection) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const powerUsage = await connection.getDevicePowerUsage(deviceId);
    res.json(powerUsage);
  } catch (error) {
    console.error('Get power usage error:', error); // Debug log
    res.status(500).json({ error: error.message });
  }
});

// Toggle device
app.post('/api/device/:deviceId/toggle', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { state } = req.body;
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const connection = userConnections.get(token);
    if (!connection) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const result = await connection.toggleDevice(deviceId, state);
    res.json(result);
  } catch (error) {
    console.error('Toggle device error:', error); // Debug log
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Test the server at: http://localhost:${PORT}`);
  console.log(`API endpoint at: http://localhost:${PORT}/api`);
});