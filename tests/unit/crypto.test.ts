import {
  generateSigningKeyPair,
  generateEncryptionKeyPair,
  sign,
  verify,
  encrypt,
  decrypt,
  fingerprint,
} from '../../src/core/crypto';

describe('crypto', () => {
  describe('signing', () => {
    test('verifies a valid signature', () => {
      const kp = generateSigningKeyPair();
      const data = Buffer.from('the quick brown fox');
      const sig = sign(kp.privateKey, data);
      expect(verify(kp.publicKey, data, sig)).toBe(true);
    });

    test('rejects a tampered payload', () => {
      const kp = generateSigningKeyPair();
      const sig = sign(kp.privateKey, Buffer.from('original'));
      expect(verify(kp.publicKey, Buffer.from('tampered'), sig)).toBe(false);
    });

    test('rejects a signature from another key', () => {
      const a = generateSigningKeyPair();
      const b = generateSigningKeyPair();
      const data = Buffer.from('payload');
      const sig = sign(a.privateKey, data);
      expect(verify(b.publicKey, data, sig)).toBe(false);
    });

    test('does not throw on malformed inputs', () => {
      expect(verify('not-a-key', Buffer.from('x'), 'not-a-sig')).toBe(false);
    });
  });

  describe('encryption (ECDH + AES-256-GCM)', () => {
    test('round-trips a message between two parties', () => {
      const alice = generateEncryptionKeyPair();
      const bob = generateEncryptionKeyPair();
      const plaintext = Buffer.from('top secret coordinates');

      const payload = encrypt(alice, bob.publicKey, plaintext);
      const recovered = decrypt(bob.privateKey, payload);

      expect(recovered.toString()).toBe('top secret coordinates');
      // Ciphertext must not leak the plaintext.
      expect(Buffer.from(payload.ciphertext, 'base64').toString()).not.toContain('secret');
    });

    test('a third party cannot decrypt', () => {
      const alice = generateEncryptionKeyPair();
      const bob = generateEncryptionKeyPair();
      const eve = generateEncryptionKeyPair();
      const payload = encrypt(alice, bob.publicKey, Buffer.from('for bob only'));
      expect(() => decrypt(eve.privateKey, payload)).toThrow();
    });

    test('detects ciphertext tampering via the GCM tag', () => {
      const alice = generateEncryptionKeyPair();
      const bob = generateEncryptionKeyPair();
      const payload = encrypt(alice, bob.publicKey, Buffer.from('integrity'));
      const tampered = { ...payload, ciphertext: Buffer.from('evil-bytes').toString('base64') };
      expect(() => decrypt(bob.privateKey, tampered)).toThrow();
    });
  });

  describe('fingerprint', () => {
    test('is stable and key-specific', () => {
      const kp = generateSigningKeyPair();
      expect(fingerprint(kp.publicKey)).toBe(fingerprint(kp.publicKey));
      expect(fingerprint(kp.publicKey)).not.toBe(fingerprint(generateSigningKeyPair().publicKey));
    });
  });
});
