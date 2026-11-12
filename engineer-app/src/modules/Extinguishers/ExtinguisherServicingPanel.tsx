import React, { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { attachPendingRoutineChecklist, classificationIssue, type ServicingDraft } from "./servicingDraft";
import { routineMediumFor, type PendingRoutineChecklist, type RoutineInspectionKind } from "./pendingRoutineChecklist";
import ExtinguisherChecklist from "./ExtinguisherChecklist";
import { planRoutineInspection } from "./inspectionChecklistSelection";

function Choice({ label, selected, onPress, disabled }: { label: string; selected?: boolean; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: !!selected, disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[styles.button, selected && styles.selected, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></TouchableOpacity>;
}
function Input({ label, value, onChange, disabled, max = 2000 }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; max?: number }) {
  return <><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} value={value} onChangeText={onChange} editable={!disabled} multiline maxLength={max} textAlignVertical="top" /></>;
}
export default function ExtinguisherServicingPanel({ value, onChange, disabled, assetType, gaugePresent, onRecord, onAnswer, onAddPhoto, onReview }: { value: ServicingDraft; onChange: (value: ServicingDraft) => void; disabled: boolean; assetType: string; gaugePresent?: boolean; onRecord: () => void; onAnswer: (questionId: string, patch: Partial<ServicingDraft["answers"][number]>) => void; onAddPhoto: (questionId: string) => Promise<void>; onReview: () => void }) {
  const sequence = useRef(0);
  const [observationsOpen, setObservationsOpen] = useState(false);
  const id = () => `local_${Date.now()}_${++sequence.current}`;
  const discrepancy = classificationIssue(assetType, value.equipmentClass);
  const medium = routineMediumFor(assetType);
  const pending = value.checklist?.approval.status === "pending-technical-validation" ? value.checklist as PendingRoutineChecklist : null;
  const mediumChanged = pending !== null && pending.equipmentMedium !== medium;
  const expectedClass = medium === "co2" ? "co2" : medium === "powder" ? "powder" : "water-based";
  const candidateAvailable = medium !== null && !discrepancy
    && (value.serviceType === null || value.serviceType === "annual-basic" || value.serviceType === "monthly-visual")
    && (value.equipmentClass === "unconfirmed" || value.equipmentClass === expectedClass);
  const openCandidate = (gaugePresent: boolean) => {
    if (disabled || !candidateAvailable || !medium || (value.serviceType !== "monthly-visual" && value.serviceType !== "annual-basic")) return;
    onChange(attachPendingRoutineChecklist({ ...value, equipmentClass: expectedClass }, medium, gaugePresent));
    onRecord();
  };
  const chooseKind = (kind: RoutineInspectionKind) => {
    if (disabled || !candidateAvailable || !medium) return;
    onChange(planRoutineInspection(value, assetType, kind, medium === "co2" && gaugePresent ? undefined : gaugePresent));
    onRecord();
  };
  return <View>
    {discrepancy && <Text style={styles.warning}>{discrepancy}</Text>}
    {mediumChanged && <Text style={styles.warning}>The saved checklist type differs from the current approved asset type. Existing answers are read-only and preserved. Arrange a separate asset/checklist review.</Text>}
    {!value.checklist ? <>
      {candidateAvailable ? <View style={styles.card}>
        <View style={styles.choices}>
          <Choice label="Monthly Visual" selected={value.serviceType === "monthly-visual"} disabled={disabled} onPress={() => chooseKind("monthly-visual")} />
          <Choice label="Annual Basic" selected={value.serviceType === "annual-basic"} disabled={disabled} onPress={() => chooseKind("annual-basic")} />
        </View>
        {value.serviceType !== null && (medium === "co2" && gaugePresent === true ? <Text style={styles.warning}>This model needs technical review before a checklist can be selected.</Text> : <>
          <Text style={styles.text}>Confirm whether a gauge is fitted to open the checks.</Text>
          <View style={styles.choices}>
            {medium !== "co2" && <Choice label="GAUGE FITTED" disabled={disabled} onPress={() => openCandidate(true)} />}
            <Choice label="NO GAUGE FITTED" disabled={disabled} onPress={() => openCandidate(false)} />
          </View>
        </>)}
      </View> : <Text style={styles.warning}>No applicable checklist is available for these equipment details. Existing information is kept; record observations in Engineer Notes.</Text>}
    </> : <ExtinguisherChecklist value={value} onAnswer={onAnswer} onRecord={onRecord} onAddPhoto={onAddPhoto} disabled={disabled || mediumChanged || !!discrepancy} />}
    <Choice label={`${observationsOpen ? "HIDE" : "SHOW"} DEFECT OBSERVATIONS / REFERENCES (${value.defects.length} defects, ${value.evidence.length} references)`} onPress={() => setObservationsOpen((open) => !open)} />
    {observationsOpen && <>
    <Text style={styles.heading}>OPTIONAL DEFECT DETAILS</Text>
    <View style={styles.choices}>{(["not-assessed", "none-reported", "open", "rectified", "referred"] as const).map((status) => <Choice key={status} label={status.replaceAll("-", " ")} selected={status === value.defectStatus} disabled={disabled} onPress={() => onChange({ ...value, defectStatus: status })} />)}</View>
    <Text style={styles.text}>An engineer-entered defect status is not a declaration of compliance.</Text>
    {value.defects.map((defect, index) => <View style={styles.card} key={defect.id}>
      <Input label={`Defect ${index + 1} description`} value={defect.description} disabled={disabled} onChange={(description) => onChange({ ...value, defects: value.defects.map((entry) => entry.id === defect.id ? { ...entry, description } : entry) })} />
      <Input label={`Defect ${index + 1} corrective action / referral`} value={defect.correctiveAction} disabled={disabled} onChange={(correctiveAction) => onChange({ ...value, defects: value.defects.map((entry) => entry.id === defect.id ? { ...entry, correctiveAction } : entry) })} />
      <View style={styles.choices}>{(["open", "rectified", "referred"] as const).map((status) => <Choice key={status} label={status} selected={defect.status === status} disabled={disabled} onPress={() => onChange({ ...value, defects: value.defects.map((entry) => entry.id === defect.id ? { ...entry, status } : entry) })} />)}</View>
    </View>)}
    <Choice label="ADD DEFECT" disabled={disabled || value.defects.length >= 30} onPress={() => onChange({ ...value, defectStatus: "open", defects: [...value.defects, { id: id(), description: "", correctiveAction: "", status: "open" }] })} />
    <Text style={styles.heading}>EVIDENCE REFERENCES</Text>
    <Text style={styles.text}>Optional photographs are copied to this device, not uploaded. Existing photograph/report references can also be recorded. Avoid personal information.</Text>
    {value.evidence.map((evidence, index) => <View style={styles.card} key={evidence.id}>
      <Input label={`Evidence ${index + 1} reference`} value={evidence.reference} max={1000} disabled={disabled} onChange={(reference) => onChange({ ...value, evidence: value.evidence.map((entry) => entry.id === evidence.id ? { ...entry, reference } : entry) })} />
      <Input label={`Evidence ${index + 1} notes`} value={evidence.notes} disabled={disabled} onChange={(notes) => onChange({ ...value, evidence: value.evidence.map((entry) => entry.id === evidence.id ? { ...entry, notes } : entry) })} />
    </View>)}
    <Choice label="ADD EVIDENCE REFERENCE" disabled={disabled || value.evidence.length >= 30} onPress={() => onChange({ ...value, evidence: [...value.evidence, { id: id(), reference: "", notes: "" }] })} />
    <Choice label="VIEW DRAFT DETAILS" onPress={onReview} />
    </>}
  </View>;
}
const styles = StyleSheet.create({
  heading: { color: "white", fontWeight: "800", fontSize: 16, marginVertical: 14 }, label: { color: "white", marginVertical: 8 },
  text: { color: "#B7BDC5", lineHeight: 22, marginBottom: 8 }, warning: { color: "#FDBA74", lineHeight: 22, marginVertical: 6 },
  card: { backgroundColor: "#191D20", padding: 12, borderRadius: 8, marginVertical: 8 }, choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { minHeight: 48, justifyContent: "center", padding: 12, borderWidth: 1, borderColor: "#FF641C", borderRadius: 8, marginVertical: 4 },
  selected: { backgroundColor: "#5A2A12", borderWidth: 2 }, buttonText: { color: "#FF9B63", fontWeight: "700" }, disabled: { opacity: 0.45 },
  input: { minHeight: 75, color: "white", fontSize: 16, padding: 12, borderWidth: 1, borderColor: "#505860", borderRadius: 7 },
});
