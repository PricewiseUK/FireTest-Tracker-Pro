import { useState } from "react";
import "./FireAlarms.css";
import advancedMxpro5 from "../assets/advanced-mxpro5.webp";
import ctecZfp from "../assets/ctec-zfp.webp";
import fikeTwinflex from "../assets/fike-twinflex.webp";
import gentVigilon from "../assets/gent-vigilon.webp";
import ctecCfp from "../assets/ctec-cfp.webp";



const exampleDevices = [
  {
    zone: "01",
    loop: "1",
    number: "001",
    type: "Optical Smoke",
    categories: ["Detectors"],
    location: "Reception",
  },
  {
    zone: "01",
    loop: "1",
    number: "002",
    type: "Manual Call Point",
    categories: ["Manual Call Points"],
    location: "Main Entrance",
  },
  {
    zone: "02",
    loop: "1",
    number: "003",
    type: "Heat Detector",
    categories: ["Detectors"],
    location: "Kitchen",
  },
  {
    zone: "03",
    loop: "2",
    number: "001",
    type: "Optical Smoke",
    categories: ["Detectors"],
    location: "Warehouse",
  },
  {
    zone: "01",
    loop: "1",
    number: "004",
    type: "Sounder",
    categories: ["Sounders/Beacons"],
    location: "Main Corridor",
  },
  {
    zone: "03",
    loop: "2",
    number: "002",
    type: "I/O Module",
    categories: ["I/O Modules"],
    location: "Loading Bay",
  },
  {
    zone: "02",
    loop: "1",
    number: "005",
    type: "Relay",
    categories: ["Relays"],
    location: "First Floor Plant Room",
  },
  {
    zone: "03",
    loop: "2",
    number: "003",
    type: "Sounder/Beacon",
    categories: ["Sounders/Beacons"],
    location: "Warehouse Exit",
  },
  {
    zone: "03",
    loop: "3",
    number: "004",
    type: "Optical Smoke / Sounder",
    categories: ["Detectors", "Sounders/Beacons"],
    location: "Warehouse Office",
  },
];

const deviceCategories = [
  "Detectors",
  "Manual Call Points",
  "Sounders/Beacons",
  "I/O Modules",
  "Relays",
];

const panelExamples = [
  {
    manufacturer: "Advanced",
    model: "MxPro 5",
    structure: "Addressable",
    fields: "Panel / Node → Loop → Address → Zone → Device",
    image: advancedMxpro5,
  },
  {
    manufacturer: "C-TEC",
    model: "ZFP",
    structure: "Addressable",
    fields: "Panel → Loop → Address → Zone → Device",
    image: ctecZfp,
  },
  {
    manufacturer: "C-TEC",
    model: "CFP Conventional",
    structure: "Conventional",
    fields: "Panel → Zone → Device Reference",
    image: ctecCfp,
  },
  {
    manufacturer: "Fike",
    model: "Twinflex Pro²",
    structure: "Zonal two-wire",
    fields: "Panel → Zone → Device Reference",
    image: fikeTwinflex,
  },
  {
    manufacturer: "Honeywell Gent",
    model: "Vigilon",
    structure: "Addressable",
    fields: "Panel / Node → Loop → Address → Zone → Device",
    image: gentVigilon,
  },
];

