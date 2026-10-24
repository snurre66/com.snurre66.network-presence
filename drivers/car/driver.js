'use strict';

const Homey = require('homey');
const NetworkScanner = require('../../lib/NetworkScanner');

class CarDriver extends Homey.Driver {
  async onInit() {
    this.log('Car driver initialized.');
    this.triggerTurnedHome = this.homey.flow.getDeviceTriggerCard('car_device_turned_home');
    this.triggerTurnedAway = this.homey.flow.getDeviceTriggerCard('car_device_turned_away');
    this.triggerDepartedTrip = this.homey.flow.getDeviceTriggerCard('car_device_departed_trip');
    this.triggerArrivedTrip = this.homey.flow.getDeviceTriggerCard('car_device_arrived_trip');
    this.triggerSleptIdle = this.homey.flow.getDeviceTriggerCard('car_device_slept_idle');
    this.triggerWokeIdle = this.homey.flow.getDeviceTriggerCard('car_device_woke_idle');
  }

  async onPair(session) {
    session.setHandler('scan_network', async () => {
      this.log('Scanning network for car devices during pairing...');
      try {
        const tracker = this.homey.app ? this.homey.app.mdnsTracker : null;
        const discovered = await NetworkScanner.scanSubnet(tracker);
        return discovered || [];
      } catch (err) {
        this.error('Error during car scan_network:', err);
        return [];
      }
    });

    session.setHandler('list_devices', async () => {
      return this.onPairListDevices();
    });
  }

  async onPairListDevices() {
    this.log('Listing car devices during pairing...');
    const resultList = [];

    resultList.push({
      name: '➕ Skriv inn IP manuelt',
      data: { id: `manual_car_${Date.now()}` },
      settings: {
        ip: '192.168.68.',
        hostname: '',
        away_delay: 2
      }
    });

    try {
      const tracker = this.homey.app ? this.homey.app.mdnsTracker : null;
      const discovered = await NetworkScanner.scanSubnet(tracker);

      if (discovered && discovered.length > 0) {
        for (const dev of discovered) {
          resultList.push({
            name: `🚗 ${dev.name || dev.ip}`,
            data: { id: `car_${(dev.ip || '').replace(/\\./g, '_')}_${Date.now()}` },
            settings: {
              ip: dev.ip,
              hostname: dev.hostname || '',
              away_delay: 2
            }
          });
        }
      }
    } catch (err) {
      this.error('Error during onPairListDevices:', err);
    }

    return resultList;
  }
}

module.exports = CarDriver;