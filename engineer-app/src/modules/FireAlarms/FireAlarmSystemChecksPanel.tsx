import React from "react";
import DetectorSitingObservationsPanel from "./DetectorSitingObservationsPanel";
import { emptyDetectorSitingObservations } from "./detectorSitingGuidance";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { arcPassAllowed, MEASUREMENTS, numericReading, systemChecksProgress, systemCmin, toggleResult, type SystemChecks } from "./systemChecks";

function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.choice, selected && styles.selected, disabled && styles.disabled]}><Text style={styles.choiceText}>{label}</Text></Pressable>;
}
export default function FireAlarmSystemChecksPanel({ value, disabled, onChange }: { value: SystemChecks; disabled: boolean; onChange: (update: (value: SystemChecks) => SystemChecks) => void }) {
  const progress = systemChecksProgress(value); const calculation = systemCmin(value);
  return <View>
    <Text style={styles.pending}>Pending Validation</Text>
    <View style={styles.row}><Text style={styles.metric}>{progress.complete}/{progress.total}<Text style={styles.caption}> checks</Text></Text><Text style={[styles.metric, styles.fail]}>{progress.failed}<Text style={styles.caption}> failed</Text></Text></View>
    <Text style={styles.caption}>Visible/accessibly inspected equipment only.</Text>
    {value.template.questions.map((question, index) => {
      const answer = value.answers[index]; const isArc = question.id === "arc-signalling-receipt";
      return <View style={styles.card} key={question.id}>
        <Text style={styles.question}>{question.prompt}</Text>
        {question.id === "mains-isolation-protection" && <Text style={styles.caption}>Include relevant unswitched spur checks.</Text>}
        {isArc && <>
          <Text style={styles.label}>Monitored ARC connection fitted?</Text><View style={styles.row}>
            {(["yes", "no"] as const).map((choice) => <Choice key={choice} label={choice.toUpperCase()} selected={value.arcConnected === choice} disabled={disabled} onPress={() => onChange((draft) => ({ ...draft, arcConnected: choice,
              ...(draft.arcConnected !== choice ? { transmissionConfirmed: false, receiptConfirmed: false } : {}) }))} />)}
          </View>
          {value.arcConnected === "yes" && <View style={styles.row}>
            <Choice label={`${value.transmissionConfirmed ? "✓ " : ""}Transmission tested`} selected={value.transmissionConfirmed} disabled={disabled} onPress={() => onChange((draft) => ({ ...draft, transmissionConfirmed: !draft.transmissionConfirmed }))} />
            <Choice label={`${value.receiptConfirmed ? "✓ " : ""}Receipt confirmed`} selected={value.receiptConfirmed} disabled={disabled} onPress={() => onChange((draft) => ({ ...draft, receiptConfirmed: !draft.receiptConfirmed }))} />
          </View>}
          {!arcPassAllowed(value) && <Text style={styles.warning}>PASS needs a fitted connection, actual transmission test and confirmed receipt.</Text>}
        </>}
        <View style={styles.row}>{(["pass", "fail", "na"] as const).map((result) => {
          const selected = answer.result === result; const locked = disabled || (isArc && result === "pass" && !selected && !arcPassAllowed(value));
          const color = result === "pass" ? "#4ADE80" : result === "fail" ? "#F87171" : "#FBBF24";
          return <Pressable key={result} accessibilityRole="button" accessibilityLabel={`${question.prompt} ${result === "na" ? "N/A" : result.toUpperCase()}`} accessibilityState={{ selected, disabled: locked }} disabled={locked}
            onPress={() => onChange((draft) => ({ ...draft, answers: draft.answers.map((row) => row.checkId === question.id ? { ...row, result: toggleResult(row.result, result) } : row) }))}
            style={[styles.result, { borderColor: color }, selected && { borderWidth: 3, backgroundColor: "#30363B" }, locked && styles.disabled]}><Text style={[styles.resultText, { color }]}>{selected ? "✓ " : ""}{result === "na" ? "N/A" : result.toUpperCase()}</Text></Pressable>;
        })}</View>
        {answer.result === "fail" && <>
          <Text style={styles.label}>Fault explanation (required)</Text>
          <TextInput style={styles.input} accessibilityLabel={`${question.prompt} Fault explanation`} editable={!disabled} multiline maxLength={2000} value={answer.fault}
            onChangeText={(fault) => onChange((draft) => ({ ...draft, answers: draft.answers.map((row) => row.checkId === question.id ? { ...row, fault } : row) }))} />
          {!answer.fault.trim() && <Text style={styles.warning}>Describe the fault; you can continue to other checks.</Text>}
        </>}
      </View>;
    })}
    <View style={styles.card}><Text style={styles.question}>Building alterations affecting fire alarm coverage?</Text><View style={styles.row}>
      {(["yes", "no"] as const).map((choice) => <Choice key={choice} label={choice.toUpperCase()} selected={value.buildingChanges === choice} disabled={disabled} onPress={() => onChange((draft) => ({ ...draft, buildingChanges: choice }))} />)}
    </View>
    {value.buildingChanges === "yes" && <><Text style={styles.label}>Changes / coverage concerns (required)</Text><TextInput style={styles.input} accessibilityLabel="Building changes details" editable={!disabled} multiline maxLength={2000} value={value.buildingDetails} onChangeText={(buildingDetails) => onChange((draft) => ({ ...draft, buildingDetails }))} />
      {progress.buildingDetailsRequired && <Text style={styles.warning}>Describe the changes affecting coverage.</Text>}</>}
    </View>
    <DetectorSitingObservationsPanel value={value.detectorSitingObservations ?? emptyDetectorSitingObservations()} disabled={disabled}
      onChange={(update) => onChange((draft) => ({ ...draft, detectorSitingObservations: update(draft.detectorSitingObservations ?? emptyDetectorSitingObservations()) }))} />
    <View style={styles.card}><Text style={styles.question}>Power and battery measurements</Text><View style={styles.row}>
      {MEASUREMENTS.map(({ id, label, unit, positive }) => <View style={styles.numberField} key={id}>
        <Text style={styles.label}>{label} ({unit})</Text><TextInput accessibilityLabel={`${label} ${unit}`} editable={!disabled} style={styles.numberInput} keyboardType="decimal-pad" maxLength={40} value={value.measurements[id]}
          onChangeText={(text) => onChange((draft) => ({ ...draft, measurements: { ...draft.measurements, [id]: text } }))} />
        {!!value.measurements[id].trim() && numericReading(value.measurements[id], positive) === null && <Text style={styles.warning}>Enter a valid {positive ? "positive" : "non-negative"} number.</Text>}
      </View>)}
    </View>
    <Text style={styles.label}>Required capacity · existing Cmin method</Text><Text style={styles.metric}>{calculation ? `${calculation.cmin.toFixed(2)} Ah` : "— Ah"}</Text>
    <Text style={styles.caption}>{calculation ? "Indicative VRLA estimate; verify duty and manufacturer data." : "Enter positive currents and durations to calculate. No duty period is assumed."}</Text>
    </View>
    <View style={styles.card}><Text style={styles.label}>Additional Comments (optional)</Text><TextInput accessibilityLabel="Additional Comments optional" editable={!disabled} style={styles.input} multiline maxLength={2000} value={value.additionalComments} onChangeText={(additionalComments) => onChange((draft) => ({ ...draft, additionalComments }))} /></View>
  </View>;
}
const styles = StyleSheet.create({
  pending: { color: "#FDBA74", fontSize: 13, marginVertical: 6 }, card: { backgroundColor: "#191D20", padding: 12, borderRadius: 8, marginVertical: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, metric: { color: "#FF9B63", fontSize: 28, fontWeight: "800" }, fail: { color: "#F87171" },
  caption: { color: "#B7BDC5", fontSize: 13, lineHeight: 20 }, question: { color: "white", fontSize: 17, lineHeight: 24, fontWeight: "700", marginBottom: 8 },
  label: { color: "#E5E7EB", fontSize: 14, fontWeight: "600", marginVertical: 7 }, input: { color: "white", fontSize: 16, minHeight: 68, padding: 10, borderWidth: 1, borderColor: "#69717B", borderRadius: 7, textAlignVertical: "top" },
  result: { minHeight: 56, minWidth: 80, flexGrow: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 7, padding: 9 }, resultText: { fontSize: 18, fontWeight: "800" },
  choice: { minHeight: 48, padding: 10, borderWidth: 1, borderColor: "#75503B", borderRadius: 7, justifyContent: "center" }, selected: { backgroundColor: "#54270F", borderColor: "#FF641C", borderWidth: 2 }, choiceText: { color: "#FF9B63", fontWeight: "700" }, disabled: { opacity: 0.4 },
  warning: { color: "#FDBA74", fontSize: 13, lineHeight: 19, marginVertical: 5 }, numberField: { flexBasis: "45%", flexGrow: 1, minWidth: 120 }, numberInput: { color: "white", fontSize: 18, minHeight: 48, borderWidth: 1, borderColor: "#69717B", padding: 9, borderRadius: 7 },
});
