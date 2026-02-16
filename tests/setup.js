/**
 * Test setup - loads browser script files into the Vitest/jsdom environment.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadScript(relativePath) {
  const code = readFileSync(resolve(relativePath), 'utf-8');
  // Indirect eval executes in global scope
  (0, eval)(code);
}

// Load in dependency order (same as index.html)
loadScript('assets/js/config.js');
loadScript('assets/js/book-utils.js');
