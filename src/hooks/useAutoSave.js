import { useEffect, useRef, useState } from 'react';

/**
 * Custom hook to handle asynchronous background auto-saving to mock database
 * @param {Object} data - Current snapshot of the workspace data
 * @param {Function} mockSaveApi - Asynchronous function simulating remote storage
 * @returns {{ saveStatus: 'saved' | 'saving' | 'error' | 'idle', lastSaved: Date | null }}
 */
export function useAutoSave(data, mockSaveApi) {
  const [saveStatus, setSaveStatus] = useState('saved');
  const [lastSaved, setLastSaved] = useState(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    let isMounted = true;
    setSaveStatus('saving');

    const performSave = async () => {
      try {
        await mockSaveApi(data);
        if (isMounted) {
          setSaveStatus('saved');
          setLastSaved(new Date());
        }
      } catch (err) {
        if (isMounted) {
          setSaveStatus('error');
          console.error('Auto-save failure:', err);
        }
      }
    };

    performSave();

    return () => {
      isMounted = false;
    };
  }, [data, mockSaveApi]);

  return { saveStatus, lastSaved };
}
