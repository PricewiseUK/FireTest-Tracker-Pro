import React from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

type Tone = "accent" | "positive" | "warning" | "negative";
const colours: Record<Tone, string> = {
  accent: "#FF9B63", positive: "#4ADE80", warning: "#FBBF24", negative: "#F87171",
};

/** Shared presentation for indicative ratings and local inspection summaries. */
export default function ExtinguisherResultCard({ label, value, status, detail, tone = "accent" }: {
  label: string; value: string; status: string; detail: string; tone?: Tone;
}) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.3;
  const colour = colours[tone];
  return <View style={[styles.card, { borderLeftColor: colour }]} accessible accessibilityLabel={`${label}. ${value}. ${status}. ${detail}`}>
    <Text style={styles.label}>{label}</Text>
    <Text selectable style={[styles.value, { color: colour, fontSize: compact ? 28 : 36, lineHeight: compact ? 36 : 44 }]}>{value}</Text>
    <Text style={[styles.status, { color: colour }]}>{status}</Text>
    <Text style={styles.detail}>{detail}</Text>
  </View>;
}

const styles = StyleSheet.create({
  // A single full-width column, no fixed height or one-line truncation. Text can
  // wrap and respect the user's font scale on narrow phones and larger text sizes.
  card: { alignSelf: "stretch", minWidth: 0, backgroundColor: "#111517", borderWidth: 1, borderColor: "#394149", borderLeftWidth: 5, borderRadius: 10, padding: 14, marginVertical: 7 },
  label: { color: "#FFFFFF", fontSize: 15, fontWeight: "800", marginBottom: 8, flexShrink: 1 },
  value: { fontWeight: "800", fontVariant: ["tabular-nums"], alignSelf: "stretch", flexShrink: 1, marginBottom: 6 },
  status: { fontSize: 16, fontWeight: "800", lineHeight: 23, marginBottom: 6, flexShrink: 1 },
  detail: { color: "#C4CBD2", fontSize: 14, lineHeight: 21, flexShrink: 1 },
});
