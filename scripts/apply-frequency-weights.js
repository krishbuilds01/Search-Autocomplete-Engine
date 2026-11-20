const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Item = require('../src/models/Item');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/autocomplete_db');
  console.log('Connected to MongoDB');

  await Item.collection.createIndex({ value: 1 });
  console.log('Index on value ready');

  const frequentWords = fs.readFileSync(path.join(__dirname, '..', 'data', 'frequent-words.txt'), 'utf-8')
    .split('\n').map(w => w.trim().toLowerCase()).filter(w => w.length > 0);

  const last = await Item.findOne({}).sort({ itemId: -1 });
  let nextId = last ? last.itemId + 1 : 1;

  let updated = 0;
  let inserted = 0;
  const ops = [];

  for (let rank = 0; rank < frequentWords.length; rank++) {
    const word = frequentWords[rank];
    const weight = 10000 - rank;
    ops.push({
      updateOne: {
        filter: { value: word, $or: [{ searchCount: { $lt: weight } }, { searchCount: { $exists: false } }] },
        update: { $set: { searchCount: weight } }
      }
    });
  }
  const bulkResult = await Item.bulkWrite(ops, { ordered: false });
  updated = bulkResult.modifiedCount;
  console.log(`Updated weights on ${updated} existing words`);

  const existing = new Set((await Item.find({ value: { $in: frequentWords } }).distinct('value')).map(v => v.toLowerCase()));
  const missing = frequentWords.filter(w => !existing.has(w.toLowerCase()));
  if (missing.length > 0) {
    const docs = missing.map(word => ({
      itemId: nextId++,
      value: word,
      searchCount: 10000 - frequentWords.indexOf(word)
    }));
    await Item.insertMany(docs, { ordered: false }).catch(err => {
      if (err.code !== 11000) throw err;
    });
    inserted = docs.length;
  }
  console.log(`Inserted ${inserted} missing frequent words`);
  console.log(`Total items now: ${await Item.countDocuments()}`);
  process.exit(0);
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
