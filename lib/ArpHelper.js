'use strict';

const fs = require('fs');

/**
 * ArpHelper reads Linux ARP cache on Homey Pro to resolve MAC addresses
 * and detect smartphones using Private Wi-Fi addresses.
 */
class ArpHelper {
  /**
   * Read /proc/net/arp on Homey Pro Linux.
   * @returns {Map<string, string>} IP -> MAC
   */
  static getArpTable() {
    const table = new Map();
    try {
      if (fs.existsSync('/proc/net/arp')) {
        const content = fs.readFileSync('/proc/net/arp', 'utf8');
        const lines = content.split('\n');
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].trim().split(/\s+/);
          if (parts.length >= 4) {
            const ip = parts[0];
            const mac = parts[3].toLowerCase();
            if (mac && mac !== '00:00:00:00:00:00') {
              table.set(ip, mac);
            }
          }
        }
      }
    } catch (e) {
      // Ignore if not accessible
    }
    return table;
  }

  /**
   * Check if a MAC address has the "Locally Administered" bit set (second hex char 2, 6, A, or E).
   * This is the universal standard for iOS Private Wi-Fi Address and Android MAC randomization!
   * @param {string} mac 
   * @returns {boolean}
   */
  static isPrivateMac(mac) {
    if (!mac || typeof mac !== 'string') return false;
    const clean = mac.replace(/[:-]/g, '').toLowerCase();
    if (clean.length < 2) return false;
    return ['2', '6', 'a', 'e'].includes(clean[1]);
  }

  /**
   * Provide a friendly label based on MAC address and OUI.
   * @param {string} mac 
   * @returns {string|null}
   */
  static getDeviceTypeLabel(mac) {
    if (!mac) return null;
    if (ArpHelper.isPrivateMac(mac)) {
      return '📱 Mobil (Privat Wi-Fi)';
    }

    const clean = mac.replace(/[:-]/g, '').toLowerCase().substring(0, 6);
    // Known TP-Link / Deco OUIs
    if (clean.startsWith('202351') || clean.startsWith('201f3b')) {
      return '🌐 Deco / Ruter';
    }
    return null;
  }
}

module.exports = ArpHelper;
