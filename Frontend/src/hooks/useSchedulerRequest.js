import { useCallback, useEffect, useRef, useState } from 'react';

export const useSchedulerRequest = (request, key, enabled = true) => {
  const [state, setState] = useState({ data: null, status: enabled ? 'loading' : 'idle', error: null });
  const requestRef = useRef(request);
  requestRef.current = request;

  const reload = useCallback(() => {
    if (!enabled) {
      setState({ data: null, status: 'idle', error: null });
      return () => {};
    }
    let active = true;
    setState((current) => ({ ...current, status: 'loading', error: null }));
    requestRef.current().then((data) => {
      if (active) setState({ data, status: 'success', error: null });
    }).catch((error) => {
      if (active) setState((current) => ({ ...current, status: 'error', error }));
    });
    return () => { active = false; };
  }, [enabled]);

  useEffect(() => reload(), [key, reload]);
  return { ...state, reload };
};
