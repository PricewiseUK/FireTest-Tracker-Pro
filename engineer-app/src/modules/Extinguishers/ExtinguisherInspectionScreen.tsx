import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";
import { inspectionDraftStorage } from "../../services/inspectionDraftStorage";
import InstafireDialog from "../../components/InstafireDialog";
import { approvedGaugePresence, approvedInspectionAsset, canStartInspection } from "./approvedInspectionAsset";
import { createInspectionNotesController } from "./inspectionNotesController";
import ExtinguisherServicingPanel from "./ExtinguisherServicingPanel";
import InspectionDraftReview from "./InspectionDraftReview";
import { attachInspectionPhoto } from "./inspectionPhotoAttachment";
import { inspectionPhotoAdapter } from "./inspectionPhotoAdapter";
import type { DraftResult, NotesSeed } from "../../services/localInspectionDraftStore";
import type { RoutineInspectionKind } from "./pendingRoutineChecklist";
import { inspectionDraftSummary } from "./inspectionDraftSummary";

type Controller = ReturnType<typeof createInspectionNotesController>;
export type LeaveGuard = (navigate: () => void) => Promise<boolean>;
type Props = {
  companyId: string; siteId: string; assetDocId: string; userId: string;
  role: string; assignedSites: string[]; goBack: () => void;
  resumeInspectionId?: string;
  backLabel?: string;
  registerLeaveGuard: (guard: LeaveGuard) => () => void;
};
const MESSAGES: Record<string, string> = {
  RECOVERY_REQUIRED: "The local draft cannot be safely opened. All stored copies have been kept. Retry reading, or return to the register and contact your administrator for recovery.",
  DUPLICATE_DRAFTS: "Multiple local drafts need review. All copies have been kept; no draft was selected or replaced.",
  REVISION_CONFLICT: "This draft changed elsewhere. Your unsaved text is still here. Keep a copy of it before requesting help to reconcile the drafts.",
  AUTH_SESSION_CHANGED: "The signed-in user changed. Return to the register.",
  APPROVED_ASSET_REQUIRED: "This record is not available as an approved extinguisher. Return to the asset register.",
  LOCAL_DRAFT_NOT_FOUND: "The selected local draft is unavailable. No replacement has been created. Return to Resume Inspection and retry.",
  DRAFT_KIND_MISMATCH: "The selected draft does not match this asset or editor format. All local data has been retained; no replacement was created.",
};
function errorMessage(code: string) { return MESSAGES[code] ?? "Unable to save or read the draft. Your text is still here. Check device storage and retry Save Draft."; }

