// IndexedDB wrapper (no frameworks)
const DB_NAME = 'my_cookbook_manager_v3';
const DB_VERSION = 1;

const Stores = {
  recipes: 'recipes',
  categories: 'categories',
  settings: 'settings'
};

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(Stores.recipes)) {
        const store = db.createObjectStore(Stores.recipes, { keyPath: 'id' });
        store.createIndex('byTitle', 'title', { unique: false });
        store.createIndex('byCategory', 'categoryId', { unique: false });
        store.createIndex('byFavorite', 'isFavorite', { unique: false });
      }

      if (!db.objectStoreNames.contains(Stores.categories)) {
        const store = db.createObjectStore(Stores.categories, { keyPath: 'id' });
        store.createIndex('byOrder', 'order', { unique: false });
      }

      if (!db.objectStoreNames.contains(Stores.settings)) {
        db.createObjectStore(Stores.settings, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(db, storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;

    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);

    result = fn(store);
  });
}

async function getAll(db, storeName) {
  return tx(db, storeName, 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

async function getOne(db, storeName, key) {
  return tx(db, storeName, 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

async function putOne(db, storeName, value) {
  return tx(db, storeName, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

async function deleteOne(db, storeName, key) {
  return tx(db, storeName, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  });
}

async function clearStore(db, storeName){
  return tx(db, storeName, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  });
}

async function setSetting(db, key, value) {
  return putOne(db, Stores.settings, { key, value });
}

async function getSetting(db, key, fallback) {
  const row = await getOne(db, Stores.settings, key);
  return row ? row.value : fallback;
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random()).replace('.', '');
}
