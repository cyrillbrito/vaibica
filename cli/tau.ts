// The `tau` command: Tau's production server in the terminal, with keys to
// open the UI, the way Vite's dev server does. cli/build.ts compiles it into
// one binary, with the client, skills, and codemode's files embedded.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

type Listener = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

/** What the generated entry hands over: the built server and embedded file paths. */
export interface Build {
  version: string;
  load: () => Promise<{
    createListener: (options: { static: boolean }) => Listener;
    attach: (server: Server) => void;
  }>;
  /** URL path, such as `/assets/app.js`, to its embedded file. */
  client: Record<string, string>;
  /** Path inside `skills/` to its embedded file. */
  skills: Record<string, string>;
  wasm: string;
  worker: string;
}

const HELP = `Usage: tau [--port <port>]

  --port <port>  port to listen on, default 3141
  -v, --version  print the version
  -h, --help     show this

Data lives in ~/.tau/data, or in TAU_DATA_DIR.`;

const mac = platform() === 'darwin';
const CHROME_STATE = mac
  ? join(homedir(), 'Library/Application Support/Google/Chrome/Local State')
  : join(homedir(), '.config/google-chrome/Local State');

export async function run(build: Build) {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: '3141' },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) return console.log(HELP);
  if (values.version) return console.log(build.version);
  const port = Number(values.port);
  if (!Number.isInteger(port)) return fail(`Not a port: ${values.port}`);

  // Set before the server loads: its modules read them once.
  const data = (process.env.TAU_DATA_DIR ||= join(homedir(), '.tau/data'));
  process.env.TAU_SKILLS_DIR = unpackSkills(build.skills, data);
  process.env.TAU_CODEMODE_WASM = build.wasm;
  process.env.TAU_CODEMODE_WORKER = build.worker;

  const { createListener, attach } = await build.load();
  const listener = createListener({ static: false });
  const server = createServer(
    (req, res) =>
      void (sendEmbedded(build.client, req, res) || listener(req, res)),
  );
  attach(server);
  server.on('error', (error: NodeJS.ErrnoException) =>
    fail(
      error.code === 'EADDRINUSE'
        ? `Port ${port} is in use. Pick another with --port.`
        : error.message,
    ),
  );
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`;
    console.log(`\n  Tau ${build.version} running\n\n  Local:  ${url}\n`);
    if (process.stdin.isTTY) keys(url, join(data, 'chrome.json'));
  });

  const quit = () => {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    server.close();
    // Shells and agent runs end with the process; Pi Durable resumes runs on the next start.
    process.exit(0);
  };
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Skills must be real files: the agent reads them with its own tools. */
function unpackSkills(skills: Record<string, string>, data: string) {
  const dir = join(data, 'skills');
  rmSync(dir, { recursive: true, force: true });
  for (const [path, file] of Object.entries(skills)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), readFileSync(file));
  }
  return dir;
}

function sendEmbedded(
  client: Record<string, string>,
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const path = client[new URL(req.url ?? '/', 'http://localhost').pathname];
  if (!path) return false;
  const file = Bun.file(path);
  res.writeHead(200, {
    'Content-Type': file.type,
    'Content-Length': file.size,
    // Vite hashes the names of what it puts in assets/.
    'Cache-Control': req.url!.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate',
  });
  if (req.method === 'HEAD') res.end();
  else void file.bytes().then((bytes) => res.end(bytes));
  return true;
}

// Keys

interface Profile {
  dir: string;
  name: string;
}

function keys(url: string, settingsFile: string) {
  let profile = savedProfile(settingsFile);
  /** Digits typed after `p`, until Enter picks one. */
  let picking: string | null = null;
  let profiles: Profile[] = [];

  const menu = () =>
    console.log(
      [
        `  a  open as app (Chrome, profile ${profile?.name ?? 'none'})`,
        '  o  open in browser',
        '  p  pick Chrome profile',
        '  q  quit',
        '',
      ].join('\n'),
    );

  const pick = (index: number) => {
    picking = null;
    const chosen = profiles[index - 1];
    if (!chosen) return console.log('  No such profile.\n');
    profile = chosen;
    mkdirSync(dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, JSON.stringify({ profile: chosen.dir }) + '\n');
    console.log(`  Profile: ${chosen.name}\n`);
    menu();
  };

  menu();
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (key: string) => {
    // Raw mode turns Ctrl-C into a plain byte instead of SIGINT.
    if (key === '\x03' || key === '\x04')
      return process.kill(process.pid, 'SIGINT');
    if (picking !== null) {
      if (/^\d$/.test(key)) {
        picking += key;
        process.stdout.write(key);
        // One digit is enough when there are fewer than ten.
        if (profiles.length < 10) {
          process.stdout.write('\n');
          pick(Number(picking));
        }
      } else if (key === '\r' || key === '\n') {
        process.stdout.write('\n');
        if (picking) pick(Number(picking));
        else picking = null;
      } else {
        picking = null;
        console.log('\n  Cancelled.\n');
      }
      return;
    }
    if (key === 'q') return process.kill(process.pid, 'SIGINT');
    if (key === 'o') return openBrowser(url);
    if (key === 'a') {
      if (!hasChrome()) {
        console.log(
          '  Chrome is not installed. Opening the default browser.\n',
        );
        return openBrowser(url);
      }
      return openApp(url, profile?.dir ?? 'Default');
    }
    if (key === 'p') {
      profiles = chromeProfiles();
      if (!profiles.length) return console.log('  No Chrome profiles found.\n');
      console.log(
        profiles.map((p, i) => `  ${i + 1}  ${p.name} (${p.dir})`).join('\n'),
      );
      process.stdout.write('  Number: ');
      picking = '';
      return;
    }
    if (key === '\r' || key === '\n' || key === 'h' || key === '?') menu();
  });
}

function chromeProfiles(): Profile[] {
  try {
    const state = JSON.parse(readFileSync(CHROME_STATE, 'utf8'));
    const cache: Record<string, { name: string }> =
      state.profile?.info_cache ?? {};
    return Object.entries(cache).map(([dir, info]) => ({
      dir,
      name: info.name,
    }));
  } catch {
    return [];
  }
}

function savedProfile(file: string): Profile | undefined {
  const profiles = chromeProfiles();
  let dir = 'Default';
  try {
    dir = JSON.parse(readFileSync(file, 'utf8')).profile ?? dir;
  } catch {}
  return profiles.find((p) => p.dir === dir) ?? profiles[0];
}

function hasChrome() {
  return mac
    ? spawnSync('open', ['-Ra', 'Google Chrome']).status === 0
    : spawnSync('which', ['google-chrome']).status === 0;
}

function openApp(url: string, profileDir: string) {
  const args = [`--profile-directory=${profileDir}`, `--app=${url}`];
  if (mac) launch('open', ['-na', 'Google Chrome', '--args', ...args]);
  else launch('google-chrome', args);
}

function openBrowser(url: string) {
  launch(mac ? 'open' : 'xdg-open', [url]);
}

function launch(command: string, args: string[]) {
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}
