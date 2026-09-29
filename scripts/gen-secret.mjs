import crypto from 'node:crypto';
process.stdout.write(crypto.randomBytes(48).toString('hex') + '\n');
