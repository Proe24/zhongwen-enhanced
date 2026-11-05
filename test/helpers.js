// Load the real shipped dictionary table once for tests that need it.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

let _dict = null;
export function loadTestDict() {
  if (_dict) return _dict;
  const words = JSON.parse(gunzipSync(readFileSync(new URL('../public/dict/words.json.gz', import.meta.url))).toString('utf8'));
  const hsk = JSON.parse(gunzipSync(readFileSync(new URL('../public/dict/hsk.json.gz', import.meta.url))).toString('utf8'));
  _dict = { words: words.words, hsk };
  return _dict;
}
