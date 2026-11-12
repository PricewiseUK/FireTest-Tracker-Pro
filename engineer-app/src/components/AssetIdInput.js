import React, { useEffect, useState } from "react";

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { MaterialCommunityIcons } from "@expo/vector-icons";

const COLORS = {
  card: "#191D20",
  orange: "#FF641C",
  white: "#FFFFFF",
  grey: "#9CA3AF",
  border: "#30363B",
};

export default function AssetIdInput({
  companyId,
  siteId,
  discipline,
  onChange,
  disabled = false,
}) {
  const [prefix, setPrefix] = useState("");
  const [number, setNumber] = useState("");
  const [rememberPrefix, setRememberPrefix] = useState(false);
  const [ready, setReady] = useState(false);

  const storageKey = [
    "instafire",
    "asset-prefix",
    companyId,
    siteId,
    discipline,
  ].join(":");

  useEffect(() => {
    let active = true;

    async function loadPrefix() {
      setReady(false);
      setPrefix("");
      setNumber("");
      setRememberPrefix(false);

      try {
        if (!companyId || !siteId || !discipline) {
          return;
        }

        const savedPrefix = await AsyncStorage.getItem(storageKey);

        if (active && savedPrefix !== null) {
          setPrefix(savedPrefix);
          setRememberPrefix(true);
        }
      } catch (error) {
        console.error("Unable to load saved asset prefix:", error);
      } finally {
        if (active) {
          setReady(true);
        }
      }
    }

    loadPrefix();

    return () => {
      active = false;
    };
  }, [storageKey, companyId, siteId, discipline]);

  useEffect(() => {
    if (!ready) return;

    onChange?.({
      prefix,
      number,
      assetNumber: `${prefix}${number}`,
    });
  }, [prefix, number, ready, onChange]);

  const updatePrefix = async (value) => {
    setPrefix(value);

    if (rememberPrefix) {
      try {
        await AsyncStorage.setItem(storageKey, value);
      } catch (error) {
        console.error("Unable to save asset prefix:", error);
      }
    }
  };

  const toggleRemember = async () => {
    const nextValue = !rememberPrefix;

    setRememberPrefix(nextValue);

    try {
      if (nextValue) {
        await AsyncStorage.setItem(storageKey, prefix);
      } else {
        await AsyncStorage.removeItem(storageKey);
      }
    } catch (error) {
      console.error("Unable to update remembered prefix:", error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ASSET IDENTIFICATION</Text>

      <View style={styles.inputRow}>
        <View style={styles.prefixField}>
          <Text style={styles.label}>PREFIX</Text>

          <TextInput
            style={styles.input}
            value={prefix}
            onChangeText={updatePrefix}
            placeholder="EXT"
            placeholderTextColor={COLORS.grey}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={20}
            editable={ready && !disabled}
          />
        </View>

        <View style={styles.numberField}>
          <Text style={styles.label}>ASSET NUMBER</Text>

          <TextInput
            style={styles.input}
            value={number}
            onChangeText={setNumber}
            placeholder="001"
            placeholderTextColor={COLORS.grey}
            autoCorrect={false}
            maxLength={40}
            editable={ready && !disabled}
          />
        </View>
      </View>

      <View style={styles.preview}>
        <Text style={styles.previewLabel}>COMPLETE ASSET ID</Text>

        <Text style={styles.previewValue}>
          {prefix || number ? `${prefix}${number}` : "Not entered"}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.rememberRow}
        onPress={toggleRemember}
        disabled={!ready || disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: rememberPrefix }}
      >
        <MaterialCommunityIcons
          name={rememberPrefix ? "checkbox-marked" : "checkbox-blank-outline"}
          size={25}
          color={rememberPrefix ? COLORS.orange : COLORS.grey}
        />

        <Text style={styles.rememberText}>
          Remember this prefix for the next asset
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },

  title: {
    color: COLORS.grey,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 15,
  },

  inputRow: {
    flexDirection: "row",
    gap: 12,
  },

  prefixField: {
    flex: 1,
  },

  numberField: {
    flex: 1,
  },

  label: {
    color: COLORS.grey,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 8,
  },

  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 14,
    height: 52,
  },

  preview: {
    backgroundColor: COLORS.card,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.orange,
    padding: 14,
    marginTop: 16,
    borderRadius: 6,
  },

  previewLabel: {
    color: COLORS.grey,
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 6,
  },

  previewValue: {
    color: COLORS.orange,
    fontSize: 20,
    fontWeight: "900",
  },

  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    minHeight: 44,
  },

  rememberText: {
    flex: 1,
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "600",
  },
});
