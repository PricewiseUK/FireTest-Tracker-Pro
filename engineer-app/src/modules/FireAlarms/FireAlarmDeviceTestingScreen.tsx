import React, { useEffect, useMemo, useState } from "react";
import { AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import InstafireDialog from "../../components/InstafireDialog";
import { fireAlarmDraftStorage } from "../../services/fireAlarmDraftStorage";
import { fireAlarmProgress } from "../../services/localFireAlarmDraftStore";
import { createFireAlarmTestingController } from "./fireAlarmTestingController";
import type { AlarmDevice, FixtureScope } from "./fireAlarmRegister";
import FireAlarmSystemChecksPanel from "./FireAlarmSystemChecksPanel";
import { emptySystemChecks } from "./systemChecks";
export type FireAlarmLeaveGuard = (navigate: () => void) => Promise<boolean>;
export type FireAlarmGuardRegistration = (guard: FireAlarmLeaveGuard) => () => void;

export default function FireAlarmDeviceTestingScreen({ scope, siteId, systemId, deviceIds, devices, listHeader, renderMetadata, registerGuard }: {
  scope: FixtureScope; siteId: string; systemId: string; deviceIds: string[]; devices: AlarmDevice[];
  listHeader: React.ReactElement; renderMetadata: (device: AlarmDevice) => React.ReactNode; registerGuard: FireAlarmGuardRegistration;
}) {
  const idsKey = JSON.stringify(deviceIds);
  const controller = useMemo(() => createFireAlarmTestingController(fireAlarmDraftStorage.forSystem({ ...scope, siteId, systemId }), JSON.parse(idsKey)), [scope, siteId, systemId, idsKey]);
  const [state, setState] = useState(controller.getState());
  const [confirmRecovery, setConfirmRecovery] = useState(false);
  const [section, setSection] = useState<"devices" | "system">("devices");
  useEffect(() => {
    const unsubscribe = controller.subscribe(setState); void controller.open();
    const unregister = registerGuard(controller.leave);
    const background = AppState.addEventListener("change", (next) => { if (next !== "active") void controller.save(); });
    return () => { unsubscribe(); unregister(); background.remove(); void controller.save(); };
  }, [controller, registerGuard]);
  const progress = fireAlarmProgress(state.answers);
  const disabled = !state.draft || state.loading || state.recovery || state.closed;
  const status = state.saving ? "Saving" : state.error || state.recovery ? "Save Failed" : state.dirty ? "Unsaved changes" : state.draft ? "Saved on Device" : "Loading";
  if (state.closed) return <Text style={styles.text}>Fixture testing closed. Saved results remain on this device.</Text>;
  return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <View style={styles.results}>
      {(["devices", "system"] as const).map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: section === value }} style={[styles.action, section === value && { backgroundColor: "#54270F" }]} onPress={() => setSection(value)}><Text style={styles.actionText}>{value === "devices" ? "Device Testing" : "System Checks"}</Text></Pressable>)}
    </View>
    <FlatList key={section} data={section === "devices" ? devices : []} keyExtractor={(entry) => entry.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}
      ListHeaderComponent={<>
        {section === "devices" && <>
        <View style={styles.progress} accessibilityLiveRegion="polite">
          <Text style={styles.metric}>{state.loading ? "…" : `${progress.tested}/${progress.total}`}<Text style={styles.caption}> tested</Text></Text>
          <Text style={[styles.metric, styles.failed]}>{progress.failed}<Text style={styles.caption}> failed</Text></Text>
        </View>
        <Text style={styles.caption}>System total · all loops and zones</Text>
        {!!progress.needsFault && <Text style={styles.warning}>{progress.needsFault} failed device(s) need a fault description.</Text>}
        </>}
        {!!state.error && <Text style={styles.warning} accessibilityRole="alert">{state.error === "DEVICE_REGISTER_CHANGED" ? "The example register changed. Previous results remain saved; no answers were replaced." : "Unable to save or read safely. Your edits and stored copies are kept. Retry saving or reading."}</Text>}
        {state.recovery && <View style={styles.card}><Text style={styles.warning}>A stored copy is damaged. Previous results are shown; newer changes may be missing. Both copies will be preserved before editing.</Text>
          <Pressable accessibilityRole="button" style={styles.action} disabled={state.saving} onPress={() => setConfirmRecovery(true)}><Text style={styles.actionText}>Preserve copies & recover</Text></Pressable></View>}
        {section === "devices" ? listHeader : <FireAlarmSystemChecksPanel value={state.systemChecks ?? emptySystemChecks()} disabled={disabled} onChange={(update) => { controller.changeSystem(update); void controller.save(); }} />}
      </>}
      ListEmptyComponent={section === "devices" ? <Text style={styles.text}>No example devices match these filters.</Text> : undefined}
      renderItem={({ item }) => {
        const answer = state.answers.find((row) => row.deviceId === item.id);
        return <View style={styles.card}>{renderMetadata(item)}
          <View style={styles.results}>{(["pass", "fail", "na"] as const).map((result) => {
            const selected = answer?.result === result; const label = result === "na" ? "N/A" : result.toUpperCase();
            const color = result === "pass" ? "#4ADE80" : result === "fail" ? "#F87171" : "#FBBF24";
            return <Pressable key={result} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${item.reference}: ${label}`} accessibilityState={{ selected, disabled }}
              onPress={() => { controller.selectDeviceResult(item.id, result); void controller.save(); }}
              style={[styles.result, { borderColor: color }, selected && { borderWidth: 3, backgroundColor: result === "pass" ? "#123522" : result === "fail" ? "#421E23" : "#3C3012" }]}>
              <Text style={[styles.resultText, { color }]}>{selected ? "✓ " : ""}{label}</Text>
            </Pressable>;
          })}</View>
          {answer?.result === "fail" && <>
            <Text style={styles.label}>Fault description (required)</Text>
            <TextInput accessibilityLabel={`${item.reference}: fault description, required`} editable={!disabled} style={styles.input} multiline maxLength={2000} textAlignVertical="top"
              value={answer.fault} onChangeText={(fault) => { controller.change(item.id, { fault }); void controller.save(); }} />
            {!answer.fault.trim() && <Text style={styles.warning}>Describe the fault. You can continue to the next device.</Text>}
          </>}
        </View>;
      }} />
    <View style={styles.saveBar}><Text style={styles.caption} accessibilityLiveRegion="polite">{status} · Example only</Text>
      <Pressable accessibilityRole="button" disabled={state.saving || state.recovery} style={styles.action} onPress={() => { if (state.draft) void controller.save(); else void controller.open(); }}><Text style={styles.actionText}>{state.draft ? "Save Draft" : "Retry reading"}</Text></Pressable>
    </View>
    <InstafireDialog visible={confirmRecovery} title="PRESERVE COPIES & RECOVER?" type="warning" message="Keep both stored copies, including damaged data, then continue with the previous valid results and any unsaved edits still held here. No Firebase upload will occur."
      confirmText="PRESERVE & RECOVER" cancelText="KEEP READ-ONLY" onCancel={() => setConfirmRecovery(false)} onConfirm={() => { setConfirmRecovery(false); void controller.recover(); }} />
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  container: { flex: 1 }, content: { paddingBottom: 16 }, card: { backgroundColor: "#191D20", padding: 13, borderRadius: 8, marginVertical: 6 },
  progress: { flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 6 }, metric: { color: "#FF9B63", fontSize: 28, fontWeight: "800" }, failed: { color: "#F87171" },
  caption: { color: "#B7BDC5", fontSize: 13, lineHeight: 20, flexShrink: 1 }, text: { color: "#B7BDC5", fontSize: 15, marginVertical: 8 },
  results: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 }, result: { minHeight: 56, minWidth: 80, flexGrow: 1, justifyContent: "center", alignItems: "center", borderWidth: 1, borderRadius: 7, padding: 10 },
  resultText: { fontSize: 18, fontWeight: "800" }, label: { color: "white", fontWeight: "700", marginVertical: 8 }, input: { color: "white", fontSize: 16, minHeight: 68, borderWidth: 1, borderColor: "#69717B", borderRadius: 7, padding: 10 },
  warning: { color: "#FDBA74", fontSize: 13, lineHeight: 20, marginVertical: 6 }, saveBar: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: "#30363B", paddingVertical: 5 },
  action: { minHeight: 48, justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: "#FF641C", borderRadius: 7 }, actionText: { color: "#FF9B63", fontWeight: "700" },
});
