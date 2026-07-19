export type DeviceVaultStatus = 'CHECKING' | 'ACTIVE' | 'UNAVAILABLE';

export interface DeviceVaultDescriptor {
  status: DeviceVaultStatus;
  label: string;
  detail: string;
}

interface EncryptedRecord {
  id: string;
  ciphertext: ArrayBuffer;
  iv: ArrayBuffer;
  updatedAt: number;
}

interface KeyRecord {
  id: string;
  key: CryptoKey;
}

const DATABASE_NAME = 'sera-device-vault';
const DATABASE_VERSION = 1;
const RECORDS_STORE = 'encrypted-records';
const KEYS_STORE = 'device-keys';
const KEY_ID = 'primary';

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window) || !window.crypto?.subtle) {
    throw new Error('This browser does not support the encrypted local vault.');
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORDS_STORE)) database.createObjectStore(RECORDS_STORE, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(KEYS_STORE)) database.createObjectStore(KEYS_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open the local vault.'));
  });
}

async function getDeviceKey(database: IDBDatabase): Promise<CryptoKey> {
  const readTransaction = database.transaction(KEYS_STORE, 'readonly');
  const existing = await requestResult(readTransaction.objectStore(KEYS_STORE).get(KEY_ID)) as KeyRecord | undefined;
  await transactionDone(readTransaction);
  if (existing?.key) return existing.key;

  const key = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const writeTransaction = database.transaction(KEYS_STORE, 'readwrite');
  writeTransaction.objectStore(KEYS_STORE).put({ id: KEY_ID, key } satisfies KeyRecord);
  await transactionDone(writeTransaction);
  return key;
}

async function encrypt(value: unknown, key: CryptoKey): Promise<Pick<EncryptedRecord, 'ciphertext' | 'iv'>> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plainText = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainText);
  return { ciphertext, iv: iv.buffer };
}

async function decrypt<T>(record: EncryptedRecord, key: CryptoKey): Promise<T> {
  const plaintext = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, key, record.ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/**
 * Browser-owned encrypted storage. It never sends records to SERA Core.
 * A non-extractable AES key stays in the same browser profile as the vault.
 */
export class DeviceMemoryVault {
  public async get<T>(id: string): Promise<T | null> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(RECORDS_STORE, 'readonly');
      const record = await requestResult(transaction.objectStore(RECORDS_STORE).get(id)) as EncryptedRecord | undefined;
      await transactionDone(transaction);
      if (!record) return null;
      return decrypt<T>(record, await getDeviceKey(database));
    } finally {
      database.close();
    }
  }

  public async set(id: string, value: unknown): Promise<void> {
    const database = await openDatabase();
    try {
      const key = await getDeviceKey(database);
      const encrypted = await encrypt(value, key);
      const transaction = database.transaction(RECORDS_STORE, 'readwrite');
      transaction.objectStore(RECORDS_STORE).put({ id, ...encrypted, updatedAt: Date.now() } satisfies EncryptedRecord);
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }

  public async delete(id: string): Promise<void> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(RECORDS_STORE, 'readwrite');
      transaction.objectStore(RECORDS_STORE).delete(id);
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }
}

export const deviceMemoryVault = new DeviceMemoryVault();

export function deviceVaultDescriptor(status: DeviceVaultStatus): DeviceVaultDescriptor {
  if (status === 'ACTIVE') {
    return { status, label: 'Local chat continuity', detail: 'Encrypted in this browser profile. It keeps chat visible after reopening and is not SERA cognitive memory.' };
  }
  if (status === 'UNAVAILABLE') {
    return { status, label: 'Local chat continuity unavailable', detail: 'This browser is not allowing encrypted IndexedDB storage.' };
  }
  return { status, label: 'Checking local chat continuity…', detail: 'Verifying encrypted browser storage.' };
}
