import Database from 'better-sqlite3';
import { createDecipheriv } from 'crypto';

const db = new Database('/data/asspp.db');
const row = db.prepare('SELECT encrypted_data FROM account_pool WHERE id = 13').get();

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

const creds = JSON.parse(decrypted);
console.log('Has password:', !!creds.password);
console.log('Has passwordToken:', !!creds.passwordToken);
console.log('Has DSID:', !!creds.DSID);
console.log('Has cookies:', !!creds.cookies);
console.log('passwordToken length:', creds.passwordToken ? creds.passwordToken.length : 0);
console.log('passwordToken preview:', creds.passwordToken ? creds.passwordToken.substring(0, 20) + '...' : 'null');
