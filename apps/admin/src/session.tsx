import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { session, type User } from './api';
import { Feedback } from './ui';
const Context = createContext<{
  user: User | null;
  refresh: () => void;
  accept: (user: User | null) => void;
}>({ user: null, refresh: () => {}, accept: () => {} });
export const useSession = () => useContext(Context);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(),
    [error, setError] = useState<unknown>(),
    [generation, refresh] = useState(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    pending.current = controller;
    void session(controller.signal)
      .then((result) => {
        if (alive) {
          setUser(result);
          setError(undefined);
        }
      })
      .catch((failure) => {
        if (alive && !controller.signal.aborted) setError(failure);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [generation]);
  useEffect(() => {
    const reload = () => refresh((value) => value + 1);
    window.addEventListener('dsdocs-session-expired', reload);
    return () => window.removeEventListener('dsdocs-session-expired', reload);
  }, []);
  if (error) return <Feedback error={error} onRetry={() => refresh((value) => value + 1)} />;
  if (user === undefined) return <Feedback loading />;
  return (
    <Context.Provider
      value={{
        user,
        refresh: () => refresh((value) => value + 1),
        accept: (value) => {
          pending.current?.abort();
          setError(undefined);
          setUser(value);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function AuthGate({ children }: { children: ReactNode }) {
  const { user } = useSession(),
    location = useLocation();
  return user ? children : <Navigate to="/login" replace state={{ returnTo: location.pathname }} />;
}
