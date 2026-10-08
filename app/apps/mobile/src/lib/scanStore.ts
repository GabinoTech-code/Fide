// Hands the scanned kiosk token from the scanner modal back to the punch screen
// without putting it in the URL (it would end up in navigation history).
type Listener = (token: string) => void;

let listener: Listener | null = null;

export const scannedToken = {
  set(token: string) {
    listener?.(token);
  },
  listen(fn: Listener) {
    listener = fn;
    return () => {
      if (listener === fn) listener = null;
    };
  },
};
