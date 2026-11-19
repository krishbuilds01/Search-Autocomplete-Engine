const { createClient } = require('redis');

const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: false // Disable infinite reconnects
  }
});

let errorLogged = false;
client.on('error', (err) => {
  if (!errorLogged) {
    console.warn('Redis connection unavailable (caching will be bypassed). ' + err.message);
    errorLogged = true;
  }
});

let isConnected = false;

client.on('end', () => {
  isConnected = false;
});

client.connect().then(() => {
  console.log('Redis Connected');
  isConnected = true;
}).catch(err => {
  if (!errorLogged) {
    console.warn("Failed to connect to Redis");
    errorLogged = true;
  }
});

module.exports = {
  client,
  isConnected: () => isConnected
};
