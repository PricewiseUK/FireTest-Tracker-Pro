import { parseFile } from './parseFile.js';
self.onmessage = async ({ data }) => {
  try { self.postMessage({ result: await parseFile(data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Unable to read this file.' }); }
};
