import { useState, useEffect } from 'react';

/**
 * Custom hook to debounce value changes (e.g., 750ms for text inputs).
 * Prevents excessive API / auto-save calls while user is actively typing.
 * 
 * @param {any} value - The input value to debounce
 * @param {number} delay - Debounce delay in milliseconds (default: 750ms)
 * @returns {any} debouncedValue
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
