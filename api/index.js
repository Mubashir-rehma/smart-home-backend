import express from 'express'
import cors from 'cors'
import { client, redirectUrl, randomString } from './config.js'
import * as fs from 'fs'
import path from 'path';
import request from 'request'
import WebSocket, { WebSocketServer } from 'ws';

const app = express();
const wss = new WebSocketServer({ noServer: true });
const PORT = process.env.PORT || 3500;

// Map to store WebSocket connections
const wsConnections = new Map();

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

const regionLink = {
    as: 'https://as-apia.coolkit.cc',
    cn: 'https://cn-apia.coolkit.cn',
    eu: 'https://eu-apia.coolkit.cc',
    us: 'https://us-apia.coolkit.cc'
}

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
    console.log("Login request received");

    const tokenFilePath = path.resolve('./token.json');

    // Check if the token file exists
    if (fs.existsSync(tokenFilePath)) {
      console.log('Token file exists. Reading token credentials...');

      // Read token file
      const tokenData = JSON.parse(fs.readFileSync(tokenFilePath, 'utf-8'));

      if (tokenData) {
        console.log('Valid token found, skipping login URL.');
        return res.status(200).json({ token: tokenData });
      } else {
        console.log('Token is invalid or expired, proceeding with login URL.');
      }
    }

    // Generate a new login URL if no valid token is found
    console.log('Generating new login URL...');
    const loginUrl = client.oauth.createLoginUrl({
      redirectUrl: redirectUrl,
      grantType: 'authorization_code',
      state: randomString(10),
    });

    console.log('Generated login URL:', loginUrl);
    return res.status(200).json({ loginUrl: loginUrl });
  } catch (error) {
    console.error('Login error:', error); // Debug log
    res.status(500).json({ error: error.message });
  }
});

