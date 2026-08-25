import Database from 'better-sqlite3';import fs from 'node:fs';import path from 'node:path';
const dbPath=process.env.DATABASE_PATH??path.resolve('data/chorequest.db');fs.mkdirSync(path.dirname(dbPath),{recursive:true});
export const db=new Database(dbPath);db.pragma('foreign_keys=ON');db.pragma('journal_mode=WAL');
export const now=()=>new Date().toISOString();export const id=()=>crypto.randomUUID();
export function migrate(){db.exec(fs.readFileSync(path.resolve('db/migrations/001_initial.sql'),'utf8'))}
