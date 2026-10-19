'use strict';

const Homey = require('homey');
const NetworkScanner = require('../../lib/NetworkScanner');

class PhoneDriver extends Homey.Driver {
  async onInit() {
    this.log('Phone / Person driver initialized.');
  }

  /**
   * Called during device pairing when the list_devices template is displayed.
   * Performs an automated network scan to show all discovered devices.
   */
  async onPairListDevices() {
    this.log('Scanning network for devices during pairing...');
    try {
      const tracker = this.homey.app ? this.homey.app.mdnsTracker : null;
      const discovered = await NetworkScanner.scanSubnet(tracker);

      if (!discovered || discovered.length === 0) {
        // Return a default manual entry option if scan returned empty
        return [
          {
            name: this.homey.__('pair.manual_device') || 'Manual Phone / Device',
            data: { id: `manual_${Date.now()}` },
            settings: {
              ip: '192.168.68.',
              hostname: '',
              mac: ''
            }
          }
        ];
      }

      return discovered.map((dev, idx) => {
        const idSafe = dev.ip ? dev.ip.replace(/[^a-zA-Z0-9]/g, '_') : `idx_${idx}`;
        return {
          name: dev.name || `Device (${dev.ip})`,
          data: {
            id: `phone_${idSafe}_${Date.now()}`
          },
          settings: {
            ip: dev.ip,
            hostname: dev.hostname || '',
            mac: ''
          }
        };
      });
    } catch (err) {
      this.error('Error during onPairListDevices scan:', err);
      return [
        {
          name: 'Manual Phone / Device',
          data: { id: `manual_${Date.now()}` },
          settings: {
            ip: '192.168.68.',
            hostname: '',
            mac: ''
          }
        }
      ];
    }
  }
}

module.exports = PhoneDriver;
