import React, { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { signOut } from "firebase/auth";
import { auth } from "../firebaseConfig";
import InstafireDialog from "../components/InstafireDialog";

export default function SettingsScreen({ goHome }) {
  const insets = useSafeAreaInsets();
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);

  const handleSignOut = () => {
    setShowSignOutDialog(true);
  };

  const confirmSignOut = async () => {
    setShowSignOutDialog(false);

    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign out failed:", error);
      setShowErrorDialog(true);
    }
  };

  const [showErrorDialog, setShowErrorDialog] = useState(false);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={goHome}>
          <MaterialCommunityIcons name="arrow-left" size={26} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>SETTINGS</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>ENGINEER ACCOUNT</Text>

        <View style={styles.accountCard}>
          <MaterialCommunityIcons
            name="account-circle-outline"
            size={32}
            color="#FF641C"
          />

          <View style={styles.accountDetails}>
            <Text style={styles.accountLabel}>SIGNED IN AS</Text>
            <Text style={styles.accountEmail}>
              {auth.currentUser?.email || "Engineer"}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <MaterialCommunityIcons name="logout" size={22} color="#FFFFFF" />

          <Text style={styles.signOutText}>SIGN OUT</Text>
        </TouchableOpacity>

        <Text style={styles.version}>INSTAFIRE • VERSION 1.0</Text>
      </View>
      <InstafireDialog
        visible={showSignOutDialog}
        title="SIGN OUT"
        message="Are you sure you want to sign out of Instafire?"
        type="question"
        confirmText="SIGN OUT"
        cancelText="CANCEL"
        onConfirm={confirmSignOut}
        onCancel={() => setShowSignOutDialog(false)}
      />

      <InstafireDialog
        visible={showErrorDialog}
        title="SIGN OUT FAILED"
        message="Unable to sign out. Please try again."
        type="error"
        confirmText="OK"
        showCancel={false}
        onConfirm={() => setShowErrorDialog(false)}
        onCancel={() => setShowErrorDialog(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0D0E",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#30363B",
    gap: 18,
  },

  headerTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 1,
  },

  content: {
    padding: 20,
  },

  sectionTitle: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 15,
  },

  accountCard: {
    backgroundColor: "#191D20",
    borderRadius: 10,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#30363B",
  },

  accountDetails: {
    marginLeft: 15,
    flex: 1,
  },

  accountLabel: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 5,
  },

  accountEmail: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  signOutButton: {
    backgroundColor: "#FF641C",
    borderRadius: 8,
    height: 55,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 25,
    gap: 12,
  },

  signOutText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
  },

  version: {
    color: "#9CA3AF",
    textAlign: "center",
    fontSize: 11,
    marginTop: 35,
  },
});
