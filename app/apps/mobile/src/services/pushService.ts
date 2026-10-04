export interface EncryptedPushPayload {
  messageId: string;
  timestamp: number;
  // What APNs / FCM sees:
  opaqueServerView: {
    to: 'device_token_apns_fcm_e81b...';
    priority: 'high';
    encryptedCiphertext: string; // Base64 ciphertext
    nonce: string; // 24-byte hex
    senderPublicKeyFingerprint: string;
    authTag: string; // Poly1305 MAC tag
  };
  // What the user sees after on-device X25519 decryption:
  decryptedClientView: {
    title: string;
    body: string;
    category: 'payroll' | 'leave_approval' | 'shift_change';
    actionTarget: string;
  };
}

export const PushService = {
  // Simulates an incoming encrypted push notification
  simulateEncryptedPush(
    title = 'Cedolino paga disponibile',
    body = 'Il cedolino del mese corrente è stato emesso ed è cifrato con la tua chiave.',
    category: 'payroll' | 'leave_approval' | 'shift_change' = 'payroll'
  ): EncryptedPushPayload {
    const now = Date.now();
    const nonce = 'f4a1882d91b01237e8ac440188b209e51c8841a0bc3190e2';
    const authTag = '77af1c9902bd4812a019ef8245b08c91';
    const encryptedCiphertext = 'ZXhwaXJlcz0xNzI4MTkyMDAwJnBheWxvYWQ9WDI1NTE5K1hDaGFDaGEyMC1Qb2x5MTMwNStFSUVFRQ==';

    return {
      messageId: `push_${now}`,
      timestamp: now,
      opaqueServerView: {
        to: 'device_token_apns_fcm_e81b...',
        priority: 'high',
        encryptedCiphertext,
        nonce,
        senderPublicKeyFingerprint: '7F3A 91C2 0B4E D815 66AF 2C90',
        authTag,
      },
      decryptedClientView: {
        title,
        body,
        category,
        actionTarget: 'docs',
      },
    };
  },
};
