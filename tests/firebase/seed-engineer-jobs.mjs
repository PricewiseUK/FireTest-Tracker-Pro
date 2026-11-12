import { createRequire } from 'node:module';
import { engineerJobFixtures, engineerJobProject } from '../fixtures/engineerJobs.mjs';

// Explicit emulator-only tool. Never reads .firebaserc, production credentials,
// application defaults, or any real customer/checklist records.
if (process.env.GCLOUD_PROJECT !== engineerJobProject || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') throw new Error('LOCAL_JOB_EMULATORS_REQUIRED');
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { Firestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: engineerJobProject, credential: { async getAccessToken() { return { access_token: 'owner', expires_in: 3600 }; } } }, 'job-fixtures');
const db = new Firestore({ projectId: engineerJobProject, host: '127.0.0.1:8080', ssl: false });
try {
  const auth = getAuth(app);
  for (const uid of ['office-alpha','engineer-alpha']) {
    try { await auth.getUser(uid); }
    catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
      await auth.createUser({ uid, email: `${uid}@example.test`, password: 'Synthetic-local-jobs-2026!', displayName: uid.startsWith('office') ? 'Synthetic Office' : 'Synthetic Engineer alpha' });
    }
  }
  const batch = db.batch();
  for (const [path, value] of Object.entries(engineerJobFixtures())) batch.set(db.doc(path), value);
  await batch.commit(); console.log('Seeded synthetic engineer/office accounts, customer/site snapshots, assets, approved synthetic templates and scheduled jobs in local demo emulators only.');
} finally { await db.terminate(); await deleteApp(app); }
