'use strict';

const Homey = require('homey');
const NetworkScanner = require('../../lib/NetworkScanner');

class PhoneDriver extends Homey.Driver {
  async onInit() {
    this.log('Phone / Person driver initialized.');
  }

  async onPair(session) {
    let selectedUser = { userId: 'none', userName: '' };

    session.setHandler('list_devices', async () => {
      return this.onPairListDevices();
    });

    session.setHandler('set_selected_user', async (data) => {
      this.log('User selected during pairing:', data);
      selectedUser = data || { userId: 'none', userName: '' };
      return true;
    });

    session.setHandler('add_device', async (device) => {
      if (selectedUser && selectedUser.userId && selectedUser.userId !== 'none') {
        device.settings = device.settings || {};
        device.settings.homey_user = selectedUser.userId;
        if (selectedUser.userName && !device.name.includes(selectedUser.userName)) {
          device.name = selectedUser.userName;
        }
      }
      return device;
    });
  }

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
        mac: '',
        homey_user: 'none'
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
              mac: dev.mac || '',
              homey_user: 'none'
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
