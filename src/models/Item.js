const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  itemId: { 
    type: Number, 
    required: true, 
    unique: true 
  },
  value: { 
    type: String, 
    required: true 
  },
  searchCount: {
    type: Number,
    default: 0
  }
});

module.exports = mongoose.model('Item', itemSchema);
