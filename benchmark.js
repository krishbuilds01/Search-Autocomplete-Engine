const http = require('http');

const PORT = 3000;
const HOST = 'localhost';
const TOTAL_REQUESTS = 1000;

// A pool of query terms to simulate search behavior
const queriesPool = [
  "th", "he", "an", "in", "de", "re", "con", "pre", "a", "b", 
  "c", "s", "t", "m", "p", "st", "ch", "sh", "work", "play"
];

// Helper to make a request and return latency and source
function makeRequest(query) {
  return new Promise((resolve) => {
    const start = performance.now();
    const url = `http://${HOST}:${PORT}/autocomplete?q=${encodeURIComponent(query)}`;
    
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const latency = performance.now() - start;
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            resolve({
              success: true,
              latency,
              source: json.source // 'redis' or 'trie'
            });
          } catch (e) {
            resolve({ success: false, error: 'JSON parsing failed' });
          }
        } else {
          resolve({ success: false, error: `Status code ${res.statusCode}` });
        }
      });
    }).on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

async function runBenchmark() {
  console.log(`Starting benchmark of ${TOTAL_REQUESTS} requests against http://${HOST}:${PORT}/autocomplete...`);
  
  let hits = 0;
  let misses = 0;
  let totalLatency = 0;
  let successCount = 0;
  let failCount = 0;
  
  const latencies = [];

  // Run requests sequentially or with low concurrency to measure clean latency
  for (let i = 0; i < TOTAL_REQUESTS; i++) {
    // Pick a query randomly from the pool
    const query = queriesPool[Math.floor(Math.random() * queriesPool.length)];
    const result = await makeRequest(query);
    
    if (result.success) {
      successCount++;
      totalLatency += result.latency;
      latencies.push(result.latency);
      
      if (result.source === 'redis') {
        hits++;
      } else if (result.source === 'trie') {
        misses++;
      }
    } else {
      failCount++;
    }

    // Print progress every 100 requests
    if ((i + 1) % 100 === 0) {
      console.log(`Completed ${i + 1}/${TOTAL_REQUESTS} requests...`);
    }
  }

  const avgLatency = successCount > 0 ? (totalLatency / successCount).toFixed(2) : 0;
  const hitRate = successCount > 0 ? ((hits / (hits + misses)) * 100).toFixed(2) : 0;
  
  // Sort latencies to find percentiles
  latencies.sort((a, b) => a - b);
  const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)].toFixed(2) : 0;
  const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)].toFixed(2) : 0;
  const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)].toFixed(2) : 0;

  console.log('\n================ BENCHMARK RESULTS ================');
  console.log(`Total Requests:      ${TOTAL_REQUESTS}`);
  console.log(`Successful:          ${successCount}`);
  console.log(`Failed:              ${failCount}`);
  console.log(`Average Latency:     ${avgLatency} ms`);
  console.log(`50th Percentile:     ${p50} ms`);
  console.log(`95th Percentile:     ${p95} ms`);
  console.log(`99th Percentile:     ${p99} ms`);
  console.log(`Redis Cache Hits:    ${hits}`);
  console.log(`Redis Cache Misses:  ${misses}`);
  console.log(`Cache Hit Rate:      ${hitRate}%`);
  console.log('===================================================\n');
}

runBenchmark().catch(console.error);
