#!/usr/bin/env node
/**
 * Renders og/og.html to public/og.png (1200×630) with headless Chrome via the
 * running Vite dev server (so fonts and /img paths resolve).
 * Usage: npm run og   (needs `npm run dev` running on :5173)
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = path.join(ROOT, 'public', 'og.png');
execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1200,630', '--virtual-time-budget=6000', `--screenshot=${out}`, 'http://localhost:5173/og/og.html'], { stdio: 'ignore' });
console.log('wrote', out);
