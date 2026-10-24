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

    // Register Car App-level Flow triggers
    this.triggerCarDepartedTrip = this.homey.flow.getTriggerCard('car_departed_trip');
    this.triggerCarArrivedTrip = this.homey.flow.getTriggerCard('car_arrived_trip');
    this.triggerCarSleptIdle = this.homey.flow.getTriggerCard('car_slept_idle');
    this.triggerCarWokeIdle = this.homey.flow.getTriggerCard('car_woke_idle');

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

    const conditionCarIsHome = this.homey.flow.getConditionCard('car_device_is_home');
    if (conditionCarIsHome) {
      conditionCarIsHome.registerRunListener(async (args) => {
        return args.device.isCurrentlyPresent();
      });
    }

    const conditionCarIsOnTrip = this.homey.flow.getConditionCard('car_device_is_on_trip');
    if (conditionCarIsOnTrip) {
      conditionCarIsOnTrip.registerRunListener(async (args) => {
        return args.device.getTripState ? args.device.getTripState() : false;
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

    const actionCarForceProbe = this.homey.flow.getActionCard('car_device_force_probe');
    if (actionCarForceProbe) {
      actionCarForceProbe.registerRunListener(async (args) => {
        return args.device.forceProbe();
      });
    }

    const actionCarSetOnTrip = this.homey.flow.getActionCard('car_device_set_on_trip');
    if (actionCarSetOnTrip) {
      actionCarSetOnTrip.registerRunListener(async (args) => {
        if (args.device && args.device.setTripState) {
          await args.device.setTripState(args.on_trip);
        }
        return true;
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
