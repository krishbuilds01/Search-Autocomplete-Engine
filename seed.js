const fs = require('fs');
const mongoose = require('mongoose');
const Item = require('./src/models/Item');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/autocomplete_db');
  console.log('Connected to MongoDB');
  
  // Clear existing items
  await Item.deleteMany({});
  console.log('Cleared existing items from MongoDB');

  // Read dictionary words
  const data = fs.readFileSync('/usr/share/dict/words', 'utf-8');
  const words = data.split('\n').map(w => w.trim()).filter(w => w.length > 0);
  
  // Seed 50,000 words
  const limit = 50000;
  const selectedWords = words.slice(0, limit);
  
  const documents = selectedWords.map((word, index) => ({
    itemId: index + 1,
    value: word
  }));

  console.log(`Inserting ${documents.length} words...`);
  
  // Insert in batches of 10000 for efficiency
  const batchSize = 10000;
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    await Item.insertMany(batch);
    console.log(`Inserted batch ${i / batchSize + 1}`);
  }

  console.log('Seeding complete successfully.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
