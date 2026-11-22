import { store } from "./store";

/**
 * The generation record, one schema for every route that opens it (the store keeps the first schema it was opened
 * with, so a route opening it with fewer tables would leave the others missing).
 */
export const mediaDb = () =>
  store(
    "media",
    `CREATE TABLE IF NOT EXISTS uses (day TEXT NOT NULL, who TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, who, kind));
     CREATE TABLE IF NOT EXISTS spend (day TEXT PRIMARY KEY, tokens REAL NOT NULL);
     CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, chat TEXT NOT NULL, who TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, file TEXT, type TEXT);
     CREATE TABLE IF NOT EXISTS models (day TEXT NOT NULL, model TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL, tokens REAL NOT NULL, PRIMARY KEY (day, model));`,
  );
