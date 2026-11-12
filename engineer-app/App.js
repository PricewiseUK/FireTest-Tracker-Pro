import React, { useState, useEffect, useRef, useCallback } from "react";
import SitesScreen from "./src/screens/SitesScreen";
import LoginScreen from "./src/screens/LoginScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import ExtinguisherHomeScreen from "./src/modules/Extinguishers/ExtinguisherHomeScreen";
import FireAlarmsHomeScreen from "./src/modules/FireAlarms/FireAlarmsHomeScreen";
import EngineerJobPanel from "./src/modules/Jobs/EngineerJobPanel";
import { startCompletionRetries } from "./src/services/jobSynchronisation";
import { auth } from "./src/firebaseConfig";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDocFromServer } from "firebase/firestore";
import { db } from "./src/firebaseConfig";
import CminCalculator from "./src/components/CminCalculator";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  ImageBackground,
} from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

// =====================================================
// INSTAFIRE COLOURS
// =====================================================

const COLORS = {
  background: "#0B0D0E",
  card: "#191D20",
  orange: "#FF641C",
  white: "#FFFFFF",
  grey: "#9CA3AF",
  border: "#30363B",
  green: "#22C55E",
  red: "#EF4444",
};
// =====================================================
// INSTAFIRE BACKGROUND IMAGES
// =====================================================

const BACKGROUNDS = {
  header: require("./assets/header-bg.webp"),
  sites: require("./assets/sites-bg.webp"),
  testing: require("./assets/testing-bg.webp"),
  history: require("./assets/history-bg.webp"),
  extinguishers: require("./assets/extinguisher-bg.webp"),
  emergencyLighting: require("./assets/emergencylights-bg.webp"),
  fireBlankets: require("./assets/fireblanket-bg.webp"),
};
// =====================================================
// DEMONSTRATION DATA
// =====================================================

const DEMO = {
  sitesDue: 12,
  testedThisMonth: 348,
  outstanding: 5,
  nextSite: "Lincoln Retail Park",
  nextDate: "14 Oct 2026",
};

// =====================================================
// MAIN APPLICATION
// =====================================================

export default function App() {
  return (
    <SafeAreaProvider>
      <InstafireApp />
    </SafeAreaProvider>
  );
}

