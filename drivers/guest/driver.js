'use strict';

const Homey = require('homey');
const NetworkScanner = require('../../lib/NetworkScanner');

class GuestDriver extends Homey.Driver {
  async onInit() {
    this.log('Guest driver initialized.');
    this.triggerTurnedHome = this.homey.flow.getDeviceTriggerCard('guest_device_turned_home');
    this.triggerTurnedAway = this.homey.flow.getDeviceTriggerCard('guest_device_turned_away');
  }

  async onPair(session) {
    session.setHandler('scan_network', async () => {
      this.log('Scanning network for guest devices during pairing...');
      try {
        const tracker = this.homey.app ? this.homey.app.mdnsTracker : null;
        const discovered = await NetworkScanner.scanSubnet(tracker);
        return discovered || [];
      } catch (err) {
        this.error('Error during guest scan_network:', err);
        return [];
      }
    });

    session.setHandler('list_devices', async () => {
      return this.onPairListDevices();
    });
  }

  async onPairListDevices() {
    this.log('Listing guest devices during pairing...');
    const resultList = [];

    // Always offer manual IP entry as the first choice
    resultList.push({
      name: '➕ Skriv inn IP manuelt',
      data: { id: `manual_guest_${Date.now()}` },
      settings: {
        ip: '192.168.68.',
        hostname: '',
        away_delay: 5
      }
    });

    try {
      const tracker = this.homey.app ? this.homey.app.mdnsTracker : null;
      const discovered = await NetworkScanner.scanSubnet(tracker);

      if (discovered && discovered.length > 0) {
        for (const dev of discovered) {
          const idSafe = dev.ip ? dev.ip.replace(/[^a-zA-Z0-9]/g, '_') : `dev_${Date.now()}`;
          resultList.push({
            name: dev.name ? `Gjest (${dev.name})` : `Gjest .${dev.ip.split('.').pop()}`,
            data: {
              id: `guest_${idSafe}_${Date.now()}`
            },
            settings: {
              ip: dev.ip,
              hostname: dev.hostname || '',
              away_delay: 5
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

module.exports = GuestDriver;
