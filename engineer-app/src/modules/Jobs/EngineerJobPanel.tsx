import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import InstafireDialog from '../../components/InstafireDialog';
import { assignedJobs, jobCompletionOutbox, jobSyncError, startAssignedJob } from '../../services/jobSynchronisation';
import { currentDraftSession, inspectionDraftStorage } from '../../services/inspectionDraftStorage';
import type { DraftResult } from '../../services/localInspectionDraftStore';
import type { CompletionSeed } from '../../services/localJobCompletionOutbox';
import { ensure, type JobV1 } from '../../../../backend/shared/jobContract';
import { completionFromDrafts } from '../Extinguishers/jobCompletionDraft';

/** Small engineer completion control in the existing Testing tab. No office UI,
 * routing changes, live checklist listeners or production demonstration records. */
export default function EngineerJobPanel({ companyId, userId }: { companyId: string; userId: string }) {
  const [rows, setRows] = useState<{ id: string; job: JobV1 }[]>([]);
  const [pending, setPending] = useState<{ jobId: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [cached, setCached] = useState(false);
  const [review, setReview] = useState<{ id: string; job: JobV1; drafts: DraftResult[] } | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<CompletionSeed | null>(null);
  const refresh = useCallback(async () => {
    const outbox = jobCompletionOutbox.forCompany(companyId);
    const pendingIds = await outbox.pendingJobs();
    setPending(pendingIds.map(jobId => ({ jobId, status: 'Completed / Pending Sync' })));
    const assignments = await assignedJobs(companyId, userId);
    outbox.assertCurrentSession(); setRows(assignments.rows); setCached(assignments.fromCache);
  }, [companyId, userId]);
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (failure) { setError(jobSyncError(failure)); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => {
    if (currentDraftSession().userId !== userId) return;
    let active = true;
    const reload = () => { void Promise.resolve().then(refresh).catch(failure => { if (active) setError(jobSyncError(failure)); }).finally(() => { if (active) setLoading(false); }); };
    const unsubscribe = jobCompletionOutbox.forCompany(companyId).subscribe(reload);
    reload();
    return () => { active = false; unsubscribe(); };
  }, [refresh, companyId, userId]);
  const button = (label: string, action: () => void, disabled = false) => <TouchableOpacity accessibilityRole="button" disabled={busy || disabled} style={[styles.button, (busy || disabled) && styles.disabled]} onPress={action}><Text style={styles.text}>{label}</Text></TouchableOpacity>;
  return <View style={styles.container}>
    <Text style={styles.heading}>ASSIGNED JOBS</Text>
    <Text style={styles.muted}>Checks stay on this device until you explicitly confirm job completion. Completion does not submit work for office approval.</Text>
    {cached && <Text style={styles.muted}>Saved assignments — the server will recheck assignment and revision when synchronising.</Text>}
    {loading && <ActivityIndicator color="#FF641C" />}
    {!!error && <Text accessibilityRole="alert" style={styles.warning}>{error}</Text>}
    {button('REFRESH JOBS & SYNC STATUS', () => { void run(refresh); })}
    {pending.map(item => <View style={styles.card} key={item.jobId}><Text style={styles.text}>{item.jobId}: {item.status}</Text>
      {button('RETRY SAME COMPLETION', () => { void run(async () => { await jobCompletionOutbox.forCompany(companyId).sync(item.jobId); await refresh(); }); })}</View>)}
    {review ? <FlatList data={review.job.assets} keyExtractor={asset => asset.assetDocId} ListHeaderComponent={<Text style={styles.text}>Select the saved inspection for each assigned asset. Use the extinguisher register to record or resume checks.</Text>} renderItem={({ item }) => <View style={styles.card}>
      <Text style={styles.text}>{item.assetDocId}</Text>
      {review.drafts.filter(result => result.draft.assetDocId === item.assetDocId).map(result => <React.Fragment key={result.draft.inspectionId}>
        {button(`${selected[item.assetDocId] === result.draft.inspectionId ? 'SELECTED: ' : 'USE: '}${result.draft.inspectionId}`, () => setSelected(previous => ({ ...previous, [item.assetDocId]: result.draft.inspectionId })), !result.canEdit || result.recovered)}
      </React.Fragment>)}
    </View>} ListFooterComponent={<>
      {button('REVIEW COMPLETION', () => { void run(async () => {
        const site = inspectionDraftStorage.forSite(companyId, review.job.siteId);
        const results = await Promise.all(review.job.assets.map(asset => {
          ensure(selected[asset.assetDocId], 'Select a saved draft for every asset.', 'failed-precondition');
          return site.load(selected[asset.assetDocId]);
        }));
        ensure(!results.some(result => !result), 'Selected draft could not be read. Existing copies are preserved.', 'failed-precondition');
        setConfirmation(completionFromDrafts(review.id, review.job, userId, results as DraftResult[]));
      }); })}
      {button('BACK TO JOBS', () => setReview(null))}
    </>} /> : <FlatList data={rows} keyExtractor={row => row.id} ListEmptyComponent={!loading ? <Text style={styles.muted}>No assigned jobs are available.</Text> : undefined} renderItem={({ item }) => <View style={styles.card}>
      <Text style={styles.text}>{item.job.customer.name} / {item.job.site.name}</Text>
      <Text style={styles.muted}>{item.job.inspectionType} — {pending.some(p => p.jobId === item.id) ? 'Completed / Pending Sync' : item.job.workStatus}</Text>
      {item.job.workStatus === 'scheduled' && !pending.some(p => p.jobId === item.id) && button('START JOB', () => { void run(async () => { await startAssignedJob(companyId, item.id, item.job.revision); await refresh(); }); })}
      {item.job.workStatus !== 'completed' && !pending.some(p => p.jobId === item.id) && button('SELECT SAVED INSPECTIONS', () => { void run(async () => {
        const drafts = await inspectionDraftStorage.forSite(companyId, item.job.siteId).list();
        setSelected({}); setReview({ ...item, drafts });
      }); })}
    </View>} />}
    <InstafireDialog visible={!!confirmation} title="CONFIRM JOB COMPLETION" type="warning" confirmText="COMPLETE & SAVE ON DEVICE" cancelText="KEEP EDITING"
      message={confirmation ? `${review?.job.customer.name} / ${review?.job.site.name}\n${confirmation.totals.totalAssets} assets; ${confirmation.totals.pass} PASS, ${confirmation.totals.fail} FAIL, ${confirmation.totals.na} N/A checks; ${confirmation.totals.defectCount} defects. The full results will be queued for synchronisation. This does not submit or approve the work.` : ''}
      onCancel={() => setConfirmation(null)} onConfirm={() => { const seed = confirmation; setConfirmation(null); if (!seed) return;
        void run(async () => { const outbox = jobCompletionOutbox.forCompany(companyId); await outbox.prepare(seed); setReview(null);
          setPending(previous => [...previous.filter(p => p.jobId !== seed.jobId), { jobId: seed.jobId, status: 'Completed / Pending Sync' }]);
          try { await outbox.sync(seed.jobId); } catch (failure) { setError(jobSyncError(failure)); } await refresh(); });
      }} />
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, padding: 16, backgroundColor: '#0B0D0E' }, heading: { color: '#FF641C', fontSize: 22, fontWeight: '800', marginBottom: 12 }, text: { color: '#FFF', lineHeight: 22 }, muted: { color: '#B7BDC5', lineHeight: 22, marginVertical: 8 }, warning: { color: '#FDBA74', lineHeight: 22 }, card: { backgroundColor: '#191D20', borderRadius: 8, padding: 12, marginVertical: 6 }, button: { minHeight: 48, justifyContent: 'center', padding: 12, borderColor: '#FF641C', borderWidth: 1, borderRadius: 8, marginVertical: 6 }, disabled: { opacity: 0.5 } });
