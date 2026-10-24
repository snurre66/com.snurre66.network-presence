'use strict';

const PhoneDevice = require('../phone/device');

class CarDevice extends PhoneDevice {
  async onInit() {
    this.awayDelayMinutes = Number(this.getSetting('away_delay')) || 2;
    this.probeIntervalSeconds = Number(this.getSetting('probe_interval')) || 15;

    // Ensure on_trip capability is registered
    if (!this.hasCapability('on_trip')) {
      await this.addCapability('on_trip').catch(this.error);
    }

    // Default internal state
    this.isOnTrip = this.getCapabilityValue('on_trip') === true;

    await super.onInit();
    this.log(`Car device initialized: ${this.getName()}, on_trip: ${this.isOnTrip}`);
  }

  async setTripState(onTrip) {
    this.isOnTrip = !!onTrip;
    await this.setCapabilityValue('on_trip', this.isOnTrip).catch(this.error);
    this.log(`Car ${this.getName()} trip state set to: ${this.isOnTrip}`);
  }

  getTripState() {
    return this.isOnTrip;
  }

  async onDeviceDetected(source = 'unknown') {
    const wasPresent = this.isPresent;
    await super.onDeviceDetected(source);

    if (!wasPresent && this.isPresent) {
      this.log(`Car Wi-Fi connected: ${this.getName()}`);

      // Basic connection trigger
      if (this.driver && this.driver.triggerTurnedHome) {
        this.driver.triggerTurnedHome.trigger(this).catch(this.error);
      }

      // Check trip status: Was this specific car on a confirmed trip?
      if (this.isOnTrip) {
        this.log(`Car returned from trip: ${this.getName()}`);
        await this.setTripState(false);

        // Driver level trigger
        if (this.driver && this.driver.triggerArrivedTrip) {
          this.driver.triggerArrivedTrip.trigger(this).catch(this.error);
        }
        // App level trigger
        if (this.homey.app && this.homey.app.triggerCarArrivedTrip) {
          this.homey.app.triggerCarArrivedTrip
            .trigger({ car_name: this.getName() })
            .catch(this.error);
        }
      } else {
        // Car woke up from sleep while parked at home
        this.log(`Car woke up from idle sleep in driveway: ${this.getName()}`);

        // Driver level trigger
        if (this.driver && this.driver.triggerWokeIdle) {
          this.driver.triggerWokeIdle.trigger(this).catch(this.error);
        }
        // App level trigger
        if (this.homey.app && this.homey.app.triggerCarWokeIdle) {
          this.homey.app.triggerCarWokeIdle
            .trigger({ car_name: this.getName() })
            .catch(this.error);
        }
      }
    }
  }

  async _evaluateAbsence() {
    const wasPresent = this.isPresent;
    await super._evaluateAbsence();

    if (wasPresent && !this.isPresent) {
      this.log(`Car Wi-Fi disconnected: ${this.getName()}`);

      // Basic disconnection trigger
      if (this.driver && this.driver.triggerTurnedAway) {
        this.driver.triggerTurnedAway.trigger(this).catch(this.error);
      }

      // Determine if departure is a genuine trip or idle sleep
      // Check if departure window was open or if trigger confirms trip
      const departureWindowActive = await this._checkDepartureWindowActive();

      if (departureWindowActive) {
        this.log(`Car departed on a genuine trip: ${this.getName()}`);
        await this.setTripState(true);

        // Driver level trigger
        if (this.driver && this.driver.triggerDepartedTrip) {
          this.driver.triggerDepartedTrip.trigger(this).catch(this.error);
        }
        // App level trigger
        if (this.homey.app && this.homey.app.triggerCarDepartedTrip) {
          this.homey.app.triggerCarDepartedTrip
            .trigger({ car_name: this.getName() })
            .catch(this.error);
        }
      } else {
        this.log(`Car fell asleep in driveway (idle sleep): ${this.getName()}`);
        await this.setTripState(false);

        // Driver level trigger
        if (this.driver && this.driver.triggerSleptIdle) {
          this.driver.triggerSleptIdle.trigger(this).catch(this.error);
        }
        // App level trigger
        if (this.homey.app && this.homey.app.triggerCarSleptIdle) {
          this.homey.app.triggerCarSleptIdle
            .trigger({ car_name: this.getName() })
            .catch(this.error);
        }
      }
    }
  }

  async _checkDepartureWindowActive() {
    try {
      // If homey.logic has bAvreiseVindu, inspect its current value
      if (this.homey && this.homey.logic) {
        const vars = await this.homey.logic.getVariables();
        if (vars) {
          for (const v of Object.values(vars)) {
            if (v.name === 'bAvreiseVindu') {
              this.log(`Inspected bAvreiseVindu: ${v.value}`);
              return v.value === true;
            }
          }
        }
      }
    } catch (err) {
      this.error('Could not check bAvreiseVindu logic variable:', err.message);
    }
    return false;
  }
}

module.exports = CarDevice;