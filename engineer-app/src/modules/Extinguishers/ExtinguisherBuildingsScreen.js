import React, { useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Keyboard,
} from "react-native";

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { collection, getDocs } from "firebase/firestore";
import { engineerNavigationStorage } from "./engineerNavigationStorage";
import { orderSites, siteSelectionFeature, siteNavigationBack } from "./engineerNavigation";
import { canStartInspection } from "./approvedInspectionAsset";

import { auth, db } from "../../firebaseConfig";
import ExtinguisherDetailsScreen from "./ExtinguisherBuildingDetailsScreen";
import ExtinguisherAssetRegisterScreen from "./ExtinguisherAssetRegisterScreen";
import ExtinguisherProposalScreen from "./ExtinguisherProposalScreen";

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

const MAX_RECENT = 3;
const MAX_RESULTS = 20;

export default function ExtinguisherBuildingsScreen({
  companyId,
  mode = "register",
  goBack,
  onSelectBuilding,
  userId,
  role,
  assignedSites,
  registerLeaveGuard,
}) {
  const [buildings, setBuildings] = useState([]);
  const [search, setSearch] = useState("");
  const [recentIds, setRecentIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedFeature, setSelectedFeature] = useState(null);

  const routine = mode === "routine";
  useEffect(() => {
    if (selectedFeature === "assets" || selectedFeature === "create") return; // Child screens own their back/save guards.
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      const next = siteNavigationBack(routine, selectedBuilding, selectedFeature);
      if (next.exit) goBack();
      else { setSelectedBuilding(next.building); setSelectedFeature(next.feature); }
      return true;
    });
    return () => back.remove();
  }, [selectedFeature, selectedBuilding, goBack, routine]);

  // LOAD COMPANY BUILDINGS FROM FIRESTORE
  useEffect(() => {
    let active = true;

    async function loadBuildings() {
      if (!companyId) {
        setLoadError("No company workspace is available.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setLoadError("");
        setBuildings([]);
        if (auth.currentUser?.uid !== userId) throw new Error("AUTH_SESSION_CHANGED");
        const scope = engineerNavigationStorage.forCompany(companyId);

        const sitesRef = collection(db, "companies", companyId, "sites");

        const snapshot = await getDocs(sitesRef);

        const results = snapshot.docs.map((site) => {
          const data = site.data();

          return {
            id: site.id,
            name: String(data.name || data.siteName || "Unnamed building"),
            address: String(data.address || ""),
            postcode: String(data.postcode || ""),
            customer: String(data.customerName || ""),
            reference: String(data.reference || ""),
            contactName: String(data.contactName || ""),
            contactPhone: String(data.contactPhone || ""),
            contactEmail: String(data.contactEmail || ""),
          };
        });

        scope.assertCurrent();
        if (active && auth.currentUser?.uid === userId) {
          setBuildings(routine ? results.filter((site) => canStartInspection(role, assignedSites ?? [], site.id)) : results);
        }
      } catch (error) {
        console.error("Unable to load buildings:", error);

        if (active) {
          setLoadError(
            "Unable to load buildings. Check your connection or site permissions.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadBuildings();

    return () => {
      active = false;
    };
  }, [companyId, userId, routine, role, assignedSites]);

  // LOAD RECENT BUILDINGS
  useEffect(() => {
    let active = true;

    async function loadRecent() {
      if (!companyId) return;

      try {
        if (auth.currentUser?.uid !== userId) return;
        const saved = await engineerNavigationStorage.forCompany(companyId).read();

        if (active && auth.currentUser?.uid === userId) setRecentIds(saved.recentIds);

      } catch (error) {
        console.error("Unable to load recent buildings:", error);
      }
    }

    loadRecent();

    return () => {
      active = false;
    };
  }, [companyId, userId]);

  // FILTER BUILDINGS ALPHABETICALLY
  const matchingBuildings = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (term.length < (routine ? 1 : 3)) return [];

    return buildings
      .filter((building) => {
        return (
          building.name.toLowerCase().includes(term) ||
          building.address.toLowerCase().includes(term) ||
          building.postcode.toLowerCase().includes(term) ||
          building.customer.toLowerCase().includes(term) ||
          building.reference.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_RESULTS);
  }, [buildings, search, routine]);

  const recentBuildings = useMemo(() => routine ? orderSites(buildings, recentIds) : recentIds.map((id) => buildings.find((building) => building.id === id)).filter(Boolean), [recentIds, buildings, routine]);

  // Remember only names/IDs in a project/user/company scope. Never auto-open a site.
  const openBuilding = (building) => {
    if (auth.currentUser?.uid !== userId || !buildings.some((site) => site.id === building.id)
      || (routine && !canStartInspection(role, assignedSites ?? [], building.id))) return;
    Keyboard.dismiss();
    const scope = engineerNavigationStorage.forCompany(companyId);
    scope.assertCurrent();
    setRecentIds([building.id, ...recentIds.filter((id) => id !== building.id)].slice(0, MAX_RECENT));
    void scope.rememberSite({ id: building.id, name: building.name }).catch(() => {});
    if (onSelectBuilding) onSelectBuilding(building);
    else { setSelectedBuilding(building); setSelectedFeature(siteSelectionFeature(routine)); }
  };
  const leaveAssets = () => {
    const next = siteNavigationBack(routine, selectedBuilding, selectedFeature);
    setSelectedFeature(next.feature); setSelectedBuilding(next.building);
  };

  const renderBuilding = ({ item }) => (
    <TouchableOpacity
      style={styles.buildingCard}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Select ${item.name}${recentIds[0] === item.id ? ", last selected site" : ""}`}
      onPress={() => openBuilding(item)}
    >
      <MaterialCommunityIcons
        name="office-building-outline"
        size={28}
        color={COLORS.orange}
      />

      <View style={styles.buildingInformation}>
        <Text style={styles.buildingName}>{item.name}</Text>
        {recentIds[0] === item.id && <Text style={styles.buildingPostcode}>LAST SELECTED SITE</Text>}

        {!!item.address && (
          <Text style={styles.buildingAddress}>{item.address}</Text>
        )}

        {!!item.postcode && (
          <Text style={styles.buildingPostcode}>{item.postcode}</Text>
        )}
      </View>

      <MaterialCommunityIcons
        name="chevron-right"
        size={25}
        color={COLORS.grey}
      />
    </TouchableOpacity>
  );

  const searchActive = search.trim().length >= (routine ? 1 : 3);

  return (
    <View style={styles.container}>
      {/* KEEP BUILDING SEARCH MOUNTED TO REMEMBER POSITION */}
      <View
        style={{
          flex: 1,
          display: selectedBuilding ? "none" : "flex",
        }}
      >
        {/* FIXED HEADER — SAFE AREA PROVIDED BY APP.JS */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={goBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to extinguisher menu"
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={26}
              color={COLORS.white}
            />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>{routine ? "START ROUTINE SERVICE" : "EXTINGUISHER REGISTER"}</Text>
        </View>

        {/* FIXED SEARCH FIELD */}
        <View style={styles.searchArea}>
          <View style={styles.searchBox}>
            <MaterialCommunityIcons
              name="magnify"
              size={25}
              color={COLORS.orange}
            />

            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search building, address, postcode..."
              placeholderTextColor={COLORS.grey}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />

            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch("")}
                accessibilityRole="button"
                accessibilityLabel="Clear building search"
              >
                <MaterialCommunityIcons
                  name="close-circle"
                  size={23}
                  color={COLORS.grey}
                />
              </TouchableOpacity>
            )}
          </View>

          {!searchActive && (
            <View style={styles.overview}>
              <View style={styles.overviewItem}>
                <Text style={styles.overviewNumber}>
                  {loading || loadError ? "—" : buildings.length}
                </Text>
                <Text style={styles.overviewLabel}>BUILDINGS</Text>
              </View>

              <View style={styles.overviewItem}>
                <Text style={styles.overviewNumber}>—</Text>
                <Text style={styles.overviewLabel}>DUE</Text>
              </View>

              <View style={styles.overviewItem}>
                <Text style={styles.overviewNumber}>—</Text>
                <Text style={styles.overviewLabel}>COMPLETE</Text>
              </View>

              <View style={styles.overviewItem}>
                <Text style={styles.overviewNumber}>—</Text>
                <Text style={styles.overviewLabel}>OVERDUE</Text>
              </View>
            </View>
          )}
        </View>

        {/* BUILDING RESULTS */}
        {loading ? (
          <View style={styles.messageArea}>
            <ActivityIndicator color={COLORS.orange} size="large" />
            <Text style={styles.messageText}>Loading buildings...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.messageArea}>
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : (
          <FlatList
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            data={searchActive ? matchingBuildings : recentBuildings}
            keyExtractor={(item) => item.id}
            renderItem={renderBuilding}
            ListHeaderComponent={
              <Text style={styles.sectionTitle}>
                {searchActive
                  ? `MATCHING BUILDINGS (${matchingBuildings.length}${matchingBuildings.length === MAX_RESULTS ? "+" : ""})`
                  : routine ? "CHOOSE A SITE" : "RECENT BUILDINGS"}
              </Text>
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {searchActive
                  ? "No matching buildings found."
                  : search.trim().length > 0
                    ? "Enter at least 3 characters to search."
                    : routine ? "No sites available for your role. Check your workspace or site assignments." : "No recently opened buildings. Search to find a site."}
              </Text>
            }
            ListFooterComponent={
              searchActive && matchingBuildings.length === MAX_RESULTS ? (
                <Text style={styles.emptyText}>
                  Showing the first 20 matches. Enter more characters to narrow
                  your search.
                </Text>
              ) : null
            }
          />
        )}
      </View>

      {/* SELECTED BUILDING DETAILS — KEEP MOUNTED */}
      {selectedBuilding && (
        <View
          style={{
            flex: 1,
            display: selectedFeature ? "none" : "flex",
          }}
        >
          <ExtinguisherDetailsScreen
            building={selectedBuilding}
            goBack={() => {
              setSelectedFeature(null);
              setSelectedBuilding(null);
            }}
            onSelectFeature={(item) => {
              if (item.id === "assets" || item.id === "create" || item.id === "inspection") {
                setSelectedFeature(item.id === "inspection" ? "assets" : item.id);
              }
            }}
          />
        </View>
      )}

      {/* INDIVIDUAL EXTINGUISHER ASSET REGISTER */}
      {selectedBuilding && selectedFeature === "assets" && (
        <ExtinguisherAssetRegisterScreen
          companyId={companyId}
          building={selectedBuilding}
          userId={userId} role={role} assignedSites={assignedSites} registerLeaveGuard={registerLeaveGuard}
          goBack={leaveAssets}
          routine={routine}
        />
      )}
      {/* PROPOSE NEW EXTINGUISHER ASSET */}
      {selectedBuilding && selectedFeature === "create" && (
        <ExtinguisherProposalScreen
          companyId={companyId}
          building={selectedBuilding}
          goBack={() => setSelectedFeature(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.5,
    flexShrink: 1,
  },

  searchArea: {
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  searchBox: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.orange,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    minHeight: 54,
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    color: COLORS.white,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  overview: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 19,
    paddingBottom: 5,
  },

  overviewItem: {
    flex: 1,
    alignItems: "center",
  },

  overviewNumber: {
    color: COLORS.orange,
    fontSize: 23,
    fontWeight: "900",
  },

  overviewLabel: {
    color: COLORS.grey,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 5,
  },

  list: {
    flex: 1,
  },

  listContent: {
    paddingHorizontal: 12,
    paddingTop: 20,
    paddingBottom: 30,
    flexGrow: 1,
  },

  sectionTitle: {
    color: COLORS.grey,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 15,
  },

  buildingCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    minHeight: 82,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  buildingInformation: {
    flex: 1,
    marginHorizontal: 13,
  },

  buildingName: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 5,
  },

  buildingAddress: {
    color: COLORS.grey,
    fontSize: 12,
    marginBottom: 3,
  },

  buildingPostcode: {
    color: COLORS.orange,
    fontSize: 11,
    fontWeight: "700",
  },

  messageArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  messageText: {
    color: COLORS.grey,
    marginTop: 14,
    textAlign: "center",
  },

  errorText: {
    color: COLORS.red,
    textAlign: "center",
    lineHeight: 22,
  },

  emptyText: {
    color: COLORS.grey,
    fontSize: 13,
    textAlign: "center",
    marginTop: 24,
    lineHeight: 21,
  },
});
