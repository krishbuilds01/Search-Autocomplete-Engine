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
        summary: "Search for autocomplete items",
        parameters: [ { name: "q", in: "query", required: true, schema: { type: "string" } } ],
        responses: { 200: { description: "Success" } }
      }
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

// Load items from DB into Trie at startup
const initializeTrie = async () => {
  try {
    const items = await Item.find({});
    for (const item of items) {
      trie.insert(item.itemId, item.value);
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
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.error('Redis cache clear error', error);
  }
};

// --- APIs ---

app.get('/autocomplete', async (req, res) => {
  const { q } = req.query;
  
  if (!q) {
    return res.status(400).json({ error: 'Missing query parameter q' });
  }

  const cacheKey = `ac:${trie.normalize(q, false)}`;

  // 1. Check Cache
  if (isRedisConnected()) {
    try {
      const cachedResult = await redisClient.get(cacheKey);
      if (cachedResult) {
        return res.json({ source: 'redis', data: JSON.parse(cachedResult) });
      }
    } catch (error) {
      console.error('Redis get error', error);
    }
  }

  // 2. Query Trie
  const ids = trie.find(q);
  
  // 3. Resolve actual words (top 20)
  const results = ids.slice(0, 20).map(id => trie.lookup.get(id)).filter(v => v);

  // 4. Update Cache (valid for 60 seconds)
  if (isRedisConnected()) {
    try {
      await redisClient.setEx(cacheKey, 60, JSON.stringify(results));
    } catch (error) {
      console.error('Redis setEx error', error);
    }
  }

  return res.json({ source: 'trie', data: results });
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