export default function ExtinguisherInspectionScreen(props: Props) {
  const { companyId, siteId, assetDocId, userId, role, assignedSites, goBack, registerLeaveGuard, resumeInspectionId } = props;
  const [prepared, setPrepared] = useState<{ key: string; controller: Controller } | null>(null);
  const [choice, setChoice] = useState<{ key: string; seed: NotesSeed; records: DraftResult[]; open: (id?: string, kind?: RoutineInspectionKind) => void } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const requestKey = JSON.stringify([companyId, siteId, assetDocId, userId, role, assignedSites ?? [], retry, resumeInspectionId]);
  const controller = prepared?.key === requestKey ? prepared.controller : null;
  useEffect(() => {
    if (controller) return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => { goBack(); return true; });
    return () => back.remove();
  }, [controller, goBack]);
  useEffect(() => {
    // Depend on access values, not array identity: a parent rerender must not
    // invalidate an open editor when its actual context has not changed.
    const [companyId, siteId, assetDocId, userId, role, assignedSites, , resumeInspectionId] = JSON.parse(requestKey) as [string, string, string, string, string, string[], number, string | null];
    let active = true;
    let editor: Controller | null = null;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.uid !== userId) {
        editor?.invalidate();
        if (active) { setPrepared(null); setChoice(null); setError("AUTH_SESSION_CHANGED"); }
      }
    });
    void (async () => {
      try {
        if (auth.currentUser?.uid !== userId || !canStartInspection(role, assignedSites, siteId)) throw new Error("AUTH_SESSION_CHANGED");
        // Only this exact approved collection is read; proposal routes are never accepted.
        const snapshot = await getDoc(doc(db, "companies", companyId, "sites", siteId, "extinguishers", assetDocId));
        if (!active || auth.currentUser?.uid !== userId) return;
        const seed = approvedInspectionAsset(companyId, siteId, { id: snapshot.id, path: snapshot.ref.path, exists: snapshot.exists(), data: snapshot.data() ?? {} });
        setError("");
        const site = inspectionDraftStorage.forSite(companyId, siteId);
        const open = (id?: string, kind?: RoutineInspectionKind) => {
          if (!active || editor || auth.currentUser?.uid !== userId || !canStartInspection(role, assignedSites, siteId)) return;
          try {
            site.assertCurrentSession();
            editor = createInspectionNotesController(site, seed, id, { gaugePresent: approvedGaugePresence(snapshot.data() ?? {}),
              inspectionKind: id ? null : kind ?? "annual-basic", newInspection: !id });
            setPrepared({ key: requestKey, controller: editor });
          } catch { setError("RECOVERY_REQUIRED"); }
        };
        if (resumeInspectionId) { open(resumeInspectionId); return; }
        let saved: DraftResult[];
        try { saved = await site.list(); } catch { throw new Error("RECOVERY_REQUIRED"); }
        const records = saved.filter(({ draft }) => draft.localSchemaVersion !== 1 && draft.assetDocId === seed.assetDocId)
          .sort((a, b) => b.draft.createdAtMs - a.draft.createdAtMs || b.draft.updatedAtMs - a.draft.updatedAtMs);
        if (active && auth.currentUser?.uid === userId) setChoice({ key: requestKey, seed, records, open });
      } catch (err) { if (active) setError(auth.currentUser?.uid !== userId ? "AUTH_SESSION_CHANGED" : ["APPROVED_ASSET_REQUIRED", "AUTH_SESSION_CHANGED", "RECOVERY_REQUIRED"].includes((err as Error).message) ? (err as Error).message : "ASSET_READ_FAILED"); }
    })();
    return () => { active = false; editor?.invalidate(); unsubscribe(); };
  }, [requestKey]);

  if (controller) return <InspectionEditor controller={controller} goBack={goBack} registerLeaveGuard={registerLeaveGuard} backLabel={props.backLabel ?? "ASSET REGISTER"} />;
  if (choice?.key === requestKey && !error) return <View style={styles.container}>
    <TouchableOpacity style={styles.back} onPress={goBack} accessibilityRole="button" accessibilityLabel={`Back to ${props.backLabel ?? "asset register"}`}><Text style={styles.buttonText}>Back</Text></TouchableOpacity>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.assetSummary}>
        <Text style={styles.assetReference}>{choice.seed.assetReference}</Text>
        <Text style={styles.assetDetail}>{choice.seed.equipmentType} / {choice.seed.assetCapacity || "Capacity Not Recorded"}</Text>
        <Text style={styles.assetLocation}>{choice.seed.assetLocation || "Location Not Recorded"}</Text>
      </View>
      <TouchableOpacity style={styles.button} accessibilityRole="button" onPress={() => choice.open(undefined, "annual-basic")}><Text style={styles.buttonText}>START NEW ANNUAL BASIC SERVICE</Text></TouchableOpacity>
      <TouchableOpacity style={styles.button} accessibilityRole="button" onPress={() => choice.open(undefined, "monthly-visual")}><Text style={styles.buttonText}>START NEW MONTHLY VISUAL</Text></TouchableOpacity>
      <Text style={styles.text}>Previous inspections stay saved separately. New checks start unanswered.</Text>
      {choice.records.map(({ draft, canEdit }) => {
        if (draft.localSchemaVersion === 1) return null;
        const summary = inspectionDraftSummary(draft);
        return <View key={draft.inspectionId} style={styles.assetSummary}>
          <Text style={styles.assetDetail}>{summary.label} - {summary.checks} checks</Text>
          <Text style={styles.text}>{new Date(summary.createdAtMs).toLocaleString()}</Text>
          <TouchableOpacity style={styles.button} accessibilityRole="button" onPress={() => choice.open(draft.inspectionId)}><Text style={styles.buttonText}>RESUME INSPECTION</Text></TouchableOpacity>
          {!canEdit && <Text style={styles.error}>Stored copy needs recovery review.</Text>}
        </View>;
      })}
    </ScrollView>
  </View>;
  return <View style={styles.container}>
    <TouchableOpacity style={styles.button} onPress={goBack} accessibilityRole="button"><Text style={styles.buttonText}>BACK TO {props.backLabel ?? "ASSET REGISTER"}</Text></TouchableOpacity>
    {error ? <><Text style={styles.error}>{error === "ASSET_READ_FAILED" ? "Unable to verify the approved asset. Check your connection or permissions and retry." : errorMessage(error)}</Text>
      <TouchableOpacity style={styles.button} onPress={() => { setError(""); setRetry((value) => value + 1); }} accessibilityRole="button"><Text style={styles.buttonText}>RETRY</Text></TouchableOpacity></> : <ActivityIndicator color="#FF641C" accessibilityLabel="Opening inspection" />}
  </View>;
}

