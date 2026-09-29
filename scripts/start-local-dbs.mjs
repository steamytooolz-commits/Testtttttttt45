import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localDb = path.join(root, '.local-db');

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

function findMongod() {
  const candidates = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === 'mongod.exe') candidates.push(full);
      else if (entry.isDirectory() && entry.name !== 'mongo') {
        try {
          walk(full);
        } catch {
        }
      }
    }
  };
  try {
    walk(path.join(localDb, 'mongo7'));
  } catch {
  }
  candidates.push('C:\\Program Files\\MongoDB\\Server\\8.3\\bin\\mongod.exe');
  return candidates.find((c) => fs.existsSync(c)) || null;
}

async function ensure(name, port, exe, args, cwd) {
  if (await isPortOpen(port)) {
    console.log(name + ' already listening on ' + port);
    return true;
  }
  if (!exe || !fs.existsSync(exe)) {
    console.log('FAILED: executable not found for ' + name + ': ' + exe);
    return false;
  }
  console.log('Starting ' + name + '...');
  const child = spawn(exe, args, { cwd: cwd || localDb, detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isPortOpen(port)) {
      console.log(name + ' is up on ' + port);
      return true;
    }
  }
  console.log('FAILED to start ' + name);
  return false;
}

const mongod = findMongod();
await ensure('MariaDB', 3306, 'C:\\Program Files\\MariaDB 12.3\\bin\\mariadbd.exe', ['--console']);
await ensure('MongoDB', 27017, mongod, ['--dbpath', path.join(localDb, 'mongo'), '--port', '27017', '--bind_ip', '127.0.0.1']);
await ensure('Redis', 6379, path.join(localDb, 'redis-bin', 'redis-server.exe'), ['--port', '6379'], path.join(localDb, 'redis-bin'));
console.log('Done. Start the site with: npm run dev');
