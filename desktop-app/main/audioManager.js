const { run, output } = require("./pactl");
const { detectMode } = require("./deviceDetector");

let currentMode = "UNKNOWN";

function initAudio() {
  console.log("Initializing Audio Manager...");
  
  // Check if audio is already working
  try {
      run("pactl info");
      console.log("Audio server is already reachable. Skipping aggressive cleanup.");
      // CRITICAL: Unload existing modules to prevent stacking (double audio/feedback)
      softCleanup();
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

function softCleanup() {
  console.log("Soft Cleanup: Unloading existing Echo modules...");
  // Unload loopbacks (Mic->Sink, Sink->Sink, etc.)
  // We effectively hammer unload until it fails (no more modules) or we hit a limit
  // This prevents the "Noise/Feedback" from stacked loops.
  for (let i = 0; i < 10; i++) {
    // If output returns empty or error, we are done
    // But our 'run' catches errors. We can check output of 'pactl list modules' or just try unload.
    // simpler: just try unload.
    try {
        // We use execSync directly to catch the error for breaking the loop
        require("child_process").execSync("pactl unload-module module-loopback", { stdio: 'ignore' });
    } catch (e) {
        break; // No more loopbacks
    }
  }

  // Unload null sinks
  for (let i = 0; i < 5; i++) {
    try {
        require("child_process").execSync("pactl unload-module module-null-sink", { stdio: 'ignore' });
    } catch (e) {
        break; // No more null sinks
    }
  }
  console.log("Soft Cleanup Complete.");
}

function setup() {
  const { mode, source } = detectMode();
  console.log(`Detected Mode: ${mode}, Source: ${source}`);
  currentMode = mode;

  // --- 1. Create Sinks ---
  
  // A. SystemAudioSink: Takes all OS audio. We will route this to Speakers AND MixSink.
  run("pactl load-module module-null-sink sink_name=SystemAudioSink rate=48000 sink_properties=device.description=SystemAudioSink");
  run("pactl set-sink-mute SystemAudioSink 0");
  run("pactl set-sink-volume SystemAudioSink 100%");

  // B. RecordingMixSink: Takes System Audio + Mic. We record from here. User DOES NOT hear this.
  run("pactl load-module module-null-sink sink_name=RecordingMixSink rate=48000 sink_properties=device.description=RecordingMixSink");
  run("pactl set-sink-mute RecordingMixSink 0");
  run("pactl set-sink-volume RecordingMixSink 100%");


  // --- 2. Set Default Sink (Capture System Audio) ---
  // All apps will now send audio to SystemAudioSink by default
  run("pactl set-default-sink SystemAudioSink");


  // --- 3. Route Output (Hearing Path) ---
  // We need to route SystemAudioSink output to the Physical Speakers so user can hear.
  
  // Find Speaker Sink
  let speakerSink = "alsa_output.pci-0000_00_1b.0.analog-stereo"; // Fallback default
  
  if (mode === "USB") {
     // Get list of actual available sinks
     const sinkOutput = output("pactl list short sinks");
     const sinks = sinkOutput.split('\n').map(line => line.split('\t')[1]).filter(Boolean);
     
     console.log("Available Sinks:", sinks);

     // Try to match the specific device ID from the source
     // Source example: alsa_input.usb-Generic_...-00.mono-fallback
     // Extract 'usb-Generic_...-00'
     const idMatch = source.match(/usb-[^.]+/);
     const usbId = idMatch ? idMatch[0] : "usb"; // fallback to generic 'usb' if regex fails
     
     // Find a sink that contains this ID and is an output
     const specificSink = sinks.find(s => s.includes(usbId) && s.includes("alsa_output"));
     const anyUsbSink = sinks.find(s => s.includes("usb") && s.includes("alsa_output"));
     
     if (specificSink) {
         speakerSink = specificSink;
     } else if (anyUsbSink) {
         console.log("Exact USB pair not found, using first available USB sink.");
         speakerSink = anyUsbSink;
     } else {
         console.log("Warning: USB Mode detected but no USB output sink found. Falling back to default PCI.");
     }
  }
  
  console.log(`Routing System Audio to Speakers: ${speakerSink}`);
  run(`pactl set-sink-mute ${speakerSink} 0`);
  run(`pactl set-sink-volume ${speakerSink} 100%`);
  
  // Loopback 1: System -> Speakers (Hearing)
  run(`pactl load-module module-loopback source=SystemAudioSink.monitor sink=${speakerSink} latency_msec=10`);


  // --- 4. Route Input (Recording Path) ---
  
  // Loopback 2: System -> MixSink (Recording)
  run(`pactl load-module module-loopback source=SystemAudioSink.monitor sink=RecordingMixSink latency_msec=10`);

  // Loopback 3: Mic -> MixSink (Recording)
  if (mode !== "SYSTEM_ONLY" && source) {
    console.log(`Routing Mic (${source}) to RecordingMixSink`);
    run(`pactl set-source-mute ${source} 0`);
    run(`pactl set-source-volume ${source} 100%`);
    
    // IMPORTANT: sink=RecordingMixSink (NOT Speakers!)
    run(`pactl load-module module-loopback source=${source} sink=RecordingMixSink latency_msec=10`);
  }
  
  console.log("Audio Setup Complete. Dual Sink Architecture Active.");
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
