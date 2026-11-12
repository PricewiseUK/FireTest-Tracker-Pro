import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { checklistAnswerComplete, servicingProgress, type ServicingDraft } from "./servicingDraft";

/** The same controls render demo or future approved equipment-specific snapshots. */
export default function ExtinguisherChecklist({ value, onAnswer, onRecord, onAddPhoto, disabled }: {
  value: ServicingDraft; onAnswer: (questionId: string, patch: Partial<ServicingDraft["answers"][number]>) => void; onRecord: () => void;
  onAddPhoto: (questionId: string) => Promise<void>; disabled: boolean;
}) {
  const [details, setDetails] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const progress = servicingProgress(value);
  if (!value.checklist) return null;
  return <View>
    <View style={styles.progress} accessible accessibilityLabel={`${progress.answered} of ${progress.total} answered, ${progress.failed} failed`} accessibilityLiveRegion="polite">
      <View style={styles.metric}><Text style={styles.count}>{progress.answered}/{progress.total}</Text><Text style={styles.caption}>answered</Text></View>
      <View style={styles.metric}><Text style={[styles.count, styles.fail]}>{progress.failed}</Text><Text style={styles.caption}>failed</Text></View>
    </View>
    {value.checklist.questions.map((question, index) => {
      const answer = value.answers[index];
      const needsNote = answer.result === "fail";
      const showDetails = needsNote || details.includes(question.id);
      const update = (patch: Partial<typeof answer>, record = false) => {
        onAnswer(question.id, patch);
        if (record) onRecord();
      };
      return <View key={question.id} style={styles.card}>
        <Text style={styles.question}>{index + 1}. {question.prompt}</Text>
        <View style={styles.results}>
          {(["pass", "fail", "na"] as const).map((result) => {
            const selected = answer.result === result;
            const colour = result === "pass" ? "#4ADE80" : result === "fail" ? "#F87171" : "#FBBF24";
            const label = result === "na" ? "N/A" : result.toUpperCase();
            return <TouchableOpacity key={result} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected, disabled }}
              accessibilityLabel={`Question ${index + 1}: ${label}`} onPress={() => update({ result }, true)}
              style={[styles.resultButton, { borderColor: colour }, selected && { backgroundColor: result === "pass" ? "#123522" : result === "fail" ? "#421E23" : "#3C3012", borderWidth: 3 }, disabled && styles.disabled]}>
              <Text style={[styles.resultText, { color: colour }]}>{selected ? "✓ " : ""}{label}</Text>
            </TouchableOpacity>;
          })}
        </View>
        {!checklistAnswerComplete(answer) && answer.result === "fail" && <Text style={styles.warning}>Add a reason below. You can continue to other checks.</Text>}
        {showDetails && <>
          <Text style={styles.label}>{answer.result === "fail" ? "Why did this check fail? (required)" : "Previous notes (optional)"}</Text>
          <TextInput accessibilityLabel={`Question ${index + 1}: ${answer.result === "fail" ? "Why did this check fail?" : "Previous notes, optional"}`} editable={!disabled} value={answer.notes}
            onChangeText={(notes) => update({ notes })} style={styles.input} multiline maxLength={2000} textAlignVertical="top" />
          {!!answer.correctiveAction && <>
            <Text style={styles.label}>Previous corrective action / referral (optional)</Text>
            <TextInput accessibilityLabel={`Question ${index + 1}: Corrective action or referral`} editable={!disabled} value={answer.correctiveAction} onChangeText={(correctiveAction) => update({ correctiveAction })} style={styles.input} multiline maxLength={2000} textAlignVertical="top" />
          </>}
        </>}
        {!needsNote && (!!answer.notes || !!answer.correctiveAction) && <TouchableOpacity accessibilityRole="button" style={styles.link} onPress={() => setDetails((current) => current.includes(question.id) ? current.filter((id) => id !== question.id) : [...current, question.id])}><Text style={styles.linkText}>{showDetails ? "Hide" : "Show"} previous notes / actions (kept)</Text></TouchableOpacity>}
        {answer.result === "fail" && <>
          <TouchableOpacity disabled={disabled || photoBusy || value.evidence.length >= 30} accessibilityRole="button" accessibilityLabel={`Question ${index + 1}: Add optional photo`} style={styles.link}
            onPress={() => { setPhotoBusy(true); void onAddPhoto(question.id).finally(() => setPhotoBusy(false)); }}><Text style={styles.linkText}>{photoBusy ? "Opening photo…" : "+ Optional photograph"}</Text></TouchableOpacity>
          <Text style={styles.hint}>{value.evidence.filter((entry) => entry.notes === `Question ${question.id}: local photograph`).length} local photo reference(s) · not uploaded</Text>
        </>}
      </View>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  progress: { flexDirection: "row", flexWrap: "wrap", gap: 18, paddingVertical: 6 }, metric: { flexDirection: "row", alignItems: "center", gap: 6 },
  caption: { color: "#B7BDC5", fontSize: 14 }, count: { color: "#FF9B63", fontSize: 24, fontWeight: "800", fontVariant: ["tabular-nums"] }, fail: { color: "#F87171" },
  hint: { color: "#B7BDC5", lineHeight: 20, marginVertical: 5 }, card: { backgroundColor: "#191D20", borderRadius: 8, padding: 12, marginVertical: 5 },
  question: { color: "white", fontSize: 17, fontWeight: "700", lineHeight: 25, marginBottom: 8 }, results: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  resultButton: { minHeight: 56, minWidth: 86, flexGrow: 1, padding: 10, justifyContent: "center", alignItems: "center", borderWidth: 1, borderRadius: 8 },
  resultText: { fontWeight: "800", fontSize: 18 }, label: { color: "white", fontWeight: "700", marginVertical: 6 },
  input: { minHeight: 64, borderWidth: 1, borderColor: "#69717B", borderRadius: 6, padding: 10, fontSize: 16, color: "white" },
  warning: { color: "#FDBA74", marginVertical: 5 }, link: { minHeight: 48, justifyContent: "center", paddingVertical: 8 }, linkText: { color: "#FF9B63", fontWeight: "700" }, disabled: { opacity: 0.45 },
});
