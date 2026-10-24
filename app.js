'use strict';

const Homey = require('homey');
const mDNSTracker = require('./lib/mDNSTracker');

class NetworkPresenceApp extends Homey.App {
  async onInit() {
    this.log('Network Presence App is starting...');

    // Initialize shared mDNS tracker for Bonjour announcements
    this.mdnsTracker = new mDNSTracker(this);
    this.mdnsTracker.start();

    // Register Phone Flow triggers
    this.triggerTurnedHome = this.homey.flow.getDeviceTriggerCard('turned_home');
    this.triggerTurnedAway = this.homey.flow.getDeviceTriggerCard('turned_away');

    // Register Guest App-level Flow triggers
    this.triggerGuestTurnedHome = this.homey.flow.getTriggerCard('guest_turned_home');
    this.triggerGuestTurnedAway = this.homey.flow.getTriggerCard('guest_turned_away');

    // Register Flow conditions
    const conditionIsHome = this.homey.flow.getConditionCard('is_home');
    if (conditionIsHome) {
      conditionIsHome.registerRunListener(async (args) => {
        return args.device.isCurrentlyPresent();
      });
    }

    const conditionGuestIsHome = this.homey.flow.getConditionCard('guest_device_is_home');
    if (conditionGuestIsHome) {
      conditionGuestIsHome.registerRunListener(async (args) => {
        return args.device.isCurrentlyPresent();
      });
    }

    // Register Flow actions
    const actionForceProbe = this.homey.flow.getActionCard('force_probe');
    if (actionForceProbe) {
      actionForceProbe.registerRunListener(async (args) => {
        return args.device.forceProbe();
      });
    }

    const actionGuestForceProbe = this.homey.flow.getActionCard('guest_device_force_probe');
    if (actionGuestForceProbe) {
      actionGuestForceProbe.registerRunListener(async (args) => {
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
