import { useState, useEffect } from 'react';

/**
 * Custom hook to delay value propagation until user pauses typing
 * @param {*} value - The input state value
 * @param {number} delay - Delay in milliseconds (default: 750ms)
 * @returns {*} debouncedValue
 */
export function useDebounce(value, delay = 750) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