function InspectionEditor({ controller, goBack, registerLeaveGuard, backLabel }: { controller: Controller; goBack: () => void; registerLeaveGuard: Props["registerLeaveGuard"]; backLabel: string }) {
  const [state, setState] = useState(controller.getState());
  const [confirmRecovery, setConfirmRecovery] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const reviewRef = useRef(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const showReview = useCallback((next: boolean) => { reviewRef.current = next; setReviewing(next); }, []);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [reviewing]);
  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    void controller.open();
    const unregister = registerLeaveGuard((navigate) => controller.leave(navigate));
    const back = BackHandler.addEventListener("hardwareBackPress", () => { if (reviewRef.current) showReview(false); else void controller.leave(goBack); return true; });
    const appState = AppState.addEventListener("change", (next) => { if (next !== "active") void controller.save(); });
    return () => { unsubscribe(); unregister(); back.remove(); appState.remove(); };
  }, [controller, goBack, registerLeaveGuard, showReview]);
  useEffect(() => {
    if (!state.dirty || state.recovery || state.error || state.closed || state.replacing) return;
    const timer = setTimeout(() => { void controller.save(); }, 500);
    return () => clearTimeout(timer);
  }, [controller, state.notes, state.servicing, state.dirty, state.recovery, state.error, state.closed, state.replacing]);
  const draft = state.draft;
  const asset = controller.getAsset();
  const deviceState = state.saving || state.replacing ? "Saving" : state.error || state.recovery ? "Save Failed" : state.dirty ? "Unsaved changes" : draft ? "Saved on Device" : "";
  const heading = state.servicing.serviceType === "monthly-visual" ? "Monthly Visual Inspection" : state.servicing.serviceType === "annual-basic" ? "Annual Basic Service" : state.servicing.serviceType === "commissioning" ? "Commissioning" : state.servicing.serviceType === "extended" ? "Extended Service" : state.servicing.serviceType === "co2-overhaul" ? "CO₂ Overhaul" : "Extinguisher Inspection";
  if (state.closed) return <View style={styles.container}><Text style={styles.text}>Inspection closed.</Text></View>;
  return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <TouchableOpacity style={styles.back} onPress={() => { if (reviewing) showReview(false); else void controller.leave(goBack); }} accessibilityRole="button" accessibilityLabel={reviewing ? "Return to checks" : `Save and return to ${backLabel}`}>
      <Text style={styles.buttonText}>‹ {reviewing ? "Checks" : "Back"}</Text>
    </TouchableOpacity>
    <ScrollView ref={scroll} style={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
      {state.loading && <ActivityIndicator color="#FF641C" accessibilityLabel="Loading draft" />}
      {draft && <>
        <View style={styles.assetSummary}>
          <Text style={styles.assetReference}>{asset.assetReference}</Text>
          <Text style={styles.assetDetail}>{asset.equipmentType || "Type Not Recorded"} · {asset.assetCapacity || "Capacity Not Recorded"}</Text>
          <Text style={styles.assetLocation}>{asset.assetLocation || "Location Not Recorded"}</Text>
        </View>
        {state.contextChanged && <Text style={styles.error}>Current approved details are shown above. This draft’s original asset reference differs and has been kept with its notes for review.</Text>}
        <View style={styles.serviceHeading}>
          <Text style={styles.title}>{heading}</Text><Text style={styles.draftIndicator}>Local Draft</Text>
        </View>
        {state.servicing.checklist?.approval.status !== "approved" && <Text style={styles.pendingNotice}>{state.servicing.checklist?.approval.status === "demonstration" ? "Pending Validation · Demo" : "Pending Validation"}</Text>}
        {reviewing ? <InspectionDraftReview value={state.servicing} notes={state.notes} onEdit={() => showReview(false)} /> : <>
        <ExtinguisherServicingPanel value={state.servicing} onChange={(value) => controller.changeServicing(value)} disabled={state.recovery || state.loading || state.replacing} assetType={asset.equipmentType} gaugePresent={controller.getGaugePresence()}
          onAnswer={(questionId, patch) => controller.changeAnswer(questionId, patch)}
          onRecord={() => { void controller.save(); }} onReview={() => { void controller.save(); showReview(true); }}
          onAddPhoto={async (questionId) => {
            setPhotoError("");
            try { await attachInspectionPhoto(controller, questionId, inspectionPhotoAdapter); }
            catch { setPhotoError("Photo could not be saved with this draft. Any copied file and unsaved reference are kept. Retry Save Draft; if no reference appears, select the photo again. No upload has occurred."); }
          }} />
        {!!photoError && <Text style={styles.error} accessibilityRole="alert">{photoError}</Text>}
        <Text style={styles.label}>ENGINEER NOTES</Text>
        <TextInput style={styles.input} value={state.notes} onChangeText={(value) => controller.changeNotes(value)} multiline maxLength={8000}
          editable={!state.recovery && !state.loading && !state.replacing} accessibilityLabel="Engineer notes" placeholder="Record equipment observations. Avoid personal information." placeholderTextColor="#9CA3AF" textAlignVertical="top" />
        <Text style={styles.text}>{state.notes.length}/8000</Text>
        </>}
      </>}
      {state.error && <Text style={styles.error} accessibilityRole="alert">{errorMessage(state.error)}</Text>}
      {!draft && !state.loading && <TouchableOpacity style={styles.button} onPress={() => { void controller.open(); }} accessibilityRole="button"><Text style={styles.buttonText}>RETRY READING DRAFT</Text></TouchableOpacity>}
      {state.recovery && <View style={styles.card}>
        <Text style={styles.asset}>DRAFT RECOVERY</Text>
        <Text style={styles.text}>A stored copy is damaged. The previous valid notes are shown above. Newer changes may be missing. Nothing has been discarded.</Text>
        <TouchableOpacity style={styles.button} disabled={state.saving} onPress={() => setConfirmRecovery(true)} accessibilityRole="button"><Text style={styles.buttonText}>REVIEW RECOVERY</Text></TouchableOpacity>
      </View>}
    </ScrollView>
    {draft && <View style={styles.saveBar}>
      <Text style={styles.status} accessibilityLiveRegion="polite">{deviceState} · Pending Sync</Text>
      <TouchableOpacity style={[styles.saveAction, state.recovery && styles.disabled]} disabled={state.recovery || state.saving} onPress={() => { void controller.save(); }} accessibilityRole="button" accessibilityLabel="Save draft on device">
        <Text style={styles.buttonText}>Save Draft</Text>
      </TouchableOpacity>
    </View>}
    <InstafireDialog visible={confirmRecovery} title="PRESERVE COPIES & CONTINUE?" type="warning"
      message="Both original stored copies, including damaged data, will be retained for review before editing is enabled. Continue with the previous valid notes?"
      confirmText="PRESERVE & CONTINUE" cancelText="KEEP READ-ONLY" onCancel={() => setConfirmRecovery(false)} onConfirm={() => { setConfirmRecovery(false); void controller.recover(); }} />
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  back: { minHeight: 48, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 8 },
  saveBar: { borderTopWidth: 1, borderTopColor: "#30363B", backgroundColor: "#0B0D0E", flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  saveAction: { minHeight: 48, maxWidth: "50%", paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#FF641C", borderRadius: 8, alignItems: "center", justifyContent: "center" },
  status: { color: "#B7BDC5", fontSize: 12, lineHeight: 18, flex: 1, minWidth: 0 },
  scroll: { flex: 1 },
  assetSummary: { backgroundColor: "#191D20", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8 },
  assetReference: { color: "white", fontSize: 18, fontWeight: "800", lineHeight: 24 },
  assetDetail: { color: "#B7BDC5", fontSize: 14, lineHeight: 20 }, assetLocation: { color: "#E5E7EB", fontSize: 15, lineHeight: 21 },
  serviceHeading: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 2 },
  draftIndicator: { color: "#B7BDC5", fontSize: 11, paddingVertical: 3 }, pendingNotice: { color: "#FDBA74", fontSize: 12, lineHeight: 18, marginBottom: 2 },
  container: { flex: 1, width: "100%", maxWidth: 840, alignSelf: "center", backgroundColor: "#0B0D0E", paddingHorizontal: 14 },
  content: { paddingBottom: 16 },
  title: { color: "#FFFFFF", fontSize: 19, fontWeight: "800", marginVertical: 3, flexShrink: 1 },
  asset: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", marginBottom: 8 },
  text: { color: "#9CA3AF", fontSize: 14, lineHeight: 21, marginBottom: 8 },
  card: { backgroundColor: "#191D20", borderRadius: 8, padding: 16, marginVertical: 12 },
  label: { color: "#FFFFFF", fontWeight: "700", marginVertical: 12 },
  input: { color: "#FFFFFF", backgroundColor: "#191D20", borderColor: "#505860", borderWidth: 1, borderRadius: 8, minHeight: 180, padding: 14, fontSize: 16 },
  button: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: "#FF641C", borderRadius: 8, alignItems: "center", justifyContent: "center", marginVertical: 10 },
  buttonText: { color: "#FF641C", fontWeight: "800", textAlign: "center" },
  error: { color: "#FCA5A5", lineHeight: 22, marginVertical: 12 },
  disabled: { opacity: 0.45 },
});