function FireAlarms() {
  const [deviceZoneChanges, setDeviceZoneChanges] = useState({});

const deviceKey = (device) => `${device.zone}-${device.loop}-${device.number}`;

const getDeviceZone = (device) =>
  configMode === "custom"
    ? (deviceZoneChanges[deviceKey(device)] ?? device.zone)
    : device.zone;
const [selectedPanel, setSelectedPanel] = useState(0);
const [installedLoops, setInstalledLoops] = useState(2);
const [selectedLoop, setSelectedLoop] = useState("all");
const [selectedDeviceType, setSelectedDeviceType] = useState("all");
const [selectedZone, setSelectedZone] = useState("all");
const [hideSounders, setHideSounders] = useState(false);
const [configMode, setConfigMode] = useState("template");
const [extraZones, setExtraZones] = useState([]);

const [customZoneNames, setCustomZoneNames] = useState({
  "01": "Ground Floor",
  "02": "First Floor",
  "03": "Warehouse",
});
  const [zoneColours, setZoneColours] = useState({
  "01": "#f97316",
  "02": "#3b82f6",
  "03": "#22c55e",
});

const exampleZones = [
  {
    number: "01",
    area: "Reception, Entrance Lobby, Main Corridor",
  },
  {
    number: "02",
    area: "First Floor Offices, Landing",
  },
  {
    number: "03",
    area: "Warehouse, Loading Bay",
  },
];
const displayedZones =
  configMode === "custom"
    ? [...exampleZones, ...extraZones]
    : exampleZones;

const addZone = () => {
  const nextNumber = String(
    Math.max(
      0,
      ...[...exampleZones, ...extraZones].map(
        (zone) => Number(zone.number)
      )
    ) + 1
  ).padStart(2, "0");

  setExtraZones((previous) => [
    ...previous,
    {
      number: nextNumber,
      area: `Zone ${nextNumber}`,
    },
  ]);

  setCustomZoneNames((previous) => ({
    ...previous,
    [nextNumber]: "",
  }));

  setZoneColours((previous) => ({
    ...previous,
    [nextNumber]: "#a855f7",
  }));
};

const zoneHasDevices = (zoneNumber) =>
  exampleDevices.some(
    (device) => getDeviceZone(device) === zoneNumber
  );

const removeZone = (zoneNumber) => {
  // Only allow removal of custom-added zones.
  const isCustomZone = extraZones.some(
    (zone) => zone.number === zoneNumber
  );

  if (!isCustomZone || zoneHasDevices(zoneNumber)) {
    return;
  }

  setExtraZones((previous) =>
    previous.filter((zone) => zone.number !== zoneNumber)
  );

  setCustomZoneNames((previous) => {
    const updated = { ...previous };
    delete updated[zoneNumber];
    return updated;
  });

  setZoneColours((previous) => {
    const updated = { ...previous };
    delete updated[zoneNumber];
    return updated;
  });
};


  const currentPanel = panelExamples[selectedPanel];
  const isAddressable = currentPanel.structure === "Addressable";
  // A removed custom zone or a template switch must not leave a hidden filter active.
  const activeZone = displayedZones.some((zone) => zone.number === selectedZone)
    ? selectedZone
    : "all";
  const hasActiveFilters =
    (isAddressable ? selectedLoop !== "all" : activeZone !== "all") ||
    selectedDeviceType !== "all" ||
    hideSounders;

  const clearFilters = () => {
    setSelectedLoop("all");
    setSelectedZone("all");
    setSelectedDeviceType("all");
    setHideSounders(false);
  };

  const filteredDevices = exampleDevices.filter(
    (device) =>
      (isAddressable
        ? Number(device.loop) <= installedLoops &&
          (selectedLoop === "all" || device.loop === selectedLoop)
        : activeZone === "all" || getDeviceZone(device) === activeZone) &&
      (selectedDeviceType === "all" || device.categories.includes(selectedDeviceType)) &&
      (!hideSounders || !device.categories.includes("Sounders/Beacons")),
  );

  return (
    <main className="product-page">
      {/* HERO SECTION */}

      <section className="product-hero">
        <div className="product-hero-content">
          <span className="section-label">INSTAFIREPILOT / FIRE ALARMS</span>

          <h1>
            Fire alarm inspections.
            <br />
            <span>Without the paperwork.</span>
          </h1>

          <p>
            A smarter way to manage fire alarm testing, device registers,
            inspection records and maintenance activities — built around how
            fire protection engineers actually work.
          </p>

          <a className="hero-primary" href="/demo">
            Request a Demo →
          </a>
        </div>
      </section>

      {/* INTRODUCTION */}

      <section className="product-intro">
        <span className="section-label">BUILT FOR FIRE ALARM ENGINEERS</span>

        <h2>
          Less administration.
          <br />
          More time engineering.
        </h2>

        <p>
          From small conventional systems to large addressable installations,
          InstaFirePilot is being developed to simplify fire alarm servicing,
          testing and asset management.
        </p>
      </section>

      {/* CORE FEATURES */}

      <section className="product-features">
        <div className="product-feature-grid">
          <article className="product-feature-card">
            <span>01</span>
            <h3>Device Registers</h3>
            <p>
              Keep an organised register of detectors, call points, sounders and
              other fire alarm equipment at each site.
            </p>
          </article>

          <article className="product-feature-card">
            <span>02</span>
            <h3>Rapid Device Search</h3>
            <p>
              Find devices by panel, loop, address, location or description
              without scrolling through hundreds of records.
            </p>
          </article>

          <article className="product-feature-card">
            <span>03</span>
            <h3>Flexible Testing</h3>
            <p>
              Record tests in the order you carry them out, rather than
              following a fixed sequence. Ideal for large and complex sites.
            </p>
          </article>

          <article className="product-feature-card">
            <span>04</span>
            <h3>Inspection History</h3>
            <p>
              Maintain a traceable history of inspections, defects, engineer
              notes and completed testing activities.
            </p>
          </article>

          <article className="product-feature-card">
            <span>05</span>
            <h3>Office Visibility</h3>
            <p>
              Give authorised office staff visibility of assigned sites,
              inspection progress and submitted engineer records.
            </p>
          </article>

          <article className="product-feature-card">
            <span>06</span>
            <h3>Offline-First Working</h3>
            <p>
              Designed for sites with unreliable mobile reception, with local
              record storage and synchronisation when connectivity returns.
            </p>
          </article>
        </div>
      </section>

      {/* SMART PANEL SELECTION */}

      <section
        className="product-features panel-selector"
        aria-labelledby="panel-selection-heading"
      >
        <div className="product-intro">
          <span className="section-label">SMART PANEL CONFIGURATION</span>

          <h2 id="panel-selection-heading">
            Different panels.
            <br />
            <span>One intelligent platform.</span>
          </h2>

          <p>
            Setting up a new installation or taking over an existing fire alarm
            system? Choose the manufacturer and panel model to preview an
            appropriate device register structure.
          </p>
        </div>

        <div className="product-feature-grid">
          {panelExamples.map((panel, index) => (
            <button
              key={panel.model}
              type="button"
              className="product-feature-card"
              aria-pressed={selectedPanel === index}
              onClick={() => setSelectedPanel(index)}
            >
              <span>
                {selectedPanel === index ? "✓ SELECTED" : "SELECT PANEL"}
              </span>

              <img
                src={panel.image}
                alt={`${panel.manufacturer} ${panel.model} fire alarm panel`}
                className="panel-selector-image"
                loading="lazy"
                decoding="async"
              />

              <h3>{panel.manufacturer}</h3>
              <p>{panel.model}</p>
            </button>
          ))}
        </div>

        <div className="product-intro" aria-live="polite" aria-atomic="true">
          <span className="section-label">PANEL CONFIGURATION PREVIEW</span>

          <h2>
            {currentPanel.manufacturer}
            <br />
            {currentPanel.model}
          </h2>

          <p>System type: {currentPanel.structure}</p>
          {currentPanel.structure === "Addressable" && (
            <div className="panel-loop-configuration">
              <label htmlFor="installed-loops">Loops fitted (example)</label>

              <select
                id="installed-loops"
                className="register-zone-select"
                value={installedLoops}
                onChange={(event) => {
                  const loopCount = Number(event.target.value);
                  setInstalledLoops(loopCount);
                  if (Number(selectedLoop) > loopCount) {
                    setSelectedLoop("all");
                  }
                }}
              >
                {[1, 2, 3, 4].map((count) => (
                  <option key={count} value={count}>
                    {count} {count === 1 ? "Loop" : "Loops"}
                  </option>
                ))}
              </select>

              <p>
                Only example devices on the selected loops will appear in the
                preview.
              </p>
            </div>
          )}
          <p>
            Suggested register structure:
            <br />
            <strong>{currentPanel.fields}</strong>
          </p>

          <p>
            Engineers can customise the layout, numbering and equipment
            references to match the actual installation.
          </p>

          <p>
            Example configuration only. No devices are automatically created.
          </p>

          {/* CONFIGURATION MODE */}

          <div
            className="panel-config-mode"
            role="group"
            aria-label="Panel configuration mode"
          >
            <button
              type="button"
              className={configMode === "template" ? "active" : ""}
              aria-pressed={configMode === "template"}
              onClick={() => setConfigMode("template")}
            >
              Manufacturer Template
            </button>

            <button
              type="button"
              className={configMode === "custom" ? "active" : ""}
              aria-pressed={configMode === "custom"}
              onClick={() => setConfigMode("custom")}
            >
              Custom Configuration
            </button>
          </div>

          <div className="panel-zone-example">
            <h3>Custom Zone Colours</h3>

            <p>
              Match your existing fire alarm zone plan. Select any colour for
              each zone.
            </p>

            <div className="panel-zone-list">
              {displayedZones.map((zone) => (
                <label
                  key={zone.number}
                  className="panel-zone-item"
                  style={{
                    "--zone-colour": zoneColours[zone.number],
                  }}
                >
                  <span className="panel-zone-number">Zone {zone.number}</span>

                  {configMode === "custom" ? (
                    <textarea
                      className="panel-zone-name-input"
                      aria-label={`Areas covered by Zone ${zone.number}`}
                      value={customZoneNames[zone.number] ?? ""}
                      placeholder="Enter all areas covered by this zone"
                      rows={2}
                      maxLength={300}
                      onChange={(event) => {
                        const coverage = event.target.value;

                        setCustomZoneNames((previous) => ({
                          ...previous,
                          [zone.number]: coverage,
                        }));
                      }}
                    />
                  ) : (
                    <span className="panel-zone-area">{zone.area}</span>
                  )}

                  <input
                    type="color"
                    value={zoneColours[zone.number]}
                    aria-label={`Choose colour for Zone ${zone.number}`}
                    onChange={(event) => {
                      const colour = event.target.value;

                      setZoneColours((previous) => ({
                        ...previous,
                        [zone.number]: colour,
                      }));
                    }}
                  />

                  {configMode === "custom" &&
                    extraZones.some(
                      (addedZone) => addedZone.number === zone.number,
                    ) && (
                      <button
                        type="button"
                        className="panel-remove-zone"
                        disabled={zoneHasDevices(zone.number)}
                        title={
                          zoneHasDevices(zone.number)
                            ? "Move assigned devices before removing this zone"
                            : `Remove Zone ${zone.number}`
                        }
                        onClick={() => removeZone(zone.number)}
                      >
                        Remove
                      </button>
                    )}
                </label>
              ))}
            </div>
            {configMode === "custom" && (
              <button
                type="button"
                className="panel-add-zone"
                onClick={addZone}
              >
                + Add Another Zone
              </button>
            )}
          </div>

          {/* EXAMPLE DEVICE REGISTER */}

          <div className="panel-device-register">
            <h3>Example Device Register</h3>

            <p>
              See how zone colours appear against individual equipment records.
            </p>

            <div className="panel-register-filters">
              {isAddressable ? (
                <div className="panel-register-filter">
                  <label htmlFor="register-loop-filter">Loop</label>
                  <select
                    id="register-loop-filter"
                    className="register-zone-select"
                    value={selectedLoop}
                    onChange={(event) => setSelectedLoop(event.target.value)}
                  >
                    <option value="all">All Loops</option>
                    {Array.from({ length: installedLoops }, (_, index) => (
                      <option key={index + 1} value={String(index + 1)}>
                        Loop {index + 1}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="panel-register-filter">
                  <label htmlFor="register-zone-filter">Zone</label>
                  <select
                    id="register-zone-filter"
                    className="register-zone-select"
                    value={activeZone}
                    onChange={(event) => setSelectedZone(event.target.value)}
                  >
                    <option value="all">All Zones</option>
                    {displayedZones.map((zone) => (
                      <option key={zone.number} value={zone.number}>
                        Zone {Number(zone.number)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="panel-register-filter">
                <label htmlFor="register-device-type-filter">Device Type</label>
                <select
                  id="register-device-type-filter"
                  className="register-zone-select"
                  value={selectedDeviceType}
                  onChange={(event) => setSelectedDeviceType(event.target.value)}
                >
                  <option value="all">All Types</option>
                  {deviceCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <label className="panel-register-hide-sounders">
                <input
                  type="checkbox"
                  checked={hideSounders}
                  onChange={(event) => setHideSounders(event.target.checked)}
                  aria-describedby="register-sounders-note"
                />
                Hide Sounders
              </label>
              <button
                type="button"
                className="panel-register-clear-filters"
                disabled={!hasActiveFilters}
                onClick={clearFilters}
              >
                Clear Filters
              </button>
            </div>
            <p id="register-sounders-note" className="register-demo-note">
              Hide Sounders excludes sounders, beacons and combined detector/sounder
              devices. Combined devices appear once and match either device type.
            </p>

            <div className="panel-register-scroll">
              <table className="panel-register-table">
                <thead>
                  <tr>
                    <th>Zone</th>

                    {currentPanel.structure === "Addressable" && <th>Loop</th>}

                    <th>
                      {currentPanel.structure === "Addressable"
                        ? "Address"
                        : "Device Ref"}
                    </th>

                    <th>Device Type</th>
                    <th>Location</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredDevices.map((device) => (
                      <tr
                        key={`${device.zone}-${device.loop}-${device.number}`}
                      >
                        <td>
                          <div className="register-zone-cell">
                            <span
                              className="register-zone-badge"
                              style={{
                                "--zone-colour":
                                  zoneColours[getDeviceZone(device)],
                              }}
                            >
                              {getDeviceZone(device)}
                            </span>

                            <span className="register-zone-name">
                              {configMode === "custom"
                                ? (customZoneNames[getDeviceZone(device)] ??
                                  `Zone ${getDeviceZone(device)}`)
                                : (exampleZones.find(
                                    (zone) =>
                                      zone.number === getDeviceZone(device),
                                  )?.area ?? `Zone ${getDeviceZone(device)}`)}
                            </span>

                            {configMode === "custom" && (
                              <select
                                className="register-zone-select"
                                aria-label={`Assign ${device.type} at ${device.location} to zone`}
                                value={getDeviceZone(device)}
                                onChange={(event) => {
                                  const newZone = event.target.value;

                                  setDeviceZoneChanges((previous) => ({
                                    ...previous,
                                    [deviceKey(device)]: newZone,
                                  }));
                                }}
                              >
                                {displayedZones.map((zone) => (
                                  <option key={zone.number} value={zone.number}>
                                    Zone {zone.number}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </td>

                        {currentPanel.structure === "Addressable" && (
                          <td>{device.loop}</td>
                        )}

                        <td>
                          {currentPanel.structure === "Addressable"
                            ? `${device.loop}${String(Number(device.number)).padStart(3, "0")}`
                            : `D${String(Number(device.number)).padStart(2, "0")}LP${Number(device.zone)}`}
                        </td>
                        <td>{device.type}</td>
                        <td>{device.location}</td>
                      </tr>
                    ))}
                  {filteredDevices.length === 0 && (
                    <tr>
                      <td colSpan={isAddressable ? 5 : 4}>
                        No example devices match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="register-demo-note">
              Illustrative records. Device numbering and zone assignments can be
              customised by engineers.
              {!isAddressable &&
                " Conventional LP references are equipment labels, not programmed addresses."}
            </p>
          </div>
        </div>
      </section>

      {/* MXPRO SECTION */}

      <section className="product-highlight">
        <div className="product-highlight-content">
          <span className="section-label">ENGINEER-FOCUSED WORKFLOWS</span>

          <h2>
            Built for real-world
            <br />
            fire alarm testing.
          </h2>

          <p>
            InstaFirePilot is designed around practical engineering workflows,
            including rapid address entry for supported systems such as Advanced
            MXPro installations.
          </p>

          <p>
            Engineers can locate equipment quickly, record results and move
            between devices without losing their place.
          </p>

          <div className="product-highlight-note">
            Designed with UK fire protection engineers in mind.
          </div>
        </div>
      </section>
    </main>
  );
}
export default FireAlarms;
