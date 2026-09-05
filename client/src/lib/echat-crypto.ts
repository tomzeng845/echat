const DB_NAME = "echat-secure-vault";
const STORE = "keys";

function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function vaultGet<T>(key: string): Promise<T | undefined> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function vaultSet(key: string, value: unknown): Promise<void> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let value = "";
  bytes.forEach(byte => (value += String.fromCharCode(byte)));
  return btoa(value);
};
const base64ToBytes = (value: string) =>
  Uint8Array.from(atob(value), char => char.charCodeAt(0));

export async function ensureIdentity(account: string) {
  const key = `identity:${account}`;
  let pair = await vaultGet<CryptoKeyPair>(key);
  if (!pair) {
    pair = await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      false,
      ["encrypt", "decrypt"]
    );
    await vaultSet(key, pair);
  }
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { pair, publicJwk: JSON.stringify(publicJwk) };
}

export async function createConversationKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function sealKeyFor(key: CryptoKey, publicKeyJwk: string) {
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(publicKeyJwk),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
  const rawKey = await crypto.subtle.exportKey("raw", key);
  return bytesToBase64(
    new Uint8Array(
      await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawKey)
    )
  );
}

export async function openKeyEnvelope(account: string, envelope: string) {
  const { pair } = await ensureIdentity(account);
  const raw = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    pair.privateKey,
    base64ToBytes(envelope)
  );
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export const storeConversationKey = (
  conversationId: string,
  key: CryptoKey,
  keyVersion = 1
) => vaultSet(`conversation:${conversationId}:v${keyVersion}`, key);
export async function getConversationKey(
  conversationId: string,
  keyVersion = 1
) {
  const versioned = await vaultGet<CryptoKey>(
    `conversation:${conversationId}:v${keyVersion}`
  );
  return (
    versioned ??
    (keyVersion === 1
      ? vaultGet<CryptoKey>(`conversation:${conversationId}`)
      : undefined)
  );
}

export async function encryptMessage(key: CryptoKey, text: string) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(text)
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    nonce: bytesToBase64(nonce),
    algorithm: "AES-GCM-256",
  };
}

export async function decryptMessage(
  key: CryptoKey,
  ciphertext: string,
  nonce: string
) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(nonce) },
    key,
    base64ToBytes(ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}

export async function encryptBinary(key: CryptoKey, data: ArrayBuffer) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data
  );
  return {
    blob: new Blob([encrypted], { type: "application/octet-stream" }),
    nonce: bytesToBase64(nonce),
  };
}

export async function decryptBinary(
  key: CryptoKey,
  data: ArrayBuffer,
  nonce: string
) {
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(nonce) },
    key,
    data
  );
}
