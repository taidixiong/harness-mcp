import React, { useState, useEffect } from 'react';
import { Box, useApp, useInput } from 'ink';
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

export function App({ store, projectName, pipelineStatus }: AppProps) {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState(0);
  const [events, setEvents] = useState<HarnessEvent[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [toolCallCounts, setToolCallCounts] = useState<Record<string, number>>({});
  const [, setTick] = useState(0);
  const [startTime] = useState(Date.now());

  useInput((input) => {
    if (input === '1') setActiveTab(0);
    if (input === '2') setActiveTab(1);
    if (input === '3') setActiveTab(2);
    if (input === '4') setActiveTab(3);
    if (input === 'q') exit();
  });

  useEffect(() => {
    const handler = (_type: string, event: HarnessEvent) => {
      setEvents((prev) => [...prev.slice(-500), event]);
      if (event.type === 'agent:start') setActiveAgent(event.agent ?? null);
      if (event.type === 'agent:complete') setActiveAgent(null);
      if (event.type === 'agent:event' && event.data) {
        const data = event.data as Record<string, unknown>;
        if (data.type === 'assistant' && data.message) {
          const msg = data.message as { content?: Array<{ type: string; name?: string }> };
          for (const block of msg.content ?? []) {
            if (block.type === 'tool_use' && block.name) {
              setToolCallCounts((prev) => ({
                ...prev,
                [block.name!]: (prev[block.name!] ?? 0) + 1,
              }));
            }
          }
        }
      }
    };
    eventBus.on('*', handler);
    return () => { eventBus.off('*', handler); };
  }, []);

  // Tick for elapsed time
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsed = formatElapsed(Date.now() - startTime);
  const state = store.getState();
  const currentTask = state.tasks.find((t) => !['inbox', 'done', 'failed'].includes(t.status));

  return (
    <Box flexDirection="column" height={process.stdout.rows}>
      <Header activeTab={activeTab} projectName={projectName} />
      <Box flexGrow={1}>
        {activeTab === 0 && <Dashboard store={store} recentEvents={events} />}
        {activeTab === 1 && <Board store={store} />}
        {activeTab === 2 && (
          <AgentPanel
            activeAgent={activeAgent}
            activeResult={null}
            turnCount={0}
            maxTurns={40}
            toolCallCounts={toolCallCounts}
          />
        )}
        {activeTab === 3 && <LiveFeed events={events} />}
      </Box>
      <StatusBar
        pipelineStatus={pipelineStatus}
        currentTask={currentTask?.id ?? null}
        currentStage={currentTask?.status ?? null}
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
