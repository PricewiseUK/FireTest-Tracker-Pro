import React, { useEffect, useState } from "react";
import {
  BackHandler,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

import { MaterialCommunityIcons } from "@expo/vector-icons";
import ExtinguisherResumeScreen from "./ExtinguisherResumeScreen";
import ExtinguisherBuildingsScreen from "./ExtinguisherBuildingsScreen";
import ExtinguisherCalculatorScreen from "./ExtinguisherCalculatorScreen";

const COLORS = {
  background: "#0B0D0E",
  card: "#191D20",
  orange: "#FF641C",
  white: "#FFFFFF",
  grey: "#9CA3AF",
  border: "#30363B",
};

const MENU_ITEMS = [
  { id: "routine", icon: "clipboard-check-outline", title: "START ROUTINE SERVICE", description: "Choose a site, then an approved extinguisher" },
  { id: "resume", icon: "play-circle-outline", title: "RESUME INSPECTION", description: "Continue your saved device drafts" },
  { id: "assets", icon: "format-list-bulleted", title: "VIEW ASSET REGISTER", description: "Equipment lookup and asset proposals" },
  { id: "calculator", icon: "calculator-variant-outline", title: "BUILDING CALCULATOR", description: "Indicative area-based extinguisher ratings" },
  { id: "history", icon: "history", title: "SERVICE HISTORY", description: "Not yet available", disabled: true },
];

export default function ExtinguisherHomeScreen(props) {
  return <EngineerHome key={JSON.stringify([props.companyId, props.userId])} {...props} />;
}
function EngineerHome({ goHome, companyId, userId, role, assignedSites, registerLeaveGuard }) {
  const [selectedFeature, setSelectedFeature] = useState(null);

  useEffect(() => {
    if (selectedFeature) return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => { goHome(); return true; });
    return () => back.remove();
  }, [selectedFeature, goHome]);
  const openFeature = (item) => {
    if (!item.disabled) setSelectedFeature(item);
  };
  if (selectedFeature?.id === "calculator") return <ExtinguisherCalculatorScreen goBack={() => setSelectedFeature(null)} />;
  if (selectedFeature?.id === "resume") return <ExtinguisherResumeScreen companyId={companyId} userId={userId} role={role} assignedSites={assignedSites} registerLeaveGuard={registerLeaveGuard} goBack={() => setSelectedFeature(null)} />;
  // Routine service skips the building-details menu; register/proposals keep it.
  if (selectedFeature?.id === "assets" || selectedFeature?.id === "routine") {
    return (
      <ExtinguisherBuildingsScreen
        mode={selectedFeature.id === "routine" ? "routine" : "register"}
        companyId={companyId}
        userId={userId} role={role} assignedSites={assignedSites} registerLeaveGuard={registerLeaveGuard}
        goBack={() => setSelectedFeature(null)}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* FIXED HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={goHome}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to dashboard"
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={26}
            color={COLORS.white}
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>FIRE EXTINGUISHERS</Text>
      </View>

      {/* SCROLLABLE CONTENT */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>EXTINGUISHER MANAGEMENT</Text>

        <View style={styles.introduction}>
          <MaterialCommunityIcons
            name="fire-extinguisher"
            size={34}
            color={COLORS.orange}
          />

          <View style={styles.introductionText}>
            <Text style={styles.introductionTitle}>FIRE EXTINGUISHERS</Text>

            <Text style={styles.introductionDescription}>
              Equipment registration, inspection and servicing
            </Text>
          </View>
        </View>

        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.menuCard, item.disabled && styles.disabled]}
            disabled={item.disabled}
            accessibilityState={{ disabled: !!item.disabled }}
            activeOpacity={0.85}
            onPress={() => openFeature(item)}
            accessibilityRole="button"
            accessibilityLabel={item.title}
          >
            <View style={styles.orangeStrip} />

            <MaterialCommunityIcons
              name={item.icon}
              size={32}
              color={COLORS.orange}
            />

            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>{item.title}</Text>

              <Text style={styles.menuDescription}>{item.description}</Text>
            </View>

            <MaterialCommunityIcons
              name="chevron-right"
              size={26}
              color={COLORS.white}
            />
          </TouchableOpacity>
        ))}
      </ScrollView>


    </View>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.45 },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },

  backButton: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  headerTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.7,
    flexShrink: 1,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 22,
    paddingBottom: 35,
  },

  sectionLabel: {
    color: COLORS.grey,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 17,
  },

  introduction: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },

  introductionText: {
    flex: 1,
    marginLeft: 15,
  },

  introductionTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 5,
  },

  introductionDescription: {
    color: COLORS.grey,
    fontSize: 12,
    lineHeight: 18,
  },

  menuCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    minHeight: 100,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 17,
    marginBottom: 12,
    overflow: "hidden",
  },

  orangeStrip: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: COLORS.orange,
  },

  menuText: {
    flex: 1,
    marginLeft: 16,
    marginRight: 8,
  },

  menuTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 6,
  },

  menuDescription: {
    color: COLORS.grey,
    fontSize: 12,
    lineHeight: 18,
  },
});
