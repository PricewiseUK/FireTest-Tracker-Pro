import React, { useState } from "react";
import { calculateExistingCmin } from "../utils/cminCalculation";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";

import { MaterialCommunityIcons } from "@expo/vector-icons";

// =====================================================
// INSTAFIRE CMIN CALCULATOR
// BS 5839-1:2025 - ANNEX E
// VRLA BATTERIES
// =====================================================
// =====================================================
// CALCULATOR INPUT FIELD
// =====================================================

function InputField({ label, value, onChange, unit }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor="#656C73"
          selectTextOnFocus
        />

        <Text style={styles.unit}>{unit}</Text>
      </View>
    </View>
  );
}
export default function CminCalculator({ visible, onClose }) {
  const [standbyCurrent, setStandbyCurrent] = useState("");
  const [alarmCurrent, setAlarmCurrent] = useState("");

  const [standbyHours, setStandbyHours] = useState("24");
  const [alarmMinutes, setAlarmMinutes] = useState("30");

  // Convert user input to a number.
  // Also accepts commas as decimal separators.
  function toNumber(value) {
    if (!String(value).trim()) return NaN;

    return Number(String(value).replace(",", "."));
  }

  const standbyMA = toNumber(standbyCurrent);
  const alarmMA = toNumber(alarmCurrent);

  const hours = toNumber(standbyHours);
  const minutes = toNumber(alarmMinutes);

  const calculation = calculateExistingCmin(standbyMA, alarmMA, hours, minutes);
  const cmin = calculation?.cmin ?? null;
  const derating = calculation?.derating ?? null;

  function resetCalculator() {
    setStandbyCurrent("");
    setAlarmCurrent("");
    setStandbyHours("24");
    setAlarmMinutes("30");
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.overlay}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.card}>
            {/* HEADER */}

            <View style={styles.header}>
              <View style={styles.titleRow}>
                <MaterialCommunityIcons
                  name="calculator-variant"
                  size={28}
                  color="#FF641C"
                />

                <Text style={styles.title}>CMIN CALCULATOR</Text>
              </View>

              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close calculator"
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subtitle}>FIRE ALARM BATTERY CAPACITY</Text>

            {/* INPUTS */}

            <InputField
              label="Standby Current"
              value={standbyCurrent}
              onChange={setStandbyCurrent}
              unit="mA"
            />

            <InputField
              label="Alarm Current"
              value={alarmCurrent}
              onChange={setAlarmCurrent}
              unit="mA"
            />

            <InputField
              label="Standby Duration"
              value={standbyHours}
              onChange={setStandbyHours}
              unit="Hours"
            />

            <InputField
              label="Alarm Duration"
              value={alarmMinutes}
              onChange={setAlarmMinutes}
              unit="Minutes"
            />

            {/* RESULT */}

            <View style={styles.resultBox}>
              <Text style={styles.resultLabel}>MINIMUM BATTERY CAPACITY</Text>

              <Text style={styles.resultValue}>
                {cmin !== null && Number.isFinite(cmin)
                  ? `${cmin.toFixed(2)} Ah`
                  : "-- Ah"}
              </Text>

              <Text style={styles.resultInfo}>
                {cmin !== null
                  ? `Ageing factor: 1.25  |  Derating: ${derating}`
                  : "Enter the current readings"}
              </Text>
            </View>

            <Text style={styles.formula}>Cmin = 1.25 × (T₁I₁ + DI₂T₂)</Text>

            <Text style={styles.disclaimer}>
              BS 5839-1:2025 Annex E — VRLA batteries. Confirm the required
              standby period, battery selection, manufacturer derating data and
              panel charging capacity before installation.
            </Text>

            {/* RESET */}

            <TouchableOpacity
              style={styles.resetButton}
              onPress={resetCalculator}
            >
              <MaterialCommunityIcons
                name="refresh"
                size={20}
                color="#FF641C"
              />

              <Text style={styles.resetText}>RESET CALCULATOR</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// =====================================================
// STYLES
// =====================================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 18,
  },

  card: {
    backgroundColor: "#191D20",
    borderWidth: 1,
    borderColor: "#30363B",
    borderRadius: 14,
    padding: 22,
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
  },

  title: {
    flexShrink: 1,
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },

  closeButton: {
    padding: 8,
  },

  closeText: {
    color: "#9CA3AF",
    fontSize: 24,
  },

  subtitle: {
    color: "#FF641C",
    fontSize: 11,
    letterSpacing: 1.5,
    marginTop: 6,
    marginBottom: 24,
    fontWeight: "700",
  },

  inputGroup: {
    marginBottom: 15,
  },

  inputLabel: {
    color: "#9CA3AF",
    fontSize: 13,
    marginBottom: 7,
    fontWeight: "600",
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#30363B",
    backgroundColor: "#0B0D0E",
    borderRadius: 7,
  },

  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 19,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 48,
  },

  unit: {
    color: "#FF641C",
    fontWeight: "800",
    fontSize: 13,
    paddingHorizontal: 14,
  },

  resultBox: {
    backgroundColor: "#0B0D0E",
    borderColor: "#FF641C",
    borderWidth: 1,
    borderRadius: 8,
    padding: 20,
    alignItems: "center",
    marginTop: 10,
  },

  resultLabel: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textAlign: "center",
  },

  resultValue: {
    color: "#FF641C",
    fontSize: 39,
    fontWeight: "900",
    marginTop: 10,
  },

  resultInfo: {
    color: "#9CA3AF",
    fontSize: 11,
    marginTop: 8,
    textAlign: "center",
  },

  formula: {
    color: "#FFFFFF",
    textAlign: "center",
    marginTop: 17,
    fontSize: 13,
  },

  disclaimer: {
    color: "#9CA3AF",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 15,
    textAlign: "center",
  },

  resetButton: {
    borderWidth: 1,
    borderColor: "#FF641C",
    borderRadius: 7,
    padding: 13,
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },

  resetText: {
    color: "#FF641C",
    fontSize: 13,
    fontWeight: "800",
  },
});