function InstafireApp() {
  const [activeTab, setActiveTab] = useState("Home");
  // Cmin calculator
  const [cminVisible, setCminVisible] = useState(false);

  // Firebase Authentication
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Current company workspace
  const [workspace, setWorkspace] = useState(null);
  useEffect(() => {
    if (!workspace || !user || auth.currentUser?.uid !== user.uid || !["engineer", "senior_engineer"].includes(workspace.role)) return;
    return startCompletionRetries(workspace.id);
  }, [workspace, user]);
  const inspectionLeaveGuard = useRef(null);
  const registerInspectionLeaveGuard = useCallback((guard) => {
    inspectionLeaveGuard.current = guard;
    return () => { if (inspectionLeaveGuard.current === guard) inspectionLeaveGuard.current = null; };
  }, []);
  const selectTab = (tab) => {
    if (tab === activeTab) return;
    if (inspectionLeaveGuard.current) void inspectionLeaveGuard.current(() => setActiveTab(tab));
    else setActiveTab(tab);
  };

  // =====================================================
  // VERIFY COMPANY WORKSPACE
  // =====================================================

  async function checkWorkspace(firebaseUser) {
    const companyId = "2MpEurCrIQDU4Sp9Qwh1";

    // Retrieve engineer membership
    const membershipRef = doc(
      db,
      "companies",
      companyId,
      "members",
      firebaseUser.uid,
    );

    const membershipSnap = await getDocFromServer(membershipRef);

    if (!membershipSnap.exists()) {
      throw new Error("No workspace membership found.");
    }

    const membership = membershipSnap.data();

    if (membership.status !== "active") {
      throw new Error("Workspace membership is inactive.");
    }

    // Retrieve company details
    const companyRef = doc(db, "companies", companyId);

    const companySnap = await getDocFromServer(companyRef);

    if (!companySnap.exists()) {
      throw new Error("Company workspace not found.");
    }

    const company = companySnap.data();

    if (company.status !== "active") {
      throw new Error("Company workspace is inactive.");
    }

    // Return verified workspace
    return {
      id: companyId,
      name: company.name,
      role: membership.role,
      siteIds: Array.isArray(membership.siteIds) ? membership.siteIds : [],
      userId: firebaseUser.uid,
    };
  }

  useEffect(() => {
    let latestRequest = 0;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const requestId = ++latestRequest;

      setUser(firebaseUser);
      setWorkspace(null);

      if (!firebaseUser) {
        setAuthLoading(false);
        return;
      }

      setAuthLoading(true);

      try {
        const companyWorkspace = await checkWorkspace(firebaseUser);

        if (requestId === latestRequest) {
          setWorkspace(companyWorkspace);
        }
      } catch (error) {
        if (requestId === latestRequest) {
          console.error("Workspace verification failed:", error.message);
        }
      } finally {
        if (requestId === latestRequest) {
          setAuthLoading(false);
        }
      }
    });

    return () => {
      latestRequest++;
      unsubscribe();
    };
  }, []);

  function openSection(section) {
    setActiveTab(section);
  }

  // Wait for Firebase to restore the saved login
  if (authLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={COLORS.background}
        />

        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: COLORS.orange,
              fontSize: 18,
              fontWeight: "800",
            }}
          >
            INSTAFIRE
          </Text>

          <Text
            style={{
              color: COLORS.grey,
              marginTop: 12,
            }}
          >
            Checking engineer login...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Engineer not signed in
  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={COLORS.background}
        />

        <LoginScreen />
      </SafeAreaView>
    );
  }

  // =====================================================
  // WORKSPACE ACCESS PROTECTION
  // =====================================================

  if (!workspace) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={COLORS.background}
        />

        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 30,
          }}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={65}
            color={COLORS.orange}
          />

          <Text
            style={{
              color: COLORS.white,
              fontSize: 23,
              fontWeight: "800",
              marginTop: 20,
              textAlign: "center",
            }}
          >
            WORKSPACE UNAVAILABLE
          </Text>

          <Text
            style={{
              color: COLORS.grey,
              fontSize: 14,
              textAlign: "center",
              lineHeight: 22,
              marginTop: 15,
            }}
          >
            Instafire could not verify your company workspace. Please check your
            connection or contact your company administrator.
          </Text>

          <TouchableOpacity
            style={{
              backgroundColor: COLORS.orange,
              paddingHorizontal: 35,
              paddingVertical: 15,
              marginTop: 30,
            }}
            onPress={() => signOut(auth)}
          >
            <Text
              style={{
                color: COLORS.white,
                fontWeight: "800",
              }}
            >
              SIGN OUT
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Engineer signed in
  return (
    <SafeAreaView
      style={styles.container}
      edges={
        activeTab === "Settings"
          ? ["left", "right", "bottom"]
          : ["top", "left", "right", "bottom"]
      }
    >
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* KEEP HOME MOUNTED TO PRESERVE SCROLL POSITION */}
      <View
        style={{
          flex: 1,
          display: activeTab === "Home" ? "flex" : "none",
        }}
      >
        <HomeScreen openSection={openSection} />
      </View>

      {/* OTHER SCREENS */}
      {activeTab !== "Home" &&
        (activeTab === "Sites" ? (
          <SitesScreen goHome={() => setActiveTab("Home")} />
        ) : activeTab === "Settings" ? (
          <SettingsScreen goHome={() => setActiveTab("Home")} />
        ) : activeTab === "Testing" ? (
          <EngineerJobPanel key={`${workspace.id}:${user.uid}`} companyId={workspace.id} userId={user.uid} />
        ) : activeTab === "FireAlarms" ? (
          <FireAlarmsHomeScreen companyId={workspace.id} userId={workspace.userId} role={workspace.role} registerLeaveGuard={registerInspectionLeaveGuard} goHome={() => selectTab("Home")} />
        ) : activeTab === "Extinguishers" ? (
          <ExtinguisherHomeScreen
            goHome={() => selectTab("Home")}
            companyId={workspace.id}
            userId={workspace.userId} role={workspace.role} assignedSites={workspace.siteIds}
            registerLeaveGuard={registerInspectionLeaveGuard}
          />
        ) : (
          <PlaceholderScreen
            title={activeTab}
            goHome={() => setActiveTab("Home")}
          />
        ))}

      {/* QUICK ACCESS CMIN CALCULATOR */}

      {activeTab === "Home" && (
        <View
          style={{
            backgroundColor: COLORS.background,
            paddingHorizontal: 18,
            paddingVertical: 6,
            alignItems: "flex-end",
          }}
        >
          <TouchableOpacity
            onPress={() => setCminVisible(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
              borderWidth: 1,
              borderColor: COLORS.orange,
              borderRadius: 7,
              paddingHorizontal: 17,
              paddingVertical: 9,
            }}
          >
            <MaterialCommunityIcons
              name="calculator-variant"
              size={20}
              color={COLORS.orange}
            />

            <Text
              style={{
                color: COLORS.orange,
                fontWeight: "800",
                fontSize: 12,
              }}
            >
              CMIN CALCULATOR
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <BottomNavigation activeTab={activeTab} onSelect={selectTab} />

      {/* CALCULATOR MODAL */}

      <CminCalculator
        visible={cminVisible}
        onClose={() => setCminVisible(false)}
      />
    </SafeAreaView>
  );
}
// =====================================================
// HOME SCREEN
// =====================================================

