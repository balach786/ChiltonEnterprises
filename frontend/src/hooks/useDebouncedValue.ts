import * as React from 'react';

/**
 * Debounce a fast-changing value (search boxes, token filters) so typing does not fire one
 * API request per keystroke. 300 ms is short enough to feel instant and long enough to collapse
 * a burst of keystrokes into a single request on a slow connection.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
