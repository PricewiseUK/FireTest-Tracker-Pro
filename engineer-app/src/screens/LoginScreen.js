import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";

import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebaseConfig";

const COLORS = {
  background: "#0B0D0E",
  card: "#191D20",
  orange: "#FF641C",
  white: "#FFFFFF",
  grey: "#9CA3AF",
};

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing Details", "Enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      Alert.alert(
        "Login Failed",
        "Please check your email address and password.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.logo}>
          INSTA<Text style={styles.logoOrange}>FIRE</Text>
        </Text>

        <Text style={styles.subtitle}>ENGINEER LOGIN</Text>

        <View style={styles.form}>
          <Text style={styles.label}>EMAIL ADDRESS</Text>

          <TextInput
            style={styles.input}
            placeholder="engineer@example.com"
            placeholderTextColor={COLORS.grey}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>PASSWORD</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter password"
            placeholderTextColor={COLORS.grey}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity
            style={styles.loginButton}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.loginButtonText}>SIGN IN</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>INSTAFIRE • ENGINEER ACCESS</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 40,
  },

  logo: {
    color: COLORS.white,
    fontSize: 38,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 1,
  },

  logoOrange: {
    color: COLORS.orange,
  },

  subtitle: {
    color: COLORS.grey,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 3,
    marginTop: 12,
    marginBottom: 45,
  },

  form: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 22,
    borderWidth: 1,
    borderColor: "#30363B",
  },

  label: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 10,
  },

  input: {
    backgroundColor: "#22272B",
    color: COLORS.white,
    borderWidth: 1,
    borderColor: "#505860",
    borderRadius: 6,
    paddingHorizontal: 16,
    height: 56,
    fontSize: 16,
    marginBottom: 22,
  },

  loginButton: {
    backgroundColor: COLORS.orange,
    borderRadius: 6,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },

  loginButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
  },

  footer: {
    color: COLORS.grey,
    textAlign: "center",
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 45,
  },
});
