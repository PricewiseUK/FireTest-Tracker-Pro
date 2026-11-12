import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { checklistAnswerComplete, servicingProgress, type ServicingDraft } from "./servicingDraft";

export default function InspectionDraftReview({ value, notes, onEdit }: { value: ServicingDraft; notes: string; onEdit: () => void }) {
  const progress = servicingProgress(value);
  return <View>
    <Text style={styles.title}>DRAFT DETAILS</Text>
    <Text style={styles.count}>{progress.answered}/{progress.total} answered · {progress.failed} failed</Text>
    {!!progress.failedWithoutReason && <Text style={styles.warning}>{progress.failedWithoutReason} FAIL reason(s) still needed. You can continue answering.</Text>}
    <Text style={styles.text}>{progress.total - progress.answered} unanswered · {value.defects.length} defect observation(s) · {value.evidence.length} evidence reference(s), local only</Text>
    {value.checklist?.questions.map((question, index) => {
      const answer = value.answers[index];
      return <View key={question.id} style={styles.row}>
        <Text style={styles.text}>{index + 1}. {question.prompt}</Text>
        <Text style={styles.result}>{answer.result === "na" ? "N/A" : answer.result?.toUpperCase() ?? "UNANSWERED"}{answer.result === "fail" && !checklistAnswerComplete(answer) ? " · REASON NEEDED" : ""}</Text>
        {!!answer.notes && <Text style={styles.text}>Note: {answer.notes}</Text>}
        {!!answer.correctiveAction && <Text style={styles.text}>Action / referral: {answer.correctiveAction}</Text>}
      </View>;
    })}
    <Text style={styles.result}>ENGINEER NOTES</Text><Text style={styles.text}>{notes || "No notes recorded"}</Text>
    <Text style={styles.result}>DEFECT STATUS: {value.defectStatus.replaceAll("-", " ").toUpperCase()}</Text>
    {value.defects.map((defect) => <Text key={defect.id} style={styles.text}>{defect.status.toUpperCase()} · {defect.description || "Description missing"} · {defect.correctiveAction || "No action recorded"}</Text>)}
    <TouchableOpacity style={styles.button} accessibilityRole="button" onPress={onEdit}><Text style={styles.result}>RETURN TO CHECKS</Text></TouchableOpacity>
    <Text style={styles.text}>Local draft only. Submission and certification are disabled.</Text>
  </View>;
}
const styles = StyleSheet.create({
  title: { color: "white", fontSize: 19, fontWeight: "800", marginVertical: 12 }, count: { color: "#FF9B63", fontWeight: "800", fontSize: 28, marginVertical: 8 },
  text: { color: "#B7BDC5", lineHeight: 22, marginVertical: 4 }, warning: { color: "#FDBA74", lineHeight: 22, marginVertical: 5 },
  row: { backgroundColor: "#191D20", padding: 10, borderRadius: 8, marginVertical: 4 }, result: { color: "white", fontWeight: "800", lineHeight: 23 },
  button: { minHeight: 48, padding: 12, justifyContent: "center", borderColor: "#FF641C", borderWidth: 1, borderRadius: 8, marginVertical: 6 },
});
