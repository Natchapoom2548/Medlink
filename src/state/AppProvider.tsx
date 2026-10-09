import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Session } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import { client, supabase } from '../lib/supabase';
import { Action, emptySnapshot, Profile, Snapshot } from '../domain/models';
import { errorMessage } from '../domain/utils';
interface State {
  session: Session | null;
  initializing: boolean;
  profile: Profile | null;
  data: Snapshot;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  mutate: (action: Action, payload: Record<string, unknown>) => Promise<{ id: string }>;
  logout: () => Promise<void>;
}
const Context = createContext<State | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [initializing, setInitializing] = useState(true),
    [data, setData] = useState<Snapshot>(emptySnapshot),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const generation = useRef(0),
    sequence = useRef(0),
    pending = useRef(new Map<string, string>());
  useEffect(() => {
    if (!supabase) {
      setInitializing(false);
      return;
    }
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (mounted) {
          if (error) setError(error.message);
          setSession(data.session);
          setInitializing(false);
        }
      })
      .catch((e) => {
        if (mounted) {
          setError(errorMessage(e));
          setInitializing(false);
        }
      });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (mounted) {
        if (sessionRef.current?.user.id !== next?.user.id) {
          generation.current++;
          setData(emptySnapshot());
          pending.current.clear();
        }
        sessionRef.current = next;
        setSession(next);
      }
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase?.auth.startAutoRefresh();
      else supabase?.auth.stopAutoRefresh();
    });
    supabase.auth.startAutoRefresh();
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      sub.remove();
      supabase?.auth.stopAutoRefresh();
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!sessionRef.current) return;
    const gen = generation.current,
      seq = ++sequence.current;
    setLoading(true);
    try {
      const entries = await Promise.all(
        Object.keys(emptySnapshot()).map(async (table) => {
          const rows: unknown[] = [];
          for (let from = 0; ; from += 1000) {
            const { data, error } = await client()
              .from(table)
              .select('*')
              .order(
                table === 'favorites'
                  ? 'equipment_id'
                  : table === 'conversation_reads'
                    ? 'conversation_id'
                    : 'id',
              )
              .range(from, from + 999);
            if (error) throw error;
            rows.push(...data);
            if (data.length < 1000) break;
          }
          return [table, rows];
        }),
      );
      if (gen === generation.current && seq === sequence.current) {
        setData(Object.fromEntries(entries) as unknown as Snapshot);
        setError('');
      }
    } catch (e) {
      if (gen === generation.current && seq === sequence.current) setError(errorMessage(e));
    } finally {
      if (gen === generation.current && seq === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!session?.user.id) {
      setData(emptySnapshot());
      setLoading(false);
      return;
    }
    void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 250);
    };
    const channel = client()
      .channel(`medlink-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public' }, schedule)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refresh();
      });
    const foreground = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 30000);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      foreground.remove();
      void client().removeChannel(channel);
    };
  }, [session?.user.id, refresh]);
  const mutate = useCallback(
    async (action: Action, payload: Record<string, unknown>) => {
      const key = JSON.stringify([action, payload]);
      const requestId = pending.current.get(key) ?? Crypto.randomUUID();
      pending.current.set(key, requestId);
      const { data, error } = await client().rpc('medlink_action', {
        p_action: action,
        p_payload: payload,
        p_request_id: requestId,
      });
      if (error) throw error;
      pending.current.delete(key);
      await refresh();
      return data as { id: string };
    },
    [refresh],
  );
  const logout = useCallback(async () => {
    const { error } = await client().auth.signOut({ scope: 'local' });
    if (error) throw error;
    generation.current++;
    setData(emptySnapshot());
    setSession(null);
  }, []);
  const profile = data.profiles.find((p) => p.id === session?.user.id) ?? null;
  return (
    <Context.Provider
      value={{ session, initializing, profile, data, loading, error, refresh, mutate, logout }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing AppProvider');
  return value;
}
