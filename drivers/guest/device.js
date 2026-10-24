'use strict';

const PhoneDevice = require('../phone/device');

class GuestDevice extends PhoneDevice {
  async onInit() {
    this.awayDelayMinutes = Number(this.getSetting('away_delay')) || 5;
    await super.onInit();
    this.log(`Guest device initialized: ${this.getName()}`);
  }

  async onDeviceDetected(source = 'unknown') {
    const wasPresent = this.isPresent;
    await super.onDeviceDetected(source);

    if (!wasPresent && this.isPresent) {
      this.log(`Guest arrived: ${this.getName()}`);
      if (this.driver && this.driver.triggerTurnedHome) {
        this.driver.triggerTurnedHome.trigger(this).catch(this.error);
      }
      if (this.homey.app && this.homey.app.triggerGuestTurnedHome) {
        this.homey.app.triggerGuestTurnedHome
          .trigger({ guest_name: this.getName() })
          .catch(this.error);
      }
    }
  }

  async _evaluateAbsence() {
    const wasPresent = this.isPresent;
    await super._evaluateAbsence();

    if (wasPresent && !this.isPresent) {
      this.log(`Guest left: ${this.getName()}`);
      if (this.driver && this.driver.triggerTurnedAway) {
        this.driver.triggerTurnedAway.trigger(this).catch(this.error);
      }
      if (this.homey.app && this.homey.app.triggerGuestTurnedAway) {
        this.homey.app.triggerGuestTurnedAway
          .trigger({ guest_name: this.getName() })
          .catch(this.error);
      }
    }
  }
}

module.exports = GuestDevice;
