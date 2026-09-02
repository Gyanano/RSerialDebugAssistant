import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LogEntry } from '../types';
import { useTranslation } from '../i18n';

/**
 * Event-driven serial log state (RFC #3 Step 4): replaces the 100 ms
 * full-clone polling of `get_logs` with a one-shot snapshot + incremental
 * `serial://frames` batches.
 *
 * Invariants:
 * - Snapshot carries (epoch, session); a snapshot that raced a `clear_logs`
 *   (epoch mismatch) or a newer snapshot (ticket) is discarded — cleared
 *   logs never resurrect.
 * - Batches dedupe by seq: frames already covered by the snapshot or a
 *   prior batch are skipped; frames from before a clear are skipped.
 * - A batch whose session differs from the current one triggers a resync
 *   snapshot instead of an append (seq restarts at 1 per session).
 * - `dropped_before > 0` inserts a placeholder row so channel overload is
 *   visible instead of silent.
 */

interface FrameDto {
  session: number;
  seq: number;
  direction: 'Sent' | 'Received';
  len: number;
  timestamp: string;
  display_text: string;
  timestamp_formatted: string | null;
}

interface FrameBatchDto {
  session: number;
  first_seq: number;
  dropped_before: number;
  frames: FrameDto[];
}

interface LogsSnapshot {
  epoch: number;
  session: number;
  entries: LogEntry[];
}

/** Mirrors the backend default (`SerialManager::new`, clamped 100..10000). */
const MAX_ENTRIES = 1000;

export function useSerialLogs(enabled: boolean) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const epochRef = useRef(0);
  const sessionRef = useRef(0);
  const lastSeqRef = useRef(0);
  const clearedSeqRef = useRef(0);
  const pendingRef = useRef<LogEntry[]>([]);
  const rafRef = useRef<number | null>(null);
  const snapTicketRef = useRef(0);

  const flushPending = useCallback(() => {
    rafRef.current = null;
    if (pendingRef.current.length === 0) return;
    const batch = pendingRef.current;
    pendingRef.current = [];
    setLogs((prev) => {
      const next = [...prev, ...batch];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flushPending);
    }
  }, [flushPending]);

  const takeSnapshot = useCallback(async () => {
    const ticket = ++snapTicketRef.current;
    try {
      const snap = await invoke<LogsSnapshot>('get_logs_snapshot');
      if (ticket !== snapTicketRef.current) return; // superseded by a newer snapshot
      if (snap.epoch !== epochRef.current) return; // raced a clear: discard
      epochRef.current = snap.epoch;
      sessionRef.current = snap.session;
      lastSeqRef.current = snap.entries.reduce((m, e) => Math.max(m, e.seq ?? 0), 0);
      pendingRef.current = [];
      setLogs(snap.entries);
    } catch (error) {
      console.error('Failed to take logs snapshot:', error);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void takeSnapshot();

    listen<FrameBatchDto>('serial://frames', (event) => {
      if (disposed) return;
      const b = event.payload;
      if (b.session !== sessionRef.current) {
        void takeSnapshot(); // session changed: seq restarted, resync instead of append
        return;
      }

      const fresh: LogEntry[] = [];
      if (b.dropped_before > 0) {
        fresh.push({
          timestamp: new Date().toISOString(),
          direction: 'Received',
          data: [],
          format: 'Text',
          port_name: '',
          display_text: t('logViewer.framesDropped').replace('{n}', String(b.dropped_before)),
          timestamp_formatted: undefined,
          session: b.session,
          gap_key: `gap-${b.session}-${b.first_seq}`,
        });
      }
      for (const f of b.frames) {
        // Skip frames already covered by the snapshot/prior batches, and
        // frames that predate the last clear.
        if (f.seq <= lastSeqRef.current || f.seq <= clearedSeqRef.current) continue;
        fresh.push({
          timestamp: f.timestamp,
          direction: f.direction,
          data: [],
          format: 'Text',
          port_name: '',
          display_text: f.display_text,
          timestamp_formatted: f.timestamp_formatted ?? undefined,
          seq: f.seq,
          session: f.session,
        });
        lastSeqRef.current = f.seq;
      }
      if (fresh.length > 0) {
        pendingRef.current.push(...fresh);
        scheduleFlush(); // rAF-throttled append
      }
    })
      .then((u) => {
        unlisten = u;
      })
      .catch((error) => console.error('Failed to listen serial://frames:', error));

    return () => {
      disposed = true;
      unlisten?.();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, takeSnapshot, scheduleFlush]);

  const clearLogs = useCallback(async () => {
    try {
      const epoch = await invoke<number>('clear_logs');
      epochRef.current = epoch;
      clearedSeqRef.current = lastSeqRef.current;
      pendingRef.current = [];
      setLogs([]);
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  }, []);

  return { logs, clearLogs };
}