function HomeScreen({ openSection }) {
  return (
    <View style={{ flex: 1 }}>
      {/* FIXED INSTAFIRE HEADER */}

      <View
        style={{
          backgroundColor: COLORS.background,
          shadowColor: COLORS.orange,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 5,
        }}
      >
        <ImageBackground
          source={BACKGROUNDS.header}
          resizeMode="cover"
          style={styles.heroSection}
          imageStyle={{ opacity: 0.65 }}
        >
          <LinearGradient
            colors={[
              "rgba(11,13,14,0.90)",
              "rgba(11,13,14,0.55)",
              "rgba(11,13,14,0.20)",
            ]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          <View style={styles.header}>
            <View style={styles.brandRow}>
              <Image
                source={require("./assets/instafire-banner.webp")}
                style={styles.brandLogo}
                resizeMode="contain"
              />
            </View>

            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => openSection("Settings")}
            >
              <Ionicons name="settings-sharp" size={25} color={COLORS.grey} />
            </TouchableOpacity>
          </View>
        </ImageBackground>
      </View>

      {/* SCROLLABLE DASHBOARD */}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* TESTING DUE */}

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => openSection("FireAlarms")}
        >
          <LinearGradient
            colors={[
              "rgba(25,29,32,0.88)",
              "rgba(57,32,23,0.72)",
              "rgba(33,23,20,0.65)",
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.dueCard}
          >
            <View style={styles.orangeStrip} />

            <MaterialCommunityIcons
              name="calendar-clock"
              size={49}
              color={COLORS.orange}
            />

            <View style={styles.dueContent}>
              <Text style={styles.sectionLabel}>TESTING DUE</Text>

              <Text style={styles.dueNumber}>{DEMO.sitesDue}</Text>

              <Text style={styles.dueUnits}>SITES</Text>

              <Text style={styles.dueDescription}>
                Next visit: {DEMO.nextSite}
              </Text>

              <Text style={styles.dueDescription}>Due: {DEMO.nextDate}</Text>
            </View>

            <Ionicons name="chevron-forward" size={27} color={COLORS.white} />
          </LinearGradient>
        </TouchableOpacity>

        {/* STATISTICS */}

        <View style={styles.statsRow}>
          <TouchableOpacity
            style={[styles.statCard, styles.greenBorder]}
            onPress={() => openSection("History")}
          >
            <View style={styles.statIconGreen}>
              <Ionicons name="checkmark" size={27} color={COLORS.background} />
            </View>

            <View style={styles.statContent}>
              <Text style={styles.statNumber}>{DEMO.testedThisMonth}</Text>

              <Text style={styles.statLabel}>Devices Tested</Text>

              <Text style={styles.statLabel}>This Month</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, styles.redBorder]}
            onPress={() => openSection("FireAlarms")}
          >
            <View style={styles.statIconRed}>
              <Ionicons name="alert" size={27} color={COLORS.background} />
            </View>

            <View style={styles.statContent}>
              <Text style={styles.statNumber}>{DEMO.outstanding}</Text>

              <Text style={styles.statLabel}>Outstanding</Text>

              <Text style={styles.statLabel}>Devices</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* MAIN MENU */}

        <Text style={styles.menuHeading}>ENGINEER DASHBOARD</Text>

        <MenuCard
          icon="office-building"
          title="MY SITES"
          description="View buildings, device registers and site information"
          background={BACKGROUNDS.sites}
          onPress={() => openSection("Sites")}
        />

        <MenuCard
          icon="bell-alert-outline"
          title="FIRE ALARMS"
          description="Inspect, test and maintain fire alarm systems"
          background={BACKGROUNDS.testing}
          onPress={() => openSection("FireAlarms")}
        />

        {/* FIRE EXTINGUISHERS */}
        <MenuCard
          icon="fire-extinguisher"
          title="FIRE EXTINGUISHERS"
          description="Register, inspect and service fire extinguishers"
          background={BACKGROUNDS.extinguishers}
          onPress={() => openSection("Extinguishers")}
        />

        {/* EMERGENCY LIGHTING */}
        <MenuCard
          icon="lightbulb-on-outline"
          title="EMERGENCY LIGHTING"
          description="Manage emergency lights and record testing"
          background={BACKGROUNDS.emergencyLighting}
          onPress={() => openSection("Emergency Lighting")}
        />
        {/* FIRE BLANKETS */}
        <MenuCard
          icon="shield-check-outline"
          title="FIRE BLANKETS"
          description="Register, inspect and record fire blanket checks"
          background={BACKGROUNDS.fireBlankets}
          onPress={() => openSection("Fire Blankets")}
        />

        <MenuCard
          icon="chart-bar"
          title="TEST HISTORY"
          description="View past visits, test results and generate reports"
          background={BACKGROUNDS.history}
          onPress={() => openSection("History")}
        />

        <Text style={styles.versionText}>INSTAFIRE • VERSION 1.0</Text>
      </ScrollView>
    </View>
  );
}
// =====================================================
// MENU CARD
// =====================================================

