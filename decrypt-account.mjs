import Database from 'better-sqlite3';
import { createDecipheriv } from 'crypto';

const db = new Database('/data/asspp.db');
const row = db.prepare('SELECT encrypted_data FROM account_pool WHERE id = 8').get();

if (!row || !row.encrypted_data) {
  console.log('No encrypted data found');
  process.exit(1);
}

const key = Buffer.from('7fRAibugufzZ2Y7QJ/mZFblEQredMzQdQ8xApF/V91I=', 'base64');
const parts = row.encrypted_data.split(':');
const iv = Buffer.from(parts[0], 'hex');
const encrypted = Buffer.from(parts[1], 'hex');
const tag = Buffer.from(parts[2], 'hex');

const decipher = createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(tag);

const decrypted = Buffer.concat([
  decipher.update(encrypted),
  decipher.final(),
]).toString('utf-8');

console.log(JSON.stringify(JSON.parse(decrypted), null, 2));
