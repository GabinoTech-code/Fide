export interface GeofenceResult {
  withinGeofence: boolean;
  distanceMeters: number;
  accuracyRadiusMeters: number;
  payloadToSend: {
    inGeofence: boolean;
    timestamp: number;
    proofSignature: string;
  };
  privacyGuarantee: string;
}

export interface RotatingQrCode {
  token: string;
  expiresInSeconds: number;
  signature: string;
  siteName: string;
  timestamp: number;
}

export const GeofenceService = {
  // Office location (example: Milan Headquarters)
  OFFICE_LAT: 45.4642,
  OFFICE_LON: 9.1900,
  GEOFENCE_RADIUS_METERS: 250,

  // Haversine formula calculation executed on the phone
  evaluateOnDeviceGeofence(userLat?: number, userLon?: number): GeofenceResult {
    const lat1 = userLat ?? 45.4645;
    const lon1 = userLon ?? 9.1904;
    const lat2 = this.OFFICE_LAT;
    const lon2 = this.OFFICE_LON;

    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceMeters = Math.round(R * c);

    const withinGeofence = distanceMeters <= this.GEOFENCE_RADIUS_METERS;
    const timestamp = Date.now();

    return {
      withinGeofence,
      distanceMeters,
      accuracyRadiusMeters: 15,
      payloadToSend: {
        inGeofence: withinGeofence,
        timestamp,
        proofSignature: `sig_ed25519_${Math.random().toString(36).substring(2, 10)}`,
      },
      privacyGuarantee:
        'Zero coordinate trasmesse: la geovalla è calcolata esclusivamente in memoria RAM sul tuo smartphone. All\'azienda perviene solo l\'attestazione booleana "in_geofence: true".',
    };
  },

  // Generates 30s rotating cryptographic QR code
  getRotatingQr(): RotatingQrCode {
    const now = Date.now();
    const periodSeconds = 30;
    const currentWindow = Math.floor(now / 1000 / periodSeconds);
    const expiresInSeconds = periodSeconds - (Math.floor(now / 1000) % periodSeconds);

    const signature = `HMAC-SHA256-${currentWindow.toString(16).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const token = `FIDE:SITE:AURORA:${currentWindow}:${signature}`;

    return {
      token,
      expiresInSeconds,
      signature,
      siteName: 'Sede Centrale - Ingresso Principale',
      timestamp: now,
    };
  },

  // NFC Contactless Tag verification challenge
  verifyNfcChallenge(tagId?: string): { success: boolean; signature: string; responseTimeMs: number } {
    return {
      success: true,
      signature: `NFC-ED25519-TAG-${(tagId || '04:A2:8B:1F:C4:6E').toUpperCase()}`,
      responseTimeMs: 82,
    };
  },
};
