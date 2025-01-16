import eWeLink from 'ewelink-api-next';

const client = new eWeLink.WebAPI({
  appId: 'i2xJpoF13SvxsokOrvCoaMll1sInCtS3',
  appSecret: 'F6T66HTm2z2oi44f9peTnG02aKfrFTfd',
  region: 'as', // Replace with your region, e.g., 'eu', 'as', etc.
  logObj: console // Optional: for logging purposes
});

async function loginAndFetchDevices() {
  try {
    // User login
    const loginResponse = await client.user.login({
      account: 'Nadim.khoury@arkenergy.ae',
      password: 'nadim@nadim',
      areaCode: '+971' // Replace with your country code
    });

    if (loginResponse.error === 0) {
      const userInfo = loginResponse.data.user;
      console.log('User Info:', userInfo);

      // Fetch devices
      const devicesResponse = await client.device.getThingList();
      if (devicesResponse.error === 0) {
        const devices = devicesResponse.data.thingList;
        console.log('Devices:', devices);
      } else {
        console.error('Failed to fetch devices:', devicesResponse.msg);
      }
    } else {
      console.error('Login failed:', loginResponse.msg);
    }
  } catch (error) {
    console.error('An error occurred:', error.message);
  }
}

loginAndFetchDevices();