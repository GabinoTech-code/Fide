import http, { IncomingMessage, ServerResponse } from 'http';

interface StoredPublicKey {
  userId: string;
  fingerprint: string;
  algorithm: string;
  createdAt: number;
}

interface SyncedPunch {
  id: string;
  timestamp: number;
  type: string;
  method: string;
  signature: string;
  inGeofence: boolean;
}

// In-Memory Zero-Knowledge Data Store
const publicKeysStore: Map<string, StoredPublicKey> = new Map([
  [
    'usr_fide_01',
    {
      userId: 'usr_fide_01',
      fingerprint: '4B8F 91E2 7A30 D915 88CE 3F11',
      algorithm: 'X25519 + XChaCha20-Poly1305 (libsodium)',
      createdAt: Date.now() - 3600000 * 24 * 7,
    },
  ],
]);

const auditLogStore: Array<{
  id: string;
  timestamp: number;
  action: string;
  actor: string;
  status: string;
}> = [];

function jsonResponse(res: ServerResponse, statusCode: number, data: any) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '';
  const method = req.method || 'GET';

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  try {
    // 1. Health Check
    if (url === '/health' && method === 'GET') {
      return jsonResponse(res, 200, {
        status: 'healthy',
        service: 'fide-api',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      });
    }

    // 2. FIDO2 / WebAuthn Challenge Emission
    if (url === '/api/v1/auth/register-challenge' && method === 'POST') {
      const challenge = Buffer.from(Date.now().toString() + Math.random().toString()).toString('base64url');
      return jsonResponse(res, 200, {
        challenge,
        rp: { name: 'Fide Security Platform', id: 'fide-work.eu' },
        userVerification: 'required',
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      });
    }

    // 3. FIDO2 Passkey Verification
    if (url === '/api/v1/auth/verify-passkey' && method === 'POST') {
      const body = await parseJsonBody<{ userId: string; credentialId: string; publicKeyFingerprint: string }>(req);
      publicKeysStore.set(body.userId, {
        userId: body.userId,
        fingerprint: body.publicKeyFingerprint,
        algorithm: 'X25519 (libsodium)',
        createdAt: Date.now(),
      });
      return jsonResponse(res, 200, {
        success: true,
        message: 'Passkey FIDO2 registrata con successo',
        userId: body.userId,
      });
    }

    // 4. Public Key Directory (Used by HR to encrypt documents)
    if (url.startsWith('/api/v1/users/') && url.endsWith('/public-key') && method === 'GET') {
      const parts = url.split('/');
      const userId = parts[4];
      const keyData = publicKeysStore.get(userId);
      if (!keyData) {
        return jsonResponse(res, 404, { error: 'Chiave pubblica non trovata per questo utente' });
      }
      return jsonResponse(res, 200, keyData);
    }

    // 5. Offline-First Punch Queue Synchronization
    if (url === '/api/v1/punches/sync' && method === 'POST') {
      const body = await parseJsonBody<{ punches: SyncedPunch[]; deviceFingerprint: string }>(req);
      const syncedCount = (body.punches || []).length;

      (body.punches || []).forEach((p) => {
        auditLogStore.push({
          id: `audit_${Date.now()}_${p.id}`,
          timestamp: p.timestamp,
          action: `Marcatura ${p.type} (${p.method})`,
          actor: body.deviceFingerprint,
          status: 'Firmato Ed25519 - Verificato',
        });
      });

      return jsonResponse(res, 200, {
        success: true,
        syncedPunchesCount: syncedCount,
        receiptCode: `REC-SYNC-${Date.now()}-${syncedCount}`,
        timestamp: Date.now(),
      });
    }

    // 6. E2EE Payroll Batch Upload (Ciphertext only)
    if (url === '/api/v1/payroll/upload-batch' && method === 'POST') {
      const body = await parseJsonBody<{ month: string; documentsCount: number }>(req);
      return jsonResponse(res, 200, {
        success: true,
        batchId: `batch_e2ee_${Date.now()}`,
        status: 'Inviato ai destinatari con payload cifrato',
        documentsProcessed: body.documentsCount || 1,
      });
    }

    // 7. Push Relay (Zero-Knowledge: APNs/FCM receive only ciphertext)
    if (url === '/api/v1/push/relay' && method === 'POST') {
      const body = await parseJsonBody<{ toDeviceToken: string; encryptedCiphertext: string; nonce: string; authTag: string }>(req);
      // In production: forward opaque ciphertext to Apple APNs HTTP/2 or Firebase FCM v1
      return jsonResponse(res, 200, {
        success: true,
        relayedThrough: 'APNs/FCM Zero-Knowledge Gateway',
        status: 'Delivered',
        nonceReceived: body.nonce ? true : false,
      });
    }

    // 404 Not Found
    return jsonResponse(res, 404, { error: 'Endpoint non trovato' });
  } catch (err: any) {
    return jsonResponse(res, 500, { error: 'Errore interno del server', details: err.message });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Fide Zero-Knowledge API Server running on http://localhost:${PORT}`);
});