function MenuCard({ icon, title, description, onPress, background }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.menuCard}
      onPress={onPress}
    >
      {/* Background photograph */}

      {background && (
        <ImageBackground
          source={background}
          resizeMode="cover"
          imageStyle={styles.menuBackgroundImage}
          style={styles.menuBackground}
        >
          <LinearGradient
            colors={[
              "rgba(25,29,32,0.98)",
              "rgba(25,29,32,0.90)",
              "rgba(25,29,32,0.75)",
              "rgba(11,13,14,0.55)",
            ]}
            locations={[0, 0.25, 0.65, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        </ImageBackground>
      )}

      {/* Orange accent */}

      <View style={styles.menuAccent} />

      {/* Icon */}

      <MaterialCommunityIcons name={icon} size={43} color={COLORS.orange} />

      {/* Text */}

      <View style={styles.menuText}>
        <Text style={styles.menuTitle}>{title}</Text>

        <Text style={styles.menuDescription}>{description}</Text>
      </View>

      {/* Navigation arrow */}

      <Ionicons name="chevron-forward" size={26} color={COLORS.white} />
    </TouchableOpacity>
  );
}
// =====================================================
// PLACEHOLDER SCREENS
// =====================================================

function PlaceholderScreen({ title, goHome }) {
  return (
    <View style={styles.placeholder}>
      <MaterialCommunityIcons name="fire" size={65} color={COLORS.orange} />

      <Text style={styles.placeholderTitle}>{title.toUpperCase()}</Text>

      <Text style={styles.placeholderDescription}>
        This section is ready for development.
      </Text>

      <TouchableOpacity style={styles.backButton} onPress={goHome} accessibilityRole="button" accessibilityLabel="Back to dashboard">
        <Text style={styles.backButtonText}>BACK TO DASHBOARD</Text>
      </TouchableOpacity>
    </View>
  );
}

// =====================================================
// BOTTOM NAVIGATION
// =====================================================

