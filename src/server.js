require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');

const connectDB = require('./config/db');
const { client: redisClient, isConnected: isRedisConnected } = require('./config/redis');
const trie = require('./ds/trie');
const Item = require('./models/Item');

const app = express();

app.use(cors());
app.use(express.json());

const swaggerDocument = {
  openapi: "3.0.0",
  info: { title: "Autocomplete API", version: "1.0.0" },
  paths: {
    "/autocomplete": {
      get: {
        summary: "Search for autocomplete items, ranked by popularity",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20, maximum: 50 } }
        ],
        responses: { 200: { description: "Success" } }
      }
    },
    "/track": {
      post: {
        summary: "Record that a suggestion was selected, so it ranks higher",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { value: { type: "string" } } } } }
        },
        responses: { 200: { description: "Tracked" } }
      }
    },
    "/health": {
      get: { summary: "Service health", responses: { 200: { description: "Success" } } }
    },
    "/stats": {
      get: { summary: "Request and cache counters since startup", responses: { 200: { description: "Success" } } }
    },
    "/items": {
      post: {
        summary: "Create a new autocomplete item",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { itemId: { type: "integer" }, value: { type: "string" } } } } }
        },
        responses: { 201: { description: "Created" } }
      }
    },
    "/items/{itemId}": {
      delete: {
        summary: "Delete an autocomplete item",
        parameters: [ { name: "itemId", in: "path", required: true, schema: { type: "integer" } } ],
        responses: { 200: { description: "Deleted" } }
      }
    }
  }
};

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use(express.static(path.join(__dirname, '..', 'public')));

const stats = { requests: 0, cacheHits: 0, cacheMisses: 0, fuzzyServed: 0, tracks: 0 };

// Load items from DB into Trie at startup
const initializeTrie = async () => {
  try {
    const items = await Item.find({});
    for (const item of items) {
      trie.insert(item.itemId, item.value, item.searchCount || 0);
    }
    console.log(`Loaded ${items.length} items into Trie`);
  } catch (error) {
    console.error('Error loading items to Trie:', error);
  }
};

const clearAutocompleteCache = async () => {
  if (!isRedisConnected()) return;
  try {
    const keys = await redisClient.keys('ac:*');
    const fuzzyKeys = await redisClient.keys('fz:*');
    const all = keys.concat(fuzzyKeys);
    if (all.length > 0) {
      await redisClient.del(all);
    }
  } catch (error) {
    console.error('Redis cache clear error', error);
  }
};

const clearCacheForWord = async (word) => {
  if (!isRedisConnected()) return;
  try {
    const normalized = trie.normalize(word, false);
    const keys = [];
    for (let i = 1; i <= normalized.length; i++) {
      const found = await redisClient.keys(`ac:${normalized.slice(0, i)}:*`);
      keys.push(...found);
    }
    const fuzzyKeys = await redisClient.keys('fz:*');
    keys.push(...fuzzyKeys);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.error('Redis cache clear error', error);
  }
};

const rateLimit = (maxRequests, windowMs) => {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > maxRequests) {
      return res.status(429).json({ error: 'Too many requests, slow down' });
    }
    next();
  };
};

// --- APIs ---

app.get('/autocomplete', rateLimit(300, 60 * 1000), async (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Missing query parameter q' });
  }

  let limit = parseInt(req.query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = 20;
  if (limit > 50) limit = 50;

  stats.requests += 1;
  const cacheKey = `ac:${trie.normalize(q, false)}:${limit}`;

  if (isRedisConnected()) {
    try {
      const cachedResult = await redisClient.get(cacheKey);
      if (cachedResult) {
        stats.cacheHits += 1;
        return res.json({ source: 'redis', data: JSON.parse(cachedResult) });
      }
    } catch (error) {
      console.error('Redis get error', error);
    }
  }
  stats.cacheMisses += 1;

  let results = trie.findRanked(q, limit);
  let fuzzy = false;

  if (results.length === 0) {
    results = trie.findFuzzy(q, limit);
    fuzzy = results.length > 0;
    if (fuzzy) stats.fuzzyServed += 1;
  }

  if (isRedisConnected()) {
    try {
      await redisClient.setEx(cacheKey, 60, JSON.stringify(results));
    } catch (error) {
      console.error('Redis setEx error', error);
    }
  }

  return res.json({ source: 'trie', fuzzy, data: results });
});

app.post('/track', rateLimit(300, 60 * 1000), async (req, res) => {
  const { value } = req.body || {};
  if (!value || typeof value !== 'string') {
    return res.status(400).json({ error: 'Missing value in body' });
  }

  try {
    const item = await Item.findOneAndUpdate(
      { value },
      { $inc: { searchCount: 1 } },
      { returnDocument: 'after' }
    );
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    trie.setWeight(item.itemId, item.searchCount);
    stats.tracks += 1;
    await clearCacheForWord(item.value);
    res.json({ ok: true, value: item.value, searchCount: item.searchCount });
  } catch (error) {
    console.error('Error tracking selection', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', items: trie.lookup.size, redis: isRedisConnected() });
});

app.get('/stats', (req, res) => {
  const lookups = stats.cacheHits + stats.cacheMisses;
  res.json({
    items: trie.lookup.size,
    requests: stats.requests,
    cacheHits: stats.cacheHits,
    cacheMisses: stats.cacheMisses,
    cacheHitRate: lookups === 0 ? null : Number((stats.cacheHits / lookups).toFixed(4)),
    fuzzyServed: stats.fuzzyServed,
    tracks: stats.tracks,
    note: 'Counters reset when the server restarts'
  });
});

const requireAdmin = (req, res, next) => {
  const token = process.env.ADMIN_TOKEN;
  if (token && req.get('x-admin-token') !== token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.post('/items', requireAdmin, async (req, res) => {
  const { itemId, value } = req.body;
  
  if (itemId === undefined || !value) {
    return res.status(400).json({ error: 'Missing itemId or value in body' });
  }

  const id = Number(itemId);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'itemId must be an integer' });
  }

  try {
    // Save to DB
    const newItem = await Item.findOneAndUpdate(
       { itemId: id },
       { value },
       { upsert: true, returnDocument: 'after' }
    );

    // Update Trie
    trie.insert(id, value);
    await clearAutocompleteCache();

    res.status(201).json({ message: 'Item saved', item: newItem });
  } catch (error) {
    console.error('Error saving item:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/items/:itemId', requireAdmin, async (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);
  
  try {
    const item = await Item.findOneAndDelete({ itemId });
    if (item) {
      trie.remove(itemId);
      await clearAutocompleteCache();
      res.json({ message: 'Item deleted' });
    } else {
      res.status(404).json({ error: 'Item not found' });
    }
  } catch (error) {
    console.error('Error deleting item', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 3000;

connectDB()
  .then(initializeTrie)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  });
