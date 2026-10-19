# Network Presence for Homey Pro

**Network Presence** is a rock-solid presence detection app for Homey Pro that detects whether you and your household members are home or away based entirely on your local Wi-Fi network — without requiring any companion app installed on your smartphone!

---

## 🌟 Key Features

- **No Smartphone App Required:** Works completely passively from Homey Pro.
- **Deep-Sleep Immune (iOS & Android):** Smartphones aggressively turn off Wi-Fi in deep sleep to save battery, causing simple ping apps to falsely mark you as "Away". Network Presence solves this using multi-vector probing (TCP on Apple/mDNS ports, UDP waking pulses, and TCP RST detection).
- **mDNS / Bonjour Tracking (`.local`):** Automatically tracks devices across rotating or randomized MAC addresses and changing DHCP IP addresses.
- **1-Click Network Discovery Pairing:** Discovers all active phones and devices on your LAN automatically during pairing.
- **Asymmetric Hysteresis (Grace Period):**
  - **Instant Home:** Marks you as Home within seconds of your phone connecting to Wi-Fi.
  - **Configurable Away Delay:** Defaults to 10 minutes of complete silence before declaring Away, preventing false triggers while your phone is sleeping in your pocket.
- **Dual Homey Capabilities:** Provides both `alarm_presence` (Presence detected) and `alarm_motion` (Zone activity) on the device tile.
- **Homey Presence Sync:** Optionally synchronizes with Homey's built-in global user presence state.

---

## ⚙️ How It Works

```
[Smartphone (iOS/Android)]
       │
       ├─ (Wi-Fi connected) ──> Multicasts mDNS Bonjour packets (UDP 5353)
       │                        └──> Captured by Homey mDNSTracker (updates IP dynamically)
       │
       └─ (In pocket / sleeping)
              ▲
              │ Probes TCP ports (62078 / 5353 / 80 / 443) + UDP wake
       [Homey Pro - Network Presence]
              │
              ├──> Packet / RST received  ==> Mark HOME immediately (< 10s)
              └──> Continuous silence > 10m ==> Mark AWAY safely
```

---

## 🛠️ Flow Cards

### Triggers
- **Came home:** Triggers immediately when the device connects to Wi-Fi.
- **Left home:** Triggers when the device has been absent for the configured grace period.

### Conditions
- **Is at home / away:** Checks whether the device is currently present.

### Actions
- **Force presence check:** Forces an immediate on-demand network probe of the device.

---

## 📱 Supported Platforms & Devices
- Apple iPhone / iPad (iOS 14, 15, 16, 17, 18+)
- Android Smartphones & Tablets (Samsung, Google Pixel, Xiaomi, OnePlus, etc.)
- Any Wi-Fi connected device (Laptops, Smart Watches, etc.)

---

## 🔒 Privacy & Local Execution
This app runs 100% locally on your Homey Pro. No data or telemetry leaves your local network.

---

## 👤 Author & License
- **Author:** `snurre66`
- **License:** GPL-3.0-or-later
