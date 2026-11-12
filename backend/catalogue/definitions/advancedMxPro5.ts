/** Development catalogue input only. No installed configuration or service procedure. */
export function advancedMxPro5DevelopmentDefinition() {
  return {
    kind: "fire-alarm-panels", modelId: "advanced-mxpro-5", versionId: "dev-v1",
    definition: {
      manufacturer: "Advanced", modelDesignation: "MxPro 5",
      sourceReferences: [
        "https://datasheets.advancedco.com/advancedco/english/uk/mxpro/",
        "https://datasheets.advancedco.com/advancedco/english/uk/mxpro/mxpro-5/panels-and-loop-cards/1-4-loop-fire-alarm-control-panel/",
      ],
      configurationCapabilities: { schemaVersion: 1, scope: "model-family", loopCount: "variant-dependent",
        zones: "site-configured", deviceAddressFormat: "protocol-and-site-dependent", networking: "optional-hardware-dependent" },
    },
  };
}
