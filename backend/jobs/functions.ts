import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { JobError, ensure } from '../shared/jobContract.js';
import { JobService } from './service.js';

export const engineerJobs = onCall({ region: 'europe-west2', timeoutSeconds: 60 }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in as the assigned engineer.');
  try {
    const service = new JobService(getFirestore());
    if (request.data?.action === 'complete') return await service.complete(request.data.completion, request.auth.uid);
    if (request.data?.action === 'start') {
      ensure(request.data.engineerUid === request.auth.uid, 'The engineer session changed. Reload your assigned jobs.', 'permission-denied');
      return await service.start(request.data.companyId, request.data.jobId, request.data.expectedRevision, request.auth.uid);
    }
    throw new JobError('invalid-argument', 'Unsupported job operation.');
  } catch (error) {
    if (error instanceof JobError) throw new HttpsError(error.code, error.message);
    throw new HttpsError('unavailable', 'Job synchronisation could not be confirmed. Your local completion is preserved; retry the same operation.');
  }
});
