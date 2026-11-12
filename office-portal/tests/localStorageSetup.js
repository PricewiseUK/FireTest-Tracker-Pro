import { beforeEach } from 'vitest';
import { LOCAL_JOBS_KEY } from '../src/scheduling/callouts/localJobStorage.js';

beforeEach(() => { if (typeof localStorage !== 'undefined') localStorage.removeItem(LOCAL_JOBS_KEY); });
