import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";

import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function InstafireDialog({
  visible,
  title,
  message,
  type = "warning",
  confirmText = "CONFIRM",
  cancelText = "CANCEL",
  onConfirm,
  onCancel,
  showCancel = true,
}) {
  const iconNames = {
    warning: "alert-circle-outline",
    error: "close-circle-outline",
    success: "check-circle-outline",
    info: "information-outline",
    question: "help-circle-outline",
  };

  const iconColours = {
    warning: "#FF641C",
    error: "#EF4444",
    success: "#22C55E",
    info: "#FF641C",
    question: "#FF641C",
  };

  const iconName = iconNames[type] || iconNames.warning;
  const iconColour = iconColours[type] || iconColours.warning;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons
              name={iconName}
              size={48}
              color={iconColour}
            />
          </View>

          <Text style={styles.title}>{title}</Text>

          <Text style={styles.message}>{message}</Text>

          <View style={styles.buttons}>
            {showCancel && (
              <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelText}>{cancelText}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
              <Text style={styles.confirmText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  dialog: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#191D20",
    borderWidth: 1,
    borderColor: "#30363B",
    borderRadius: 12,
    padding: 25,
    alignItems: "center",
  },

  iconContainer: {
    marginBottom: 18,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 12,
  },

  message: {
    color: "#9CA3AF",
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
    marginBottom: 28,
  },

  buttons: {
    flexDirection: "row",
    width: "100%",
    gap: 12,
  },

  cancelButton: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#505860",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },

  cancelText: {
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },

  confirmButton: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: 6,
    paddingVertical: 10,
    backgroundColor: "#FF641C",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },

  confirmText: {
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
});
