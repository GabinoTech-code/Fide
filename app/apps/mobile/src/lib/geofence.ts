// On-device geofence. Coordinates live only in this function's arguments: the
// caller passes a fresh fix and gets back a yes/no; nothing is stored or sent.

export interface SiteArea {
  latitude: number;
  longitude: number;
  radius_m: number;
}

export interface Fix {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy in metres (68% confidence), as reported by the OS. */
  accuracy: number | null;
}

export type GeofenceResult =
  | { status: 'inside' | 'outside'; distanceM: number }
  | { status: 'low_accuracy'; accuracyM: number | null };

/** Worse than this the fix can't tell a car park from the office: suggest the kiosk QR. */
export const MAX_ACCURACY_M = 100;
/** The fix's own uncertainty is credited up to this much. */
export const ACCURACY_CREDIT_M = 50;

const EARTH_RADIUS_M = 6_371_000;

export function distanceM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function evaluateGeofence(site: SiteArea, fix: Fix): GeofenceResult {
  if (fix.accuracy === null || !Number.isFinite(fix.accuracy) || fix.accuracy > MAX_ACCURACY_M) {
    return { status: 'low_accuracy', accuracyM: fix.accuracy };
  }
  const d = distanceM(site, fix);
  const allowed = site.radius_m + Math.min(fix.accuracy, ACCURACY_CREDIT_M);
  return { status: d <= allowed ? 'inside' : 'outside', distanceM: Math.round(d) };
}
