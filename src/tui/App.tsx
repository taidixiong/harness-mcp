import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { Box, useApp, useInput, useStdout } from 'ink';
import { Header } from './components/Header.js';
import { StatusBar } from './components/StatusBar.js';
import { Dashboard } from './Dashboard.js';
import { Board } from './Board.js';
import { AgentPanel } from './AgentPanel.js';
import { LiveFeed } from './LiveFeed.js';
import type { HarnessStore } from '../state/store.js';
import type { HarnessEvent } from '../state/events.js';
import { eventBus } from '../state/events.js';

interface AppProps {
  store: HarnessStore;
  projectName: string;
  pipelineStatus: 'idle' | 'running' | 'complete' | 'error';
}

const BATCH_INTERVAL_MS = 300;

const MemoHeader = memo(Header);
const MemoDashboard = memo(Dashboard);
const MemoBoard = memo(Board);
const MemoAgentPanel = memo(AgentPanel);
const MemoLiveFeed = memo(LiveFeed);
const MemoStatusBar = memo(StatusBar);

export function App({ store, projectName, pipelineStatus }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [activeTab, setActiveTab] = useState(0);
  const [events, setEvents] = useState<HarnessEvent[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [toolCallCounts, setToolCallCounts] = useState<Record<string, number>>({});
  const [elapsed, setElapsed] = useState('00:00');
  const [rows, setRows] = useState(stdout.rows ?? 24);
  const [storeVersion, setStoreVersion] = useState(0);
  const startTimeRef = useRef(Date.now());

  // Buffers for batching event-driven state updates
  const pendingEventsRef = useRef<HarnessEvent[]>([]);
  const pendingToolCountsRef = useRef<Record<string, number>>({});
  const flushScheduledRef = useRef(false);

  const flushPending = useCallback(() => {
    flushScheduledRef.current = false;
    const batch = pendingEventsRef.current;
    const toolBatch = pendingToolCountsRef.current;
    pendingEventsRef.current = [];
    pendingToolCountsRef.current = {};

    if (batch.length > 0) {
      setEvents((prev) => [...prev, ...batch].slice(-500));
    }
    if (Object.keys(toolBatch).length > 0) {
      setToolCallCounts((prev) => {
        const next = { ...prev };
        for (const [name, count] of Object.entries(toolBatch)) {
          next[name] = (next[name] ?? 0) + count;
        }
        return next;
      });
    }
  }, []);

  useInput((input) => {
    if (input === '1') setActiveTab(0);
    if (input === '2') setActiveTab(1);
    if (input === '3') setActiveTab(2);
    if (input === '4') setActiveTab(3);
    if (input === 'q') exit();
  });

  // Track terminal resize (debounced)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => setRows(stdout.rows ?? 24), 100);
    };
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
      clearTimeout(timeout);
    };
  }, [stdout]);

  // Batched event handler — collect events, flush on timer
  useEffect(() => {
    const handler = (_type: string, event: HarnessEvent) => {
      pendingEventsRef.current.push(event);

      if (event.type === 'agent:start') setActiveAgent(event.agent ?? null);
      if (event.type === 'agent:complete') setActiveAgent(null);

      // Bump store version on task-level events so child components re-read state
      if (event.type === 'task:status_change' ||
          event.type === 'agent:start' || event.type === 'agent:complete') {
        setStoreVersion((v) => v + 1);
      }

      if (event.type === 'agent:event' && event.data) {
        const data = event.data as Record<string, unknown>;
        if (data.type === 'assistant' && data.message) {
          const msg = data.message as { content?: Array<{ type: string; name?: string }> };
          for (const block of msg.content ?? []) {
            if (block.type === 'tool_use' && block.name) {
              pendingToolCountsRef.current[block.name!] =
                (pendingToolCountsRef.current[block.name!] ?? 0) + 1;
            }
          }
        }
      }

      if (!flushScheduledRef.current) {
        flushScheduledRef.current = true;
        setTimeout(flushPending, BATCH_INTERVAL_MS);
      }
    };
    eventBus.on('*', handler);
    return () => { eventBus.off('*', handler); };
  }, [flushPending]);

  // Elapsed time — only update the string when it actually changes
  useEffect(() => {
    const interval = setInterval(() => {
      const next = formatElapsed(Date.now() - startTimeRef.current);
      setElapsed((prev) => (prev === next ? prev : next));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Snapshot store state only when storeVersion bumps (task-level events)
  const state = useMemo(() => store.getState(), [store, storeVersion]);

  const currentTaskId = useMemo(() => {
    const t = state.tasks.find((t) => !['inbox', 'done', 'failed'].includes(t.status));
    return t?.id ?? null;
  }, [state]);

  const currentStage = useMemo(() => {
    const t = state.tasks.find((t) => t.id === currentTaskId);
    return t?.status ?? null;
  }, [state, currentTaskId]);

  // Stable reference for recent events shown in Dashboard
  const recentEvents = useMemo(() => events.slice(-5), [events]);

  return (
    <Box flexDirection="column" height={rows}>
      <MemoHeader activeTab={activeTab} projectName={projectName} />
      <Box flexGrow={1}>
        {activeTab === 0 && <MemoDashboard store={store} recentEvents={recentEvents} />}
        {activeTab === 1 && <MemoBoard store={store} />}
        {activeTab === 2 && (
          <MemoAgentPanel
            activeAgent={activeAgent}
            activeResult={null}
            turnCount={0}
            maxTurns={40}
            toolCallCounts={toolCallCounts}
          />
        )}
        {activeTab === 3 && <MemoLiveFeed events={events} />}
      </Box>
      <MemoStatusBar
        pipelineStatus={pipelineStatus}
        currentTask={currentTaskId}
        currentStage={currentStage}
        elapsed={elapsed}
      />
    </Box>
  );
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
