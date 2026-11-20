# High-Performance Autocomplete Service

**Live demo:** https://search-autocomplete-engine.onrender.com

A robust, in-memory autocomplete engine built with Node.js and Express. This project implements a custom Trie data structure capable of predicting string prefixes efficiently (modeled after thread-safe parsing algorithms previously developed in Go). 

It guarantees millisecond response times by resolving active queries directly in memory and utilizing Redis for localized result caching, whilst persisting the origin dataset reliably inside a dynamic MongoDB instance.

## Tech Stack

* **Backend Environment**: Node.js
* **API Framework**: Express.js
* **Database Layer**: MongoDB (managed via Mongoose ORM)
* **Caching Layer**: Redis (managed via the `redis` client)
* **Core Data Structure**: Custom Trie Structure (In-memory JavaScript algorithmic composition providing ultra-fast node routing and partial-suffix mapping)
* **Live Documentation**: Swagger UI (`swagger-ui-express`)

---

## Architecture Overview
1. **Bootstrapping**: Upon startup, the Express application queries MongoDB for all existing `Item` schemas. The server transforms the database records and pushes them straight into the memory-bound Trie structure.
2. **Search Lookups (`GET`)**: When the API receives an autocomplete request via query parameter, it first checks Redis for an unexpired cached object. On a cache miss, the engine traces the query prefix through the Trie to extract ID keys, returning all known matching full strings.
3. **Data Mutation (`POST/DELETE`)**: Inserting or wiping database records synchronizes frictionlessly across both the MongoDB storage and the active memory pool without needing a reboot.

---

## Getting Started

### Prerequisites
* Make sure you have **Node.js** natively installed.
* **MongoDB** must be running locally on the default port `27017`
* *(Optional)* A **Redis** server running locally on default port `6379`. If Redis isn’t bound to your environment, the code falls back natively to bypass caching gracefully without crashing.

### Installation
1. Start by installing the project dependencies:
   ```bash
   cd autocomplete-node
   npm install
   ```
2. Boot the API. (We've rigged the project with `nodemon` for active live-reloading):
   ```bash
   npm run dev
   ```

*(Alternatively for production use without reloading monitors: `npm start`)*

---

## Interactive Documentation

Forget the terminal. We've equipped the server with an integrated interactive Swagger endpoint.
When `npm run dev` is running, pop open a browser and explore:

👉 **http://localhost:3000/docs**

---

### Manual API Usage (CURL Examples)

**1. Create an Entry (`POST /items`)**
```bash
curl -X POST http://localhost:3000/items \
     -H "Content-Type: application/json" \
     -d '{"itemId": 101, "value": "grey athletic shorts"}'
```

**2. Query Autocomplete Engine (`GET /autocomplete`)**
Using the word 'grey', or partial matching.
```bash
curl "http://localhost:3000/autocomplete?q=grey"
```

**3. Delete an Entry (`DELETE /items`)**
Targets the `itemId` reference provided previously. 
```bash
curl -X DELETE http://localhost:3000/items/101
```
