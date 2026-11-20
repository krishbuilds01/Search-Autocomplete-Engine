class TrieNode {
  constructor() {
    this.children = {};
    this.ids = new Set();
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
    this.lookup = new Map(); // id -> string
    this.weights = new Map(); // id -> popularity weight
  }

  normalize(value, preserveSpaces) {
    let result = '';
    for (let i = 0; i < value.length; i++) {
        const charCode = value.charCodeAt(i);
        if ((charCode >= 97 && charCode <= 122) || (charCode >= 48 && charCode <= 57) || (preserveSpaces && charCode === 32)) {
            result += String.fromCharCode(charCode);
        } else if (charCode >= 65 && charCode <= 90) {
            result += String.fromCharCode(charCode + 32); 
        }
    }
    return result;
  }

  insert(id, value, weight = 0) {
    if (this.lookup.has(id)) {
      const oldValue = this.lookup.get(id);
      this.remove(id, oldValue);
    }
    this.lookup.set(id, value);
    this.weights.set(id, weight);
    this._process(id, value, (currentId, partial) => {
        this._insertPartial(currentId, partial);
    });
  }

  setWeight(id, weight) {
    if (this.lookup.has(id)) {
      this.weights.set(id, weight);
    }
  }

  incrementWeight(id) {
    if (this.lookup.has(id)) {
      this.weights.set(id, (this.weights.get(id) || 0) + 1);
    }
  }

  getWeight(id) {
    return this.weights.get(id) || 0;
  }

  _insertPartial(id, value) {
    let node = this.root;
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      if (!node.children[char]) {
        node.children[char] = new TrieNode();
      }
      node = node.children[char];
      node.ids.add(id);
    }
  }

  remove(id, valueOpt) {
    let value = valueOpt;
    if (value === undefined) {
      if (!this.lookup.has(id)) return;
      value = this.lookup.get(id);
    }
    
    this._process(id, value, (currentId, partial) => {
        this._removePartial(currentId, partial);
    });
    this.lookup.delete(id);
    this.weights.delete(id);
  }

  _removePartial(id, value) {
     let node = this.root;
     for (let i = 0; i < value.length; i++) {
       const char = value[i];
       if (!node.children[char]) return;
       node = node.children[char];
       node.ids.delete(id);
     }
  }

  _process(id, value, processor) {
    const normalized = this.normalize(value, true);
    const parts = normalized.split(' ');
    let partials = [];

    for (let i = 0; i < parts.length; i++) {
      const partial = parts.slice(i).join('');
      let seen = false;
      for (const p of partials) {
          if (p.startsWith(partial)) {
             seen = true;
             break;
          }
      }
      if (!seen) {
          processor(id, partial);
          partials.push(partial);
      }
    }
  }

  find(value) {
    let node = this.root;
    const buffer = this.normalize(value, false);
    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i];
      if (!node.children[char]) {
        return [];
      }
      node = node.children[char];
    }
    return Array.from(node.ids);
  }

  findRanked(value, limit = 20) {
    const ids = this.find(value);
    const scored = [];
    for (const id of ids) {
      const text = this.lookup.get(id);
      if (text) {
        scored.push({ text, weight: this.weights.get(id) || 0 });
      }
    }
    scored.sort((a, b) => (b.weight - a.weight) || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
    return scored.slice(0, limit).map(entry => entry.text);
  }

  findFuzzy(value, limit = 20) {
    const query = this.normalize(value, false);
    if (query.length < 3) return [];
    const matches = [];
    for (const [id, text] of this.lookup) {
      const candidate = this.normalize(text, false);
      if (Math.abs(candidate.length - query.length) > 2) continue;
      const distance = editDistance(query, candidate, 2);
      if (distance <= 2) {
        matches.push({ text, distance, weight: this.weights.get(id) || 0 });
      }
    }
    matches.sort((a, b) => (a.distance - b.distance) || (b.weight - a.weight) || (a.text < b.text ? -1 : 1));
    return matches.slice(0, limit).map(entry => entry.text);
  }
}

function editDistance(a, b, maxDistance) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = new Array(cols);
  let curr = new Array(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    const swap = prev; prev = curr; curr = swap;
  }
  return prev[cols - 1];
}

module.exports = new Trie(); // Singleton instance
