import eWeLink from 'ewelink-api-next'

// https://dev.ewelink.cc/
// Login
// Apply to become a developer
// Create an application

const _config = {
  appId: 'i2xJpoF13SvxsokOrvCoaMll1sInCtS3', // App ID, which needs to be configured in the eWeLink open platform
  appSecret: 'F6T66HTm2z2oi44f9peTnG02aKfrFTfd', // App Secret, which needs to be configured in the eWeLink open platform
  region: 'as', //Feel free, it will be automatically updated after login
  requestRecord: true, // Request record, default is false
  // logObj: console, // Log object, default is console
}

if (!_config.appId || !_config.appSecret) {
  throw new Error('Please configure appId and appSecret')
}

export const client = new eWeLink.WebAPI(_config)
export const wsClient = new eWeLink.Ws(_config);

//export const redirectUrl = 'http://127.0.0.1:8000/redirectUrl' // Redirect URL, which needs to be configured in the eWeLeLink open platform
export const redirectUrl = 'http://127.0.0.1:3000/redirectUrl'
// Generate random strings
export const randomString = (length) => {
  return [...Array(length)].map(_=>(Math.random()*36|0).toString(36)).join('');
}

