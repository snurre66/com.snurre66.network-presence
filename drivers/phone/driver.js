'use strict';

const Homey = require('homey');
const NetworkScanner = require('../../lib/NetworkScanner');
const UserHelper = require('../../lib/UserHelper');

class PhoneDriver extends Homey.Driver {
  async onInit() {
    this.log('Phone / Person driver initialized.');
  }

  async onPair(session) {
    let selectedUser = { userId: 'none', userName: '', firstName: '' };

    session.setHandler('set_selected_user', async (data) => {
      this.log('User selected in step 1:', data);
      const userId = data ? data.userId : 'none';
      const userName = data ? data.userName : '';
      const firstName = UserHelper.getFirstName(userName || userId) || '';
      selectedUser = { userId, userName, firstName };
      return true;
    });

    session.setHandler('get_selected_user', async () => {
      return selectedUser;
    });

    session.setHandler('scan_network', async () => {
      this.log('Scanning network for devices during pairing...');
      try {
        const tracker = this.homey.app ? this.homey.app.mdnsTracker : null;
        const discovered = await NetworkScanner.scanSubnet(tracker);
        return discovered || [];
      } catch (err) {
        this.error('Error during scan_network:', err);
        return [];
      }
    });

    session.setHandler('list_devices', async () => {
      return this.onPairListDevices(selectedUser);
    });
  }

  async onPairListDevices(selectedUser = { userId: 'none', userName: '' }) {
    this.log('Scanning network for devices during pairing, assigned to user:', selectedUser);
    const resultList = [];
    const userId = (selectedUser && selectedUser.userId) ? selectedUser.userId : 'none';
    const userName = (selectedUser && selectedUser.userName && selectedUser.userId !== 'none') ? selectedUser.userName : '';

    // Always offer manual IP entry as the first choice
    resultList.push({
      name: '➕ Skriv inn IP manuelt',
      data: { id: `manual_${Date.now()}` },
      settings: {
        ip: '192.168.68.',
        hostname: '',
        homey_user: userId
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
              homey_user: userId
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