function BottomNavigation({ activeTab, onSelect }) {
  const tabs = [
    { name: "Home", icon: "home" },
    { name: "Sites", icon: "business" },
    { name: "Testing", icon: "clipboard" },
    { name: "History", icon: "stats-chart" },
  ];

  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => {
        const selected = activeTab === tab.name;

        return (
          <TouchableOpacity
            key={tab.name}
            style={[styles.navItem, selected && styles.navItemActive]}
            onPress={() => onSelect(tab.name)}
            accessibilityRole="tab"
            accessibilityLabel={tab.label ?? tab.name}
            accessibilityState={{ selected }}
          >
            <Ionicons
              name={tab.icon}
              size={24}
              color={selected ? COLORS.orange : COLORS.grey}
            />

            <Text style={[styles.navText, selected && styles.navTextActive]}>
              {tab.label ?? tab.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// =====================================================
// STYLES
// =====================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 35,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 0,
  },

  brandLogo: {
    width: 230,
    height: 65,
    alignSelf: "flex-start",
    marginLeft: -25,
  },

  settingsButton: {
    padding: 8,
  },

  dueCard: {
    minHeight: 185,
    borderWidth: 1,
    borderColor: "#7A3B23",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 17,
    overflow: "hidden",
  },

  orangeStrip: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: COLORS.orange,
  },

  dueContent: {
    flex: 1,
    marginLeft: 15,
  },

  sectionLabel: {
    color: COLORS.grey,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 1,
  },

  dueNumber: {
    color: COLORS.orange,
    fontSize: 59,
    fontWeight: "900",
    lineHeight: 65,
  },

  dueUnits: {
    color: COLORS.orange,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },

  dueDescription: {
    color: COLORS.grey,
    fontSize: 12,
    marginTop: 3,
  },

  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 30,
  },

  statCard: {
    flex: 1,
    minHeight: 125,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  greenBorder: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.green,
  },

  redBorder: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.red,
  },

  statIconGreen: {
    backgroundColor: COLORS.green,
    width: 37,
    height: 37,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 9,
  },

  statIconRed: {
    backgroundColor: COLORS.red,
    width: 37,
    height: 37,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 9,
  },

  statContent: {
    flex: 1,
  },

  statNumber: {
    color: COLORS.white,
    fontSize: 27,
    fontWeight: "800",
  },

  statLabel: {
    color: COLORS.grey,
    fontSize: 10,
    marginTop: 2,
  },

  menuHeading: {
    color: COLORS.grey,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 13,
  },

  menuCard: {
    minHeight: 112,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    marginBottom: 13,
    overflow: "hidden",
  },

  menuAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: COLORS.orange,
  },

  menuText: {
    flex: 1,
    marginLeft: 17,
    marginRight: 5,
  },

  menuTitle: {
    color: COLORS.white,
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 6,
  },

  menuDescription: {
    color: COLORS.grey,
    fontSize: 12,
    lineHeight: 18,
  },

  versionText: {
    color: "#60676D",
    fontSize: 10,
    textAlign: "center",
    marginTop: 18,
    letterSpacing: 1,
  },

  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#111416",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingBottom: 8,
  },

  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderTopWidth: 3,
    borderTopColor: "transparent",
  },

  navItemActive: {
    borderTopColor: COLORS.orange,
  },

  navText: {
    color: COLORS.grey,
    fontSize: 11,
    marginTop: 5,
  },

  navTextActive: {
    color: COLORS.orange,
    fontWeight: "700",
  },

  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  placeholderTitle: {
    color: COLORS.white,
    fontSize: 28,
    fontWeight: "900",
    marginTop: 20,
  },

  placeholderDescription: {
    color: COLORS.grey,
    fontSize: 14,
    textAlign: "center",
    marginTop: 10,
  },

  backButton: {
    backgroundColor: COLORS.orange,
    paddingHorizontal: 25,
    paddingVertical: 15,
    marginTop: 30,
  },

  backButtonText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "800",
  },
  menuBackground: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: "20%",
    width: "80%",
    height: "100%",
  },

  menuBackgroundImage: {
    opacity: 0.35,
  },
  heroSection: {
    width: "100%",
    height: 125,
    paddingTop: 40,
    overflow: "hidden",

    // Subtle orange border beneath the banner
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,100,28,0.55)",
  },

  heroBackground: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
});
