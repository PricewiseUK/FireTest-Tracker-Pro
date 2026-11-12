import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

const COLORS = {
  background: "#0B0D0E",
  card: "#191D20",
  orange: "#FF641C",
  white: "#FFFFFF",
  grey: "#9CA3AF",
  border: "#30363B",
  green: "#22C55E",
};

const DEMO_SITES = [
  {
    id: "1",
    name: "Lincoln Retail Park",
    address: "Lincoln, Lincolnshire",
    panel: "Advanced MXPro 5",
    nodes: 4,
    status: "Testing Due",
  },
  {
    id: "2",
    name: "Office Building",
    address: "Lincoln, Lincolnshire",
    panel: "C-TEC",
    nodes: 1,
    status: "Up to Date",
  },
];

export default function SitesScreen({ goHome }) {
  const [search, setSearch] = useState("");

  const [sites, setSites] = useState(DEMO_SITES);
const [showAddForm, setShowAddForm] = useState(false);

const [siteName, setSiteName] = useState("");
const [siteAddress, setSiteAddress] = useState("");
const [manufacturer, setManufacturer] = useState("");
const [panelModel, setPanelModel] = useState("");

const [nodes, setNodes] = useState([
  { id: "1", name: "Node 1", panel: "" },
]);

function addNode() {
  setNodes((current) => [
    ...current,
    {
      id: String(Date.now()),
      name: `Node ${current.length + 1}`,
      panel: "",
    },
  ]);
}

function updateNode(id, value) {
  setNodes((current) =>
    current.map((node) =>
      node.id === id ? { ...node, panel: value } : node
    )
  );
}

function saveSite() {
  if (!siteName.trim() || !siteAddress.trim()) {
    Alert.alert("Missing Information", "Enter a site name and address.");
    return;
  }

  const newSite = {
    id: String(Date.now()),
    name: siteName.trim(),
    address: siteAddress.trim(),
    panel: panelModel.trim() || manufacturer.trim() || "Not specified",
    manufacturer: manufacturer.trim(),
    nodes: nodes.length,
    nodeDetails: nodes,
    status: "Not Tested",
  };

  setSites((current) => [...current, newSite]);
  setShowAddForm(false);

  setSiteName("");
  setSiteAddress("");
  setManufacturer("");
  setPanelModel("");
  setNodes([{ id: "1", name: "Node 1", panel: "" }]);
}

  const filteredSites = sites.filter((site) =>
    `${site.name} ${site.address} ${site.panel}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  return (
    <View style={styles.container}>
      {showAddForm ? (
  <>
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => setShowAddForm(false)}
        style={styles.backButton}
      >
        <Ionicons name="arrow-back" size={25} color={COLORS.white} />
      </TouchableOpacity>

      <Text style={styles.heading}>ADD NEW SITE</Text>
    </View>

    <ScrollView
      contentContainerStyle={styles.formContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.formLabel}>SITE NAME</Text>
      <TextInput
        style={styles.formInput}
        placeholder="e.g. Lincoln Retail Park"
        placeholderTextColor={COLORS.grey}
        value={siteName}
        onChangeText={setSiteName}
      />

      <Text style={styles.formLabel}>SITE ADDRESS</Text>
      <TextInput
        style={styles.formInput}
        placeholder="Building address"
        placeholderTextColor={COLORS.grey}
        value={siteAddress}
        onChangeText={setSiteAddress}
        multiline
      />

      <Text style={styles.formLabel}>PANEL MANUFACTURER</Text>
      <TextInput
        style={styles.formInput}
        placeholder="e.g. Advanced"
        placeholderTextColor={COLORS.grey}
        value={manufacturer}
        onChangeText={setManufacturer}
      />

      <Text style={styles.formLabel}>PANEL MODEL</Text>
      <TextInput
        style={styles.formInput}
        placeholder="e.g. MXPro 5"
        placeholderTextColor={COLORS.grey}
        value={panelModel}
        onChangeText={setPanelModel}
      />

      <Text style={styles.formSectionTitle}>PANELS & NODES</Text>

      {nodes.map((node, index) => (
        <View key={node.id} style={styles.nodeCard}>
          <Text style={styles.nodeHeading}>
            NODE {index + 1}
          </Text>

          <TextInput
            style={styles.formInput}
            placeholder="Panel model / description"
            placeholderTextColor={COLORS.grey}
            value={node.panel}
            onChangeText={(value) => updateNode(node.id, value)}
          />
        </View>
      ))}

      <TouchableOpacity style={styles.addNodeButton} onPress={addNode}>
        <Ionicons name="add-circle-outline" size={22} color={COLORS.orange} />
        <Text style={styles.addNodeText}>ADD ANOTHER NODE</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.saveButton} onPress={saveSite}>
        <Ionicons name="save-outline" size={21} color={COLORS.white} />
        <Text style={styles.saveButtonText}>SAVE SITE</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => setShowAddForm(false)}
      >
        <Text style={styles.cancelText}>CANCEL</Text>
      </TouchableOpacity>
     </ScrollView>
  </>
) : (
  <>
      <View style={styles.header}>
        <TouchableOpacity onPress={goHome} style={styles.backButton}>
          <Ionicons name="arrow-back" size={25} color={COLORS.white} />
        </TouchableOpacity>

        <Text style={styles.heading}>MY SITES</Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={21} color={COLORS.grey} />

        <TextInput
          style={styles.searchInput}
          placeholder="Search buildings..."
          placeholderTextColor={COLORS.grey}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {filteredSites.map((site) => (
          <TouchableOpacity
            key={site.id}
            style={styles.siteCard}
            onPress={() => {}}
          >
            <View style={styles.accent} />

            <MaterialCommunityIcons
              name="office-building"
              size={36}
              color={COLORS.orange}
            />

            <View style={styles.siteInfo}>
              <Text style={styles.siteName}>{site.name}</Text>
              <Text style={styles.siteAddress}>{site.address}</Text>
              <Text style={styles.panelText}>{site.panel}</Text>
              <Text style={styles.nodeText}>
                {site.nodes} {site.nodes === 1 ? "Node" : "Nodes"}
              </Text>

              <Text
                style={[
                  styles.status,
                  {
                    color:
                      site.status === "Up to Date"
                        ? COLORS.green
                        : COLORS.orange,
                  },
                ]}
              >
                ● {site.status}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={24} color={COLORS.white} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity
  style={styles.addButton}
  onPress={() => setShowAddForm(true)}
>
        <Ionicons name="add" size={23} color={COLORS.white} />
        <Text style={styles.addButtonText}>ADD NEW SITE</Text>
            </TouchableOpacity>
    </>
  )}
</View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 18,
    paddingTop: 20,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 25,
  },

  backButton: {
    marginRight: 16,
  },

  heading: {
    color: COLORS.white,
    fontSize: 25,
    fontWeight: "900",
  },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    marginBottom: 20,
  },

  searchInput: {
    flex: 1,
    color: COLORS.white,
    paddingVertical: 14,
    marginLeft: 10,
    fontSize: 14,
  },

  list: {
    paddingBottom: 25,
  },

  siteCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 17,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 13,
    overflow: "hidden",
  },

  accent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: COLORS.orange,
  },

  siteInfo: {
    flex: 1,
    marginLeft: 15,
  },

  siteName: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 5,
  },

  siteAddress: {
    color: COLORS.grey,
    fontSize: 12,
    marginBottom: 6,
  },

  panelText: {
    color: COLORS.white,
    fontSize: 12,
  },

  nodeText: {
    color: COLORS.grey,
    fontSize: 12,
    marginTop: 3,
  },

  status: {
    fontSize: 12,
    marginTop: 8,
    fontWeight: "700",
  },

  addButton: {
    backgroundColor: COLORS.orange,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 17,
    marginBottom: 12,
  },

  addButtonText: {
    color: COLORS.white,
    fontWeight: "900",
    marginLeft: 8,
    fontSize: 14,
  },

  // =====================================
  // ADD NEW SITE FORM
  // =====================================

  formContent: {
    paddingBottom: 40,
  },

  formSectionTitle: {
    color: COLORS.orange,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginTop: 22,
    marginBottom: 18,
  },

  formLabel: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.7,
    marginBottom: 10,
  },

  formInput: {
    backgroundColor: "#22272B",
    borderWidth: 1,
    borderColor: "#505860",
    borderRadius: 6,
    color: COLORS.white,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 58,
    marginBottom: 20,
  },

  nodeCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: "#40474D",
    borderLeftWidth: 4,
    borderLeftColor: COLORS.orange,
    borderRadius: 6,
    padding: 18,
    marginBottom: 18,
  },

  nodeHeading: {
    color: COLORS.orange,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 14,
  },

  addNodeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.orange,
    borderRadius: 6,
    paddingVertical: 16,
    marginBottom: 25,
  },

  addNodeText: {
    color: COLORS.orange,
    fontSize: 14,
    fontWeight: "800",
    marginLeft: 8,
  },

  saveButton: {
    backgroundColor: COLORS.orange,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    paddingVertical: 18,
  },

  saveButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
    marginLeft: 8,
  },

  cancelButton: {
    alignItems: "center",
    paddingVertical: 20,
  },

  cancelText: {
    color: COLORS.grey,
    fontSize: 14,
    fontWeight: "700",
  },
});