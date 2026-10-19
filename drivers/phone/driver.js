'use strict';

const Homey = require('homey');
const NetworkScanner = require('../../lib/NetworkScanner');

class PhoneDriver extends Homey.Driver {
  async onInit() {
    this.log('Phone / Person driver initialized.');
  }

  /**
   * Called during device pairing when the list_devices template is displayed.
   * Performs an automated network scan to show all discovered devices,
   * with a manual entry option at the top.
   */
  async onPairListDevices() {
    this.log('Scanning network for devices during pairing...');
    const resultList = [];

    // Always offer manual IP entry as the first choice
    resultList.push({
      name: '➕ Skriv inn IP manuelt',
      data: { id: `manual_${Date.now()}` },
      settings: {
        ip: '192.168.68.',
        hostname: '',
        mac: ''
      }
    });

    try {
      const tracker = this.homey.app ? this.homey.app.mdnsTracker : null;
      const discovered = await NetworkScanner.scanSubnet(tracker);

      if (discovered && discovered.length > 0) {
        for (const dev of discovered) {
          const idSafe = dev.ip ? dev.ip.replace(/[^a-zA-Z0-9]/g, '_') : `dev_${Date.now()}`;
          resultList.push({
            name: dev.name,
            data: {
              id: `phone_${idSafe}_${Date.now()}`
            },
            settings: {
              ip: dev.ip,
              hostname: dev.hostname || '',
              mac: dev.mac || ''
            }
          });
        }
      }
    } catch (err) {
      this.error('Error during onPairListDevices scan:', err);
    }

    return resultList;
  }
}

module.exports = PhoneDriver;
