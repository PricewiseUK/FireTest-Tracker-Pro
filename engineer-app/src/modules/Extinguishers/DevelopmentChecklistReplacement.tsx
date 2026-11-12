import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import InstafireDialog from "../../components/InstafireDialog";
import type { createInspectionNotesController } from "./inspectionNotesController";
type Controller = ReturnType<typeof createInspectionNotesController>;

/** One development-asset exception; not a general draft picker or approval flow. */
export default function DevelopmentChecklistReplacement({ controller, replacing, compact = false }: { controller: Controller; replacing: boolean; compact?: boolean }) {
  const [gauge, setGauge] = useState<boolean | null>(null);
  const [original, setOriginal] = useState<Awaited<ReturnType<Controller["loadPreservedDevelopmentDemo"]>>>(null);
  const [message, setMessage] = useState("");
  const asset = controller.getAsset();
  if (asset.assetReference !== "TEST-EXT001") return null;
  const canReplace = controller.canReplaceDevelopmentDemo();
  const template = controller.getState().servicing.checklist;
  const pending = template?.approval.status === "pending-technical-validation";
  const knownGauge = controller.getGaugePresence() ?? (pending && "gaugePresent" in template ? template.gaugePresent : undefined);
  const originalServicing = original?.draft.localSchemaVersion === 3 ? original.draft.servicing : null;
  const button = (title: string, press: () => void) => <TouchableOpacity accessibilityRole="button" disabled={replacing} style={styles.button} onPress={press}><Text style={styles.action}>{title}</Text></TouchableOpacity>;
  const confirmation = <InstafireDialog visible={gauge !== null} title="LOAD 11 CHECKS & KEEP PREVIOUS?" type="warning"
    message="Development test asset only. Your previous inspection, answers and stored copies will be saved separately before the latest 11 Water annual checks are loaded unanswered. Notes, observations and evidence stay available. Pending technical validation; submission and certification remain disabled."
    confirmText="KEEP PREVIOUS & LOAD" cancelText="KEEP CURRENT" onCancel={() => setGauge(null)} onConfirm={() => { const confirmed = gauge; setGauge(null); if (confirmed !== null) void controller.replaceDevelopmentDemo(confirmed); }} />;
  if (compact) return canReplace && pending && typeof knownGauge === "boolean" ? <View>
    <TouchableOpacity accessibilityRole="button" disabled={replacing} style={styles.link} onPress={() => setGauge(knownGauge)}><Text style={styles.action}>Load latest 11 checks · keep previous inspection</Text></TouchableOpacity>
    {confirmation}
  </View> : null;
  return <View>
    {canReplace && <View style={styles.card}>
      <Text style={styles.title}>TEST-EXT001 — PREVIOUS CHECKLIST</Text>
      <Text style={styles.text}>Use the current Water annual/basic candidate. First, the original draft and all stored copies are preserved separately. New checks start unanswered; existing notes, observations and evidence are kept.</Text>
      {typeof knownGauge === "boolean" ? button("USE CURRENT WATER CANDIDATE", () => setGauge(knownGauge)) : <>
        <Text style={styles.text}>Confirm the actual test unit. No gauge configuration is assumed.</Text>
        {button("GAUGE FITTED — USE CURRENT CHECKS", () => setGauge(true))}
        {button("NO GAUGE — USE CURRENT CHECKS", () => setGauge(false))}
      </>}
    </View>}
    {pending && button(original ? "HIDE PRESERVED INSPECTION" : "VIEW PRESERVED INSPECTION", () => {
      if (original) { setOriginal(null); return; }
      void controller.loadPreservedDevelopmentDemo().then((record) => {
        if (controller.isCurrentSession()) { setOriginal(record); setMessage(record ? "" : "No previous inspection is archived for this draft."); }
      }).catch(() => { if (controller.isCurrentSession()) setMessage("Unable to read the preserved original. All copies are kept."); });
    })}
    {!!message && <Text style={styles.text}>{message}</Text>}
    {original && <View style={styles.card}>
      <Text style={styles.title}>PRESERVED ORIGINAL — READ ONLY</Text>
      <Text style={styles.text}>Archive: {original.archiveId}</Text>
      <Text style={styles.text}>Notes: {original.draft.engineerNotes || "None recorded"}</Text>
      {originalServicing && <>
        <Text style={styles.text}>{originalServicing.checklist?.id} · version {originalServicing.checklist?.version}</Text>
        {originalServicing.answers.map((answer) => <Text style={styles.text} key={answer.questionId}>{originalServicing.checklist?.questions.find((question) => question.id === answer.questionId)?.prompt ?? answer.questionId}{"\n"}{answer.result ?? "Unanswered"}{"\n"}{answer.notes}{"\n"}{answer.correctiveAction}</Text>)}
        {originalServicing.defects.map((defect) => <Text style={styles.text} key={defect.id}>{defect.status}: {defect.description} · {defect.correctiveAction}</Text>)}
        {originalServicing.evidence.map((entry) => <Text style={styles.text} key={entry.id}>Evidence: {entry.reference} · {entry.notes}</Text>)}
      </>}
    </View>}
    {confirmation}
  </View>;
}
const styles = StyleSheet.create({
  link: { minHeight: 48, justifyContent: "center", paddingVertical: 6 },
  card: { backgroundColor: "#191D20", padding: 12, borderRadius: 8, marginVertical: 8 }, title: { color: "#FDBA74", fontWeight: "800", marginVertical: 6 },
  text: { color: "#B7BDC5", lineHeight: 22, marginVertical: 4 }, button: { minHeight: 48, padding: 12, justifyContent: "center", borderWidth: 1, borderColor: "#FF641C", borderRadius: 8, marginVertical: 6 }, action: { color: "#FF9B63", fontWeight: "800" },
});
