import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { TranscriptContext } from '@earendil-works/pi-ai';
import {
  fauxAssistantMessage,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';

import { startBica, type Bica, type Tab } from '../../testing/bica';
import type { TerminalCalls, TerminalTopics } from './protocol';

let bica: Bica;
beforeAll(async () => {
  bica = await startBica();
});
afterAll(() => bica?.stop());

const terminals = (tab: Tab) =>
  tab.extension<TerminalCalls, TerminalTopics>('terminals');

/** A git project with one commit, so worktrees can branch from it. */
async function repo(tab: Tab, name: string) {
  const cwd = join(bica.root, name);
  await mkdir(cwd, { recursive: true });
  const git = (...args: string[]) =>
    Bun.spawnSync(['git', ...args], { cwd }).exitCode;
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'Start');
  return tab.request('project.add', { path: cwd });
}

async function worktreeSession(tab: Tab, projectId: string) {
  bica.reply(fauxAssistantMessage('Ready'));
  const id = await tab.request('session.create', {
    projectId,
    prompt: 'Work in a worktree',
    worktree: true,
    requestId: crypto.randomUUID(),
  });
  const list = await tab
    .watch('sessions', {})
    .until((all) => all.some((s) => s.id === id && s.status !== 'running'));
  return list.find((s) => s.id === id)!.cwd!;
}

test('a terminal streams its output and takes input', async () => {
  const tab = await bica.connect();
  const term = terminals(tab);
  const ref = await bica.project(tab);
  const id = await term.request('create', {
    ...ref,
    command: 'printf "héllo 🌈\\n"; cat',
  });
  const screen = term.watch('output', { id });
  await screen.until((t) => t?.output.includes('héllo 🌈'));
  await term.request('input', { id, data: 'ping 🌈\n' });
  await screen.until((t) => t?.output.includes('ping 🌈'));
  await term.request('remove', { id });
});

test('stopping a terminal ends the processes its command started', async () => {
  const tab = await bica.connect();
  const term = terminals(tab);
  const ref = await bica.project(tab);
  const id = await term.request('create', {
    ...ref,
    command: 'sleep 60 & echo CHILD:$!; wait',
  });
  const screen = await term
    .watch('output', { id })
    .until((t) => /CHILD:\d+/.test(t?.output ?? ''));
  const pid = Number(screen!.output.match(/CHILD:(\d+)/)![1]);
  await term.request('stop', { id });
  const alive = () => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  for (let i = 0; i < 40 && alive(); i++) await Bun.sleep(25);
  expect(alive()).toBe(false);
  await term.request('remove', { id });
});

test('archiving a session closes the terminals its agent started', async () => {
  const tab = await bica.connect();
  const term = terminals(tab);
  const ref = await bica.project(tab, 'archive');
  const list = term.watch('list', {});
  bica.reply(
    fauxAssistantMessage(
      fauxToolCall('terminal_start', { command: 'sleep 60', wait: 0 }),
      { stopReason: 'toolUse' },
    ),
    fauxAssistantMessage('Started'),
  );
  const id = await tab.request('session.create', {
    ...ref,
    prompt: 'Start a server',
    requestId: crypto.randomUUID(),
  });
  await list.until((all) => all.some((t) => t.startedBy === id));
  const mine = await term.request('create', ref);
  await tab.request('session.archive', { id, archived: true });
  const after = await list.until((all) => !all.some((t) => t.startedBy === id));
  expect(after.map((t) => t.id)).toEqual([mine]);
  await term.request('remove', { id: mine });
});

test('cleaning up a worktree closes its terminals', async () => {
  const tab = await bica.connect();
  const term = terminals(tab);
  const projectId = await repo(tab, 'clean');
  const cwd = await worktreeSession(tab, projectId);
  const list = term.watch('list', {});
  await term.request('create', { projectId, cwd, command: 'sleep 60' });
  await list.until((all) => all.some((t) => t.cwd === cwd));
  await tab.request('worktree.cleanUp', { projectId, cwd, force: true });
  await list.until((all) => !all.some((t) => t.cwd === cwd));
});

// The tools a request offers: system messages add and remove them in order.
function toolsOf(context: TranscriptContext) {
  const tools = new Set<string>();
  for (const m of context.messages)
    if (m.role === 'system') {
      for (const t of m.toolsAdded ?? []) tools.add(t.name);
      for (const t of m.toolsRemoved ?? []) tools.delete(t.name);
    }
  return [...tools];
}

test('switched off, terminals take no requests, the agent loses its terminal tools, and clean up still works', async () => {
  const tab = await bica.connect();
  const term = terminals(tab);
  const ref = await bica.project(tab, 'off');
  await tab.request('extension.update', { id: 'terminals', on: false });
  await tab
    .watch('extensions', {})
    .until((list) => list.some((e) => e.id === 'terminals' && !e.on));

  expect(term.request('create', ref)).rejects.toThrow('Terminals is off');

  let tools: string[] = [];
  bica.reply((context) => {
    tools = toolsOf(context);
    return fauxAssistantMessage('No shells');
  });
  const id = await tab.request('session.create', {
    ...ref,
    prompt: 'Anything',
    requestId: crypto.randomUUID(),
  });
  await tab
    .watch('sessions', {})
    .until((all) => all.some((s) => s.id === id && s.status !== 'running'));
  expect(tools).toContain('bash');
  expect(tools.filter((t) => t.startsWith('terminal_'))).toEqual([]);

  const projectId = await repo(tab, 'off-clean');
  const cwd = await worktreeSession(tab, projectId);
  await tab.request('worktree.cleanUp', { projectId, cwd, force: true });
  await tab
    .watch('projects', {})
    .until((all) =>
      all.some(
        (p) => p.id === projectId && !p.workspaces.some((w) => w.path === cwd),
      ),
    );

  await tab.request('extension.update', { id: 'terminals', on: true });
});
