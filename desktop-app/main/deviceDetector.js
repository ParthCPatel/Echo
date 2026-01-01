const { output } = require("./pactl");

function getSources() {
  const rawOutput = output("pactl list short sources");
  if (!rawOutput) return [];

  return rawOutput
    .split("\n")
    .map(l => {
      // output format: "ID Name Module SampleSrc ..."
      // we want the Name (2nd column, index 1)
      const parts = l.split("\t");
      return parts[1]; 
    })
    .filter(Boolean);
}

function detectMode() {
  const sources = getSources();

  // HEURISTIC: prefer USB, then PCI (internal), clearly distinguish monitors
  // Note: We ignore .monitor sources for mic detection to avoid feedback loops or wrong categorization
  
  const usb = sources.find(s => s.startsWith("alsa_input.usb") && !s.endsWith(".monitor"));
  const internal = sources.find(s => s.startsWith("alsa_input.pci") && !s.endsWith(".monitor"));
  
  // Also check for bluetooth if needed, but keeping scope to request
  const bluetooth = sources.find(s => s.startsWith("bluez_input"));

  if (usb) return { mode: "USB", source: usb };
  if (internal) return { mode: "INTERNAL", source: internal };
  if (bluetooth) return { mode: "BLUETOOTH", source: bluetooth };
  
  return { mode: "SYSTEM_ONLY", source: null };
}

module.exports = { detectMode };
