# Echo Desktop Audio Capture

This is a specialized Electron app designed to manage Linux PulseAudio for high-quality voice + system audio capture.

It automatically:

1.  **Resets PulseAudio** to a clean state.
2.  **Creates a VirtualSink** for mixing audio.
3.  **Detects your Microphone** (USB preferred, then Internal).
4.  **Routes Audio**:
    - Mic -> VirtualSink
    - System Audio -> VirtualSink
    - VirtualSink Monitor -> Speakers (so you can hear)

## Prerequisites

- Linux OS with PulseAudio (`pulseaudio`, `pactl`) installed.
- Node.js installed.

## Installation

```bash
cd desktop-app
npm install
```

## Running the App

```bash
npm start
```

## How It Works

- **USB Mode**: If a USB headset is found, it uses it for input and output.
- **Internal Mode**: Falls back to internal mic if no USB device is present.
- **System Only**: If no mic is found, it records system audio only.

## Troubleshooting

If you lose audio, simply close the app. The app attempts to clean up on start, but you can always run:

```bash
pulseaudio -k && pulseaudio --start
```

to manually reset your system audio stack.
