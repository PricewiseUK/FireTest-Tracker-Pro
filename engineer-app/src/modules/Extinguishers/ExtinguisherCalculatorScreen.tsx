import React, { useEffect, useRef, useState } from "react";
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { calculateBuilding, calculateStorey, parseDecimal, type StoreyInput } from "./extinguisherCalculations";

type Floor = { id: string; name: string; area: string; installed: { quantity: string; rating: string }[]; additionalRating: string };
const hazards = ["Electrical equipment", "Commercial kitchen / cooking oils", "Flammable liquids", "Specialist risks (metals, gases, batteries or processes)"];
const format = (value: number) => Number(value.toFixed(6)).toString();
function Field({ label, value, onChange, numeric = true }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} value={value} onChangeText={onChange} maxLength={numeric ? 20 : 100} keyboardType={numeric ? "decimal-pad" : "default"} autoCapitalize="none" /></View>;
}
function Button({ title, onPress }: { title: string; onPress: () => void }) {
  return <TouchableOpacity style={styles.button} accessibilityRole="button" onPress={onPress}><Text style={styles.buttonText}>{title}</Text></TouchableOpacity>;
}
export default function ExtinguisherCalculatorScreen({ goBack }: { goBack: () => void }) {
  useEffect(() => {
    const back = BackHandler.addEventListener("hardwareBackPress", () => { goBack(); return true; });
    return () => back.remove();
  }, [goBack]);
  const { width, fontScale } = useWindowDimensions();
  const narrow = width < 360 || fontScale > 1.3;
  const fieldWidth = narrow ? styles.fullWidth : styles.flex;
  const nextId = useRef(1);
  const [floors, setFloors] = useState<Floor[]>([{ id: "0", name: "Ground floor", area: "", installed: [], additionalRating: "" }]);
  const [selectedHazards, setSelectedHazards] = useState<string[]>([]);
  const [hazardsOpen, setHazardsOpen] = useState(false);
  function edit(id: string, patch: Partial<Floor>) { setFloors((current) => current.map((floor) => floor.id === id ? { ...floor, ...patch } : floor)); }
  let inputs: StoreyInput[] = [];
  let result: ReturnType<typeof calculateBuilding> | null = null; let error = "";
  try {
    inputs = floors.map((floor) => ({ id: floor.id, name: floor.name, areaM2: parseDecimal(floor.area, `${floor.name} area`),
      installed: floor.installed.map((group) => ({ quantity: parseDecimal(group.quantity, "Quantity", true), ratingA: parseDecimal(group.rating, "Labelled Class A rating") })) }));
    result = calculateBuilding(inputs);
  } catch (err) { error = (err as Error).message; }
  // App.js owns the safe area and lays bottom navigation outside this flex child.
  return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <TouchableOpacity style={styles.back} accessibilityRole="button" accessibilityLabel="Back to Fire Extinguishers" onPress={goBack}>
      <Text style={styles.buttonText}>‹  Fire Extinguishers</Text>
    </TouchableOpacity>
    <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
      <Text style={styles.title}>BUILDING EXTINGUISHER CALCULATOR</Text>
      <Text style={styles.warning}>INDICATIVE ONLY · Area × 0.065. Arithmetic does not prove BS 5306 compliance.</Text>
      {floors.map((floor, floorIndex) => <View key={floor.id} style={styles.card}>
        <View style={[styles.row, narrow && styles.stack]}>
          <View style={fieldWidth}><Field label={`Storey ${floorIndex + 1} name`} value={floor.name} onChange={(name) => edit(floor.id, { name })} numeric={false} /></View>
          <View style={fieldWidth}><Field label="Area (m², up to 3 decimals)" value={floor.area} onChange={(area) => edit(floor.id, { area })} /></View>
        </View>
        <Text style={styles.heading}>INSTALLED EXTINGUISHERS</Text>
        {floor.installed.length === 0 && <Text style={styles.text}>No installed Class A units entered.</Text>}
        {floor.installed.map((group, index) => <View key={index} style={[styles.row, narrow && styles.stack]}>
          <View style={fieldWidth}><Field label="Quantity" value={group.quantity} onChange={(quantity) => edit(floor.id, { installed: floor.installed.map((entry, i) => i === index ? { ...entry, quantity } : entry) })} /></View>
          <View style={fieldWidth}><Field label="Labelled A rating" value={group.rating} onChange={(rating) => edit(floor.id, { installed: floor.installed.map((entry, i) => i === index ? { ...entry, rating } : entry) })} /></View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove installed rating group ${index + 1} from ${floor.name}`} style={styles.remove} onPress={() => edit(floor.id, { installed: floor.installed.filter((_, i) => i !== index) })}><Text style={styles.buttonText}>Remove</Text></TouchableOpacity>
        </View>)}
        <Button title="+ Installed rating group" onPress={() => edit(floor.id, { installed: [...floor.installed, { quantity: "", rating: "" }] })} />
        <Text style={styles.label}>Additional unit: actual labelled A rating</Text>
        <View style={styles.presets}>{[8, 13, 21, 34].map((value) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: floor.additionalRating === String(value) }} accessibilityLabel={`Use ${value}A additional rating for ${floor.name}`} style={[styles.preset, floor.additionalRating === String(value) && styles.selected]} onPress={() => edit(floor.id, { additionalRating: String(value) })}><Text style={styles.buttonText}>{value}A</Text></TouchableOpacity>)}</View>
        <Field label="Selected / custom A rating (enter 13 for 13A)" value={floor.additionalRating} onChange={(additionalRating) => edit(floor.id, { additionalRating })} />
        {result && (() => {
          const row = result.storeys[floorIndex];
          let proposal: ReturnType<typeof calculateStorey> | null = null;
          let proposalError = "Select or enter a valid labelled A rating to calculate the addition.";
          if (floor.additionalRating.trim()) {
            try { proposal = calculateStorey({ ...inputs[floorIndex], additionalRatingA: parseDecimal(floor.additionalRating, "Additional unit labelled A rating") }); }
            catch (err) { proposalError = (err as Error).message; }
          }
          const shortfall = row.shortfallA > 0;
          return <View style={[styles.results, { borderLeftColor: shortfall ? "#F87171" : "#4ADE80" }]} accessibilityLiveRegion="polite">
            <View style={[styles.row, narrow && styles.stack]}>
              <View style={fieldWidth}><Text style={styles.label}>Required Rating</Text><Text style={styles.number}>{format(row.demandA)}A</Text></View>
              <View style={fieldWidth}><Text style={styles.label}>Installed Rating</Text><Text style={styles.number}>{row.installedA}A</Text></View>
            </View>
            <Text style={styles.label}>RATING SHORTFALL</Text>
            <Text selectable style={[styles.number, shortfall ? styles.negative : styles.positive]}>{format(row.shortfallA)}A{shortfall ? " SHORTFALL" : ""}</Text>
            {shortfall ? <>
              <Text style={styles.additionLabel}>INDICATIVE ADDITION REQUIRED</Text>
              {proposal ? <>
                <Text selectable style={[styles.number, styles.amber]}>+{proposal.additionalUnits} × {proposal.additionalRatingA}A</Text>
                <Text style={styles.text}>{proposal.additionalUnits === 1 ? "extinguisher" : "extinguishers"} · Resulting total: <Text style={styles.total}>{row.installedA + proposal.additionalUnits! * proposal.additionalRatingA!}A</Text></Text>
              </> : <Text style={styles.warning} accessibilityRole="alert">{proposalError}</Text>}
            </> : <Text style={[styles.outcome, styles.positive]}>AREA-BASED RATING MET — NO ADDITION REQUIRED BY THIS CALCULATION</Text>}
          </View>;
        })()}
        {floors.length > 1 && <Button title="Remove this storey" onPress={() => setFloors((current) => current.filter((entry) => entry.id !== floor.id))} />}
      </View>)}
      {!!error && <Text style={styles.warning} accessibilityRole="alert">{error}</Text>}
      {floors.length < 100 && <Button title="+ Storey" onPress={() => { const id = String(nextId.current++); setFloors((current) => [...current, { id, name: `Storey ${current.length + 1}`, area: "", installed: [], additionalRating: "" }]); }} />}
      {result && <View style={styles.results} accessibilityLiveRegion="polite">
        <Text style={styles.label}>BUILDING — SUM OF STOREY SHORTFALLS</Text>
        <Text style={[styles.number, result.totalShortfallA > 0 ? styles.negative : styles.positive]}>{format(result.totalShortfallA)}A</Text>
        <Text style={styles.text}>Floors are independent. Surplus on one floor cannot cover another.</Text>
      </View>}
      <TouchableOpacity style={styles.button} accessibilityRole="button" accessibilityState={{ expanded: hazardsOpen }} onPress={() => setHazardsOpen((open) => !open)}><Text style={styles.buttonText}>{hazardsOpen ? "−" : "+"} Hazards & safety limits ({selectedHazards.length} flagged)</Text></TouchableOpacity>
      {hazardsOpen && <View style={styles.card}>
        {hazards.map((hazard) => <View style={styles.hazard} key={hazard}><Text style={[styles.text, styles.flex]}>{hazard}</Text><Switch accessibilityLabel={hazard} value={selectedHazards.includes(hazard)} trackColor={{ true: "#FF641C" }} onValueChange={(selected) => setSelectedHazards((current) => selected ? [...current, hazard] : current.filter((entry) => entry !== hazard))} /></View>)}
        <Text style={styles.warning}>Flagged hazards require site-specific assessment. This calculator does not select extinguishing media, types or quantities for special risks.</Text>
        <Text style={styles.text}>Enter actual labelled A ratings. Size, capacity and medium do not determine a rating. Minimum quantities, small-premises exceptions, distribution and suitability are not evaluated.</Text>
        <Text style={styles.text}>Positioning, access, obstructions and actual travel routes require assessment. No layout is supplied; travel distances are not verified.</Text>
      </View>}
      <Text style={styles.text}>Indicative area-based calculation only. Minimum provision, positioning and special hazards still require competent assessment; no compliance finding is made.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, width: "100%", maxWidth: 840, alignSelf: "center", backgroundColor: "#0B0D0E", paddingHorizontal: 12 }, scroll: { flex: 1 }, content: { paddingBottom: 20 },
  back: { minHeight: 48, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 8 },
  title: { color: "white", fontSize: 18, fontWeight: "800", marginBottom: 4 }, heading: { color: "white", fontWeight: "800", marginVertical: 6 },
  text: { color: "#B7BDC5", lineHeight: 21, marginVertical: 4 }, warning: { color: "#FDBA74", lineHeight: 21, marginVertical: 6 },
  card: { backgroundColor: "#191D20", borderRadius: 10, padding: 12, marginVertical: 6 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 }, stack: { flexDirection: "column", alignItems: "stretch" }, flex: { flex: 1, minWidth: 0 }, fullWidth: { alignSelf: "stretch", minWidth: 0 },
  field: { marginVertical: 4 }, label: { color: "white", fontSize: 14, marginVertical: 4 }, input: { minHeight: 48, borderRadius: 7, borderWidth: 1, borderColor: "#505860", color: "white", padding: 10, fontSize: 16 },
  button: { minHeight: 48, borderColor: "#FF641C", borderWidth: 1, padding: 10, justifyContent: "center", borderRadius: 8, marginVertical: 6 }, buttonText: { color: "#FF9B63", fontWeight: "800" },
  remove: { minHeight: 48, justifyContent: "center", paddingHorizontal: 8, marginBottom: 4 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, preset: { minWidth: 48, minHeight: 48, padding: 10, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#505860", borderRadius: 7 }, selected: { borderColor: "#FF641C", backgroundColor: "#352115" },
  results: { backgroundColor: "#111517", borderRadius: 8, borderLeftWidth: 4, borderLeftColor: "#FF641C", padding: 12, marginVertical: 8 },
  number: { color: "white", fontSize: 30, lineHeight: 38, fontWeight: "800", fontVariant: ["tabular-nums"], flexShrink: 1 },
  negative: { color: "#F87171" }, positive: { color: "#4ADE80" }, amber: { color: "#FBBF24" },
  additionLabel: { color: "#FBBF24", fontWeight: "800", marginTop: 4 }, total: { color: "white", fontWeight: "800", fontSize: 18 }, outcome: { fontWeight: "800", lineHeight: 22 },
  hazard: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
});
