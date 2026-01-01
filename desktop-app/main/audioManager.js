const { run } = require("./pactl");
const { detectMode } = require("./deviceDetector");

let currentMode = "UNKNOWN";

function initAudio() {
  console.log("Initializing Audio Manager...");
  
  // Check if audio is already working
  try {
      run("pactl info");
      console.log("Audio server is already reachable. Skipping aggressive cleanup.");
      // We still might want to ensure our modules are loaded, but let's be careful.
      // If we just want to setup:
      setup(); 
      return; 
  } catch (e) {
      console.log("Audio server not reachable. Attempting to restart...");
  }

  cleanup();
  setup();
}

function cleanup() {
  console.log("Cleaning up/Restarting PulseAudio state...");
  
  // Try to start via systemctl first, as it's cleaner on modern Linux
  try {
      const { execSync } = require("child_process"); // Ensure execSync is available if not global, but it is imported at top
      // Wait, 'run' is imported. execSync was used in pctl.js. 
      // audioManager.js DOES NOT import execSync?
      // checking imports: const { run } = require("./pactl");
      // I added execSync in my previous edit? No, I added the code block using execSync.
      // I need to make sure execSync is imported or use 'run' if it supports it. 'run' uses execSync but catches errors.
      // 'run' is safe.
      // But my previous edit used `execSync(...)`. This will fail if not imported!
      // I should use `run` but `run` swallows output/errors? No, run logs errors.
      // systemctl restart should probably be run with `run`.
      
      run("systemctl --user restart pulseaudio");
      run("sleep 2");
      return; 
  } catch(e) {
      console.log("systemctl restart failed, trying manual kill/start");
  }

  // Fallback to manual kill/start
  run("pulseaudio -k");
  run("sleep 2");
  run("pulseaudio --start");
  run("sleep 2");
  
  // Explicitly unload potential leftovers if the above didn't kill them or if we want to be safe
  // run("pactl unload-module module-null-sink");
  // run("pactl unload-module module-loopback");
}

function setup() {
  const { mode, source } = detectMode();
  console.log(`Detected Mode: ${mode}, Source: ${source}`);
  currentMode = mode;

  // 1. Create VirtualSink at 48kHz
  run("pactl load-module module-null-sink sink_name=VirtualSink rate=48000 sink_properties=device.description=VirtualSink");
  
  // Ensure it's not muted and volume is 100%
  run("pactl set-sink-mute VirtualSink 0");
  run("pactl set-sink-volume VirtualSink 100%");

  // 2. Connect Mic -> VirtualSink (if available)
  if (mode !== "SYSTEM_ONLY" && source) {
    console.log(`Unmuting source: ${source}`);
    // Ensure the mic itself is not muted
    run(`pactl set-source-mute ${source} 0`);
    run(`pactl set-source-volume ${source} 100%`);
    
    // latency_msec=10 for low delay
    run(`pactl load-module module-loopback source=${source} sink=VirtualSink latency_msec=10`);
  }

  // 3. Setup System Audio -> VirtualSink
  // Making VirtualSink the default sink captures all application audio
  run("pactl set-default-sink VirtualSink");

  // Force move existing streams to the new default sink (important for apps already running)
  // detailed helper would be needed for robustness, but usually setting default catches new streams.
  // For now, relies on apps respecting the switch or being restarted.
  
  // 4. Monitor VirtualSink -> Speakers
  // We need to find the speakers. Usually pci or usb output.
  // We can try to route to the same device family as the input if USB, or fallback to PCI.
  // For simplicity, we'll try to route to the hardware output corresponding to the input 'family', 
  // or just find the first non-virtual sink.
  
  // Simple heuristic: Route back to the "best" physical sink.
  // Since we just set VirtualSink as default, we need to explicitly find a physical sink.
  // This part can be tricky. Let's assume we want to hear on the same device we are speaking into if USB.
  
  let speakerSink = "alsa_output.pci-0000_00_1b.0.analog-stereo"; // Fallback default
  
  // If using USB mic, likely want USB speakers
  if (mode === "USB" && source.includes("usb")) {
     // replace 'input' with 'output' in source name often works for USB sets
     // e.g. alsa_input.usb-Generic... -> alsa_output.usb-Generic...
     const potentialSink = source.replace("alsa_input", "alsa_output");
     speakerSink = potentialSink;
  }
  
  console.log(`Setting up monitor loopback to speakers: ${speakerSink}`);
  
  // Unmute speaker sink too just in case
  run(`pactl set-sink-mute ${speakerSink} 0`);
  run(`pactl set-sink-volume ${speakerSink} 100%`);

  run(`pactl load-module module-loopback source=VirtualSink.monitor sink=${speakerSink} latency_msec=10`);
  
  console.log(`Audio Setup Complete. Routing VirtualSink.monitor -> ${speakerSink}`);
}

function getCurrentMode() {
  if (currentMode === "USB") return "USB Headset + System Audio";
  if (currentMode === "INTERNAL") return "Internal Mic + System Audio";
  return "System Audio Only";
}

let lastSource = null;
function checkAudioChanges() {
    const { mode, source } = detectMode();
    // Initialize lastSource if first run logic didn't set it (mostly it sets currentMode)
    if (!lastSource && source) lastSource = source;

    if (mode !== currentMode || (source && source !== lastSource)) {
        console.log(`Audio configuration changed! Mode: ${currentMode}->${mode}, Source: ${lastSource}->${source}`);
        initAudio(); // Re-initialize
        lastSource = source;
        return true; // Indicates change happened
    }
    return false;
}

module.exports = { initAudio, getCurrentMode, checkAudioChanges };