// Redirect URL route
app.get('/api/redirectUrl', async (req, res) => {
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
    // fs.writeFileSync('./token.json', JSON.stringify(tokenResponse, null, 2));
    console.log('Token Response:', tokenResponse);

    // Return the token response
    // res.json(tokenResponse);
    // Redirect to app with token in query parameters
    const appRedirectUrl = `myapp://oauth-callback?token=${encodeURIComponent(
      tokenResponse.data.accessToken
    )}`;
    // res.redirect(appRedirectUrl);
    // Send an HTML response that automatically redirects to the app
    res.send(`
      <html>
        <head>
          <title>Redirecting...</title>
          <meta http-equiv="refresh" content="0;url=${appRedirectUrl}">
        </head>
        <body>
          <p>Redirecting back to app...</p>
          <script>
            window.location.href = "${appRedirectUrl}";
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error fetching token:', error); // Debug log
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const options = {
      method: 'GET',
      url: `${regionLink['as']}/v2/family`, // Adjust region dynamically if needed
      headers: {
        Authorization: `Bearer ${token}`,
        'X-CK-Nonce': "87df8r9e",
        'Content-Type': 'application/json',
      },
    };

    request(options, (error, response, body) => {
      if (error) {
        console.error('Error fetching devices:', error);
        return res.status(500).json({ error: 'Failed to fetch devices' });
      }

      const devices = JSON.parse(body).data;
      console.log(devices)
      res.status(200).json(devices)

    });
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});


app.get('/api/familyinfo', async (req, res) => {
    try {
        const { familyId } = req.params;
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const options = {
          method: 'GET',
          url: `${regionLink['as']}/v2/device/thing`, // Adjust region dynamically if needed
          headers: {
            Authorization: `Bearer ${token}`,
            'X-CK-Nonce': "87df8r9e",
            'Content-Type': 'application/json',
          },
        };

        request(options, (error, response, body) => {
      if (error) {
        console.error('Error fetching devices:', error);
        return res.status(500).json({ error: 'Failed to fetch devices' });
      }

      const devices = JSON.parse(body).data;

      console.log(devices)

      const finDevices = devices.thingList.map(device => {
        const params = device.itemData.params;
        let status = 'unknown';

        // Check for `switch` directly
        if (params.switch) {
          status = params.switch;
        }
        // Check for `switches` array
        else if (Array.isArray(params.switches) && params.switches.length > 0) {
          status = params.switches[0].switch; // Assuming you want the first switch status
        }

        return {
          name: device.itemData.name,
          id: device.itemData.deviceid,
          status: status,
          powerDaily: (params.dayKwh || 0) / 100, // Safely handle division
          powerMonthly: (params.monthKwh || 0) / 100, // Safely handle division
        };
      });

       res.status(200).json(finDevices);
    });
    } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
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

    // const connection = userConnections.get(token);
    // if (!connection) {
    //   return res.status(401).json({ error: 'Invalid token' });
    // }

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
app.post('/api/device/:deviceId/toggle/:state', async (req, res) => {
  try {
    console.log("/api/device/:deviceId/toggle")
    const { deviceId, state } = req.params;
    const token = req.headers.authorization?.split(' ')[1];

    console.log("token", deviceId, state, token)
    
        if (!token) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const options = {
          method: 'POST',
          url: `${regionLink['as']}/v2/device/thing/status`, // Adjust region dynamically if needed
          headers: {
            Authorization: `Bearer ${token}`,
            'X-CK-Nonce': "87df8r9e",
            'Content-Type': 'application/json',
          },
          body:  JSON.stringify({
            "type": 1,
            "id": deviceId,
            "params": {
                "switch": state
            }
          })
        };

        request(options, (error, response, body) => {
          // console.log(JSON.parse(response))
          console.log(JSON.parse(body))
          console.log(error)
          if (error) {
            console.error('Error fetching devices:', JSON.parse(body));
            return res.status(500).json({ error: "Failed to fetch devices: " + error });
          }

          // Toggle device logic here
          broadcastUpdate({ deviceId, state });
          
        //    res.status(200).send('Device toggled');

          res.status(200).json(JSON.parse(body))

    });

    // if (!token) {
    //   return res.status(401).json({ error: 'No token provided' });
    // }

    // console.log(deviceId, state)

    // const connection = userConnections.get(token);
    // if (!connection) {
    //   return res.status(401).json({ error: 'Invalid token' });
    // }

    // const result = await connection.toggleDevice(deviceId, state);
    // console.log(result)
    // res.json(result);
  } catch (error) {
    console.error('Toggle device error:', error); // Debug log
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to control AC based on window status
app.post('/api/window/:deviceId/control', async (req, res) => {
  const { deviceId } = req.params;
  const { action } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Send control action to the window device
  const options = {
    method: 'POST',
    url: `${regionLink['as']}/v2/device/${deviceId}/action`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action }),
  };

  request(options, (error, response) => {
    if (error) {
      console.error('Error controlling device:', error);
      return res.status(500).json({ error: 'Failed to control device' });
    }

    res.status(200).json({ message: 'Device action executed successfully' });
  });
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


// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
//   console.log(`Test the server at: http://localhost:${PORT}`);
//   console.log(`API endpoint at: http://localhost:${PORT}/api`);
// });


const server = app.listen(PORT, () => {
  console.log(`Server running on PORT ${PORT}`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws, req) => {
  console.log('WebSocket connected');
  
  // Handle messages from client
  ws.on('message', (message) => {
    console.log('Received:', message);
  });

  // Remove connection on close
  ws.on('close', () => {
    console.log('WebSocket disconnected');
  });
});

// Function to broadcast updates
// function broadcastUpdate(update) {
//   wss.clients.forEach((client) => {
//     if (client.readyState === WebSocket.OPEN) {
//       client.send(JSON.stringify(update));
//     }
//   });
// }

function broadcastUpdate({ deviceId, state }) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ deviceId, state }));
    }
  });
}



export default app;