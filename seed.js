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
  const wordsFile = process.argv[2] || process.env.WORDS_FILE || '/usr/share/dict/words';
  const data = fs.readFileSync(wordsFile, 'utf-8');
  const words = data.split('\n').map(w => w.trim()).filter(w => w.length > 0);

  // Frequent words come first: they are always included and carry a
  // starting popularity weight from their rank (most frequent = 10000)
  const frequentFile = process.env.FREQUENT_FILE || require('path').join(__dirname, 'data', 'frequent-words.txt');
  let frequentWords = [];
  try {
    frequentWords = fs.readFileSync(frequentFile, 'utf-8')
      .split('\n').map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
  } catch (err) {
    console.warn('Frequent words file not read, seeding without weights');
  }
  const weightByWord = new Map();
  frequentWords.forEach((word, rank) => weightByWord.set(word, 10000 - rank));

  // Seed 50,000 words: all frequent words, then spread evenly over the
  // rest of the dictionary so all prefixes are covered
  const limit = 50000;
  const selected = new Set(frequentWords);
  if (words.length <= limit) {
    words.forEach(w => selected.add(w));
  } else {
    const remaining = limit - selected.size;
    for (let i = 0; i < remaining; i++) {
      selected.add(words[Math.floor((i * words.length) / remaining)]);
    }
  }
  const selectedWords = Array.from(selected).slice(0, limit);

  const documents = selectedWords.map((word, index) => ({
    itemId: index + 1,
    value: word,
    searchCount: weightByWord.get(word.toLowerCase()) || 0
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
