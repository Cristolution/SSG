import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits for GCM
const SALT_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16;  // 128 bits
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_DIGEST = 'sha256';

/**
 * Derives a CryptoKey from a password and salt using PBKDF2.
 * @param {string} password
 * @param {Buffer} salt
 * @returns {Promise<{key: Buffer, iv: Buffer}>}
 */
async function deriveKeyAndIV(password, salt) {
  return new Promise((resolve, reject) => {
    const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH + IV_LENGTH, PBKDF2_DIGEST);
    resolve({
      key: key.subarray(0, KEY_LENGTH),
      iv: key.subarray(KEY_LENGTH, KEY_LENGTH + IV_LENGTH),
    });
  });
}

/**
 * Encrypts plaintext using AES-256-GCM with PBKDF2 key derivation.
 * Output format: base64(salt + iv + ciphertext + tag)
 * @param {string} plaintext
 * @param {string} password
 * @returns {Promise<string>} base64-encoded encrypted data
 */
export async function encrypt(plaintext, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const { key, iv } = await deriveKeyAndIV(password, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Pack: salt (16) + iv (12) + ciphertext + tag (16)
  const result = Buffer.concat([salt, iv, encrypted, tag]);
  return result.toString('base64');
}

/**
 * Decrypts a base64-encoded ciphertext produced by encrypt().
 * @param {string} encryptedBase64
 * @param {string} password
 * @returns {Promise<string>} decrypted plaintext
 */
export async function decrypt(encryptedBase64, password) {
  const data = Buffer.from(encryptedBase64, 'base64');

  const salt = data.subarray(0, SALT_LENGTH);
  const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = data.subarray(data.length - TAG_LENGTH);
  const ciphertext = data.subarray(SALT_LENGTH + IV_LENGTH, data.length - TAG_LENGTH);

  const { key } = await deriveKeyAndIV(password, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
