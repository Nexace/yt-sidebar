// Minimal Chrome DevTools Protocol driver over --remote-debugging-pipe (no dependencies).
import { spawn } from 'node:child_process';
export function launch(exe, args) {
  const p = spawn(exe, ['--remote-debugging-pipe', ...args], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const out = p.stdio[3], inp = p.stdio[4];
  let id = 0, buf = '';
  const pending = new Map(), handlers = [];
  inp.on('data', d => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      if (msg.id && pending.has(msg.id)) { const [res, rej] = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); }
      else handlers.forEach(h => h(msg));
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const m = { id: ++id, method, params }; if (sessionId) m.sessionId = sessionId;
    pending.set(m.id, [res, rej]); out.write(JSON.stringify(m) + '\0');
  });
  return { proc: p, send, on: h => handlers.push(h) };
}
export const wait = ms => new Promise(r => setTimeout(r, ms));
