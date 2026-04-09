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
  }
});

module.exports = mongoose.model('Item', itemSchema);
