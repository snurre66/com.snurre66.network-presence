'use strict';

const Homey = require('homey');
const mDNSTracker = require('./lib/mDNSTracker');

class NetworkPresenceApp extends Homey.App {
  async onInit() {
    this.log('Network Presence App is starting...');

    // Initialize shared mDNS tracker for Bonjour announcements
    this.mdnsTracker = new mDNSTracker(this);
    this.mdnsTracker.start();

    // Register Flow triggers
    this.triggerTurnedHome = this.homey.flow.getDeviceTriggerCard('turned_home');
    this.triggerTurnedAway = this.homey.flow.getDeviceTriggerCard('turned_away');

    // Register Flow condition
    const conditionIsHome = this.homey.flow.getConditionCard('is_home');
    if (conditionIsHome) {
      conditionIsHome.registerRunListener(async (args) => {
        return args.device.isCurrentlyPresent();
      });
    }

    // Register Flow action
    const actionForceProbe = this.homey.flow.getActionCard('force_probe');
    if (actionForceProbe) {
      actionForceProbe.registerRunListener(async (args) => {
        return args.device.forceProbe();
      });
    }

    this.log('Network Presence App initialized successfully.');
  }

  async onUninit() {
    if (this.mdnsTracker) {
      this.mdnsTracker.stop();
    }
  }
}

module.exports = NetworkPresenceApp;
