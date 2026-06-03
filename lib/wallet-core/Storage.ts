// @ts-nocheck
/*
 * Copyright (c) 2018 Gnock
 * Copyright (c) 2018-2019 The Masari Project
 * Copyright (c) 2018-2020 The Karbo developers
 * Copyright (c) 2018-2023 Conceal Community, Conceal.Network & Conceal Devs
 *
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

interface StorageInterface {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string, defaultValue: any): Promise<any>;
  keys(): Promise<string[]>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

class LocalStorageBackend implements StorageInterface {
  setItem(key: string, value: string): Promise<void> {
    window.localStorage.setItem(key, value);
    return Promise.resolve();
  }

  getItem(key: string, defaultValue: any = null): Promise<string | any> {
    const value = window.localStorage.getItem(key);
    if (value === null) return Promise.resolve(defaultValue);
    return Promise.resolve(value);
  }

  keys(): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; ++i) {
      const k = window.localStorage.key(i);
      if (k !== null) keys.push(k);
    }
    return Promise.resolve(keys);
  }

  remove(key: string): Promise<void> {
    window.localStorage.removeItem(key);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    window.localStorage.clear();
    return Promise.resolve();
  }
}

class IndexedDBStorage implements StorageInterface {
  private db: IDBDatabase | null = null;
  private readonly dbName = "mydb";
  private readonly storeName = "storage";
  /** Bump when schema changes (v2 ensures object store exists). */
  private readonly dbVersion = 2;
  private ready: Promise<void> = Promise.resolve();

  constructor() {
    this.ready = this.openDatabase();
  }

  private openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is not available"));
        return;
      }

      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "key" });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
        };
        resolve();
      };

      request.onerror = () => {
        reject(request.error ?? new Error("IndexedDB open failed"));
      };

      request.onblocked = () => {
        reject(new Error("IndexedDB open blocked — close other tabs using this wallet"));
      };
    });
  }

  private async ensureDb(): Promise<IDBDatabase> {
    try {
      await this.ready;
    } catch {
      this.ready = this.openDatabase();
      await this.ready;
    }

    if (!this.db) {
      this.ready = this.openDatabase();
      await this.ready;
    }

    if (!this.db) {
      throw new Error("IndexedDB database is not available");
    }

    return this.db;
  }

  async setItem(key: string, value: string): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.put({ key, value });

      request.onerror = () => reject(request.error ?? new Error("IndexedDB setItem failed"));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("IndexedDB setItem failed"));
    });
  }

  async getItem(key: string, defaultValue: any = null): Promise<string | any> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result ? request.result.value : defaultValue;
        resolve(result);
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB getItem failed"));
    });
  }

  async keys(): Promise<string[]> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB keys failed"));
    });
  }

  async remove(key: string): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(key);

      request.onerror = () => reject(request.error ?? new Error("IndexedDB remove failed"));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB remove failed"));
    });
  }

  async clear(): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error ?? new Error("IndexedDB clear failed"));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB clear failed"));
    });
  }
}

let storageBackend: StorageInterface | null = null;

function resolveStorage(): StorageInterface {
  if (storageBackend) return storageBackend;

  if (typeof window === "undefined") {
    throw new Error("Storage is only available in the browser");
  }

  if (typeof indexedDB !== "undefined") {
    storageBackend = new IndexedDBStorage();
  } else {
    storageBackend = new LocalStorageBackend();
  }

  return storageBackend;
}

async function withStorage<T>(operation: (storage: StorageInterface) => Promise<T>): Promise<T> {
  try {
    return await operation(resolveStorage());
  } catch (error) {
    if (typeof window !== "undefined" && !(storageBackend instanceof LocalStorageBackend)) {
      storageBackend = new LocalStorageBackend();
      return operation(storageBackend);
    }
    throw error;
  }
}

export class Storage {
  static clear(): Promise<void> {
    return withStorage((storage) => storage.clear());
  }

  static getItem(key: string, defaultValue: any = null): Promise<any> {
    return withStorage((storage) => storage.getItem(key, defaultValue));
  }

  static keys(): Promise<string[]> {
    return withStorage((storage) => storage.keys());
  }

  static remove(key: string): Promise<void> {
    return withStorage((storage) => storage.remove(key));
  }

  static removeItem(key: string): Promise<void> {
    return withStorage((storage) => storage.remove(key));
  }

  static setItem(key: string, value: any): Promise<void> {
    return withStorage((storage) => storage.setItem(key, value));
  }
}
