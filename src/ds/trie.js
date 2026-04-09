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

  insert(id, value) {
    if (this.lookup.has(id)) {
      const oldValue = this.lookup.get(id);
      this.remove(id, oldValue);
    }
    this.lookup.set(id, value);
    this._process(id, value, (currentId, partial) => {
        this._insertPartial(currentId, partial);
    });
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
}

module.exports = new Trie(); // Singleton instance
