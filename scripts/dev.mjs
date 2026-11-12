// Runs the game server (with reload) and the Vite dev server side by side.
import { spawn } from 'node:child_process';

const procs = [
  spawn('npx', ['tsx', 'watch', 'src/server/index.ts'], { stdio: 'inherit', shell: false }),
  spawn('npx', ['vite'], { stdio: 'inherit', shell: false }),
];

const stop = () => {
  for (const p of procs) p.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) stop(); });
