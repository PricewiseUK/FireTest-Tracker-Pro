import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  DETECTOR_SITING_GUIDANCE, detectorSitingProgress, observationGuidance, selectSitingResult,
  type DetectorSitingObservations, type SitingObservation,
} from "./detectorSitingGuidance";

function Guidance({ answer }: { answer: SitingObservation }) {
  const [expanded, setExpanded] = useState(true);
  const guidance = observationGuidance(answer);
  if (!guidance) return null;
  const ref = answer.guidanceRef!;
  return <View style={styles.guidance}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
      accessibilityLabel={`Why has this failed? ${guidance.title}`}
      onPress={() => setExpanded((current) => !current)} style={styles.disclosure}>
      <Text style={styles.heading}>Why has this failed?</Text>
      <Text style={styles.caption}>{expanded ? "Collapse" : "Expand"}</Text>
    </Pressable>
    {expanded && <>
      <Text style={styles.label}>{guidance.title}</Text>
      <Text style={styles.caption}>{guidance.explanation}</Text>
      <Text style={styles.reference}>{ref.standard}:{ref.edition} ? Clause {ref.clause}</Text>
      <Text style={styles.label}>Suggested corrective action</Text>
      <Text style={styles.caption}>{guidance.action}</Text>
      <Text style={styles.caption}>Advisory guidance only. Use the site conditions and agreed inspection scope to make your own assessment.</Text>
    </>}
  </View>;
}

export default function DetectorSitingObservationsPanel({ value, disabled, onChange }: {
  value: DetectorSitingObservations; disabled: boolean;
  onChange: (update: (value: DetectorSitingObservations) => DetectorSitingObservations) => void;
}) {
  const progress = detectorSitingProgress(value);
  return <View style={styles.section}>
    <Text style={styles.heading}>Detector Siting / Installation Observations</Text>
    <Text style={styles.caption}>Optional observations of visible, accessible installation conditions within the agreed inspection scope. Separate from device operation testing; this is not a full design compliance survey.</Text>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value.inScope, disabled }} disabled={disabled}
      onPress={() => onChange((draft) => ({ ...draft, inScope: !draft.inScope }))} style={[styles.scope, disabled && styles.disabled]}>
      <Text style={styles.heading}>{value.inScope ? "? " : "? "}Include observations in this inspection</Text>
    </Pressable>
    {!value.inScope && value.answers.some((row) => row.result !== null || row.notes || row.deviceOrLocation) &&
      <Text style={styles.caption}>Previous observations are retained in this local draft. Enable the section to review them.</Text>}
    {value.inScope && <>
      <Text style={styles.caption}>{progress.complete}/{progress.total} observations recorded ? {progress.failed} failed</Text>
      <Text style={styles.caption}>Leave uninspected items Not Tested; use N/A only where assessed as not applicable. Guidance does not create or approve a defect or certify compliance.</Text>
      {value.answers.map((answer) => {
        const topic = DETECTOR_SITING_GUIDANCE.find((entry) => entry.checkId === answer.checkId)!;
        return <View key={answer.checkId} style={styles.card}>
          <Text style={styles.question}>{topic.prompt}</Text>
          <Text style={styles.caption}>{answer.result === null ? "Not Tested" : answer.result === "na" ? "N/A" : answer.result.toUpperCase()}</Text>
          <View style={styles.row}>
            {(["pass", "fail", "na"] as const).map((result) => {
              const selected = answer.result === result;
              const color = result === "pass" ? "#4ADE80" : result === "fail" ? "#F87171" : "#FBBF24";
              return <Pressable key={result} accessibilityRole="button" disabled={disabled}
                accessibilityLabel={`${topic.title}: ${result === "na" ? "N/A" : result.toUpperCase()}`}
                accessibilityState={{ selected, disabled }}
                onPress={() => onChange((draft) => selectSitingResult(draft, answer.checkId, result))}
                style={[styles.result, { borderColor: color }, selected && styles.selected, disabled && styles.disabled]}>
                <Text style={[styles.resultText, { color }]}>{selected ? "? " : ""}{result === "na" ? "N/A" : result.toUpperCase()}</Text>
              </Pressable>;
            })}
          </View>
          <Text style={styles.label}>Device reference / location (optional)</Text>
          <TextInput accessibilityLabel={`${topic.title}: device reference or location optional`} editable={!disabled}
            style={styles.input} maxLength={300} value={answer.deviceOrLocation}
            onChangeText={(deviceOrLocation) => onChange((draft) => ({ ...draft, answers: draft.answers.map((row) => row.checkId === answer.checkId ? { ...row, deviceOrLocation } : row) }))} />
          {answer.result === "fail" && <>
            <Guidance answer={answer} />
            <Text style={styles.label}>What was actually found? (required)</Text>
            <TextInput accessibilityLabel={`${topic.title}: failure notes required`} editable={!disabled}
              multiline maxLength={2000} style={[styles.input, styles.notes]} value={answer.notes}
              onChangeText={(notes) => onChange((draft) => ({ ...draft, answers: draft.answers.map((row) => row.checkId === answer.checkId ? { ...row, notes } : row) }))} />
            {!answer.notes.trim() && <Text accessibilityRole="alert" style={styles.warning}>Describe the site condition in your own words. This failed observation is incomplete until notes are entered; you can still save the draft.</Text>}
          </>}
        </View>;
      })}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  section: { marginVertical: 12 }, heading: { color: "#FF9B63", fontSize: 16, lineHeight: 23, fontWeight: "700" },
  caption: { color: "#B7BDC5", fontSize: 13, lineHeight: 20, marginVertical: 4 },
  scope: { minHeight: 48, justifyContent: "center", padding: 10, borderWidth: 1, borderColor: "#75503B", borderRadius: 7, marginVertical: 8 },
  card: { backgroundColor: "#191D20", padding: 12, borderRadius: 8, marginVertical: 6 },
  question: { color: "white", fontSize: 17, lineHeight: 24, fontWeight: "700", marginBottom: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 6 },
  result: { minHeight: 56, minWidth: 80, flexGrow: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 7, padding: 9 },
  resultText: { fontSize: 18, fontWeight: "800" }, selected: { borderWidth: 3, backgroundColor: "#30363B" }, disabled: { opacity: 0.4 },
  label: { color: "#E5E7EB", fontSize: 14, fontWeight: "600", marginVertical: 7 },
  input: { color: "white", fontSize: 16, minHeight: 48, padding: 10, borderWidth: 1, borderColor: "#69717B", borderRadius: 7 },
  notes: { minHeight: 76, textAlignVertical: "top" },
  guidance: { backgroundColor: "#222629", padding: 10, borderLeftWidth: 3, borderLeftColor: "#FF641C", borderRadius: 6, marginTop: 10 },
  disclosure: { minHeight: 48, justifyContent: "center" },
  reference: { color: "#FF9B63", fontSize: 14, fontWeight: "700", marginVertical: 8 },
  warning: { color: "#FDBA74", fontSize: 13, lineHeight: 20, marginVertical: 5 },
});
