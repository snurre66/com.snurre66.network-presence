'use strict';

const Homey = require('homey');
const ProbeEngine = require('../../lib/ProbeEngine');

class PhoneDevice extends Homey.Device {
  async onInit() {
    this.log(`Device initialized: ${this.getName()}`);

    this.settings = this.getSettings() || {};
    this.currentIP = (this.settings.ip || '').trim();
    this.hostname = (this.settings.hostname || '').trim().toLowerCase();
    this.mac = (this.settings.mac || '').trim().toLowerCase();
    this.awayDelayMinutes = Number(this.settings.away_delay) || 10;
    this.probeIntervalSec = Number(this.settings.probe_interval) || 15;
    this.tcpPorts = this._parsePorts(this.settings.tcp_ports);

    // Initial state
    this.isPresent = this.getCapabilityValue('alarm_presence');
    if (typeof this.isPresent !== 'boolean') {
      this.isPresent = false;
      await this.setCapabilityValue('alarm_presence', false).catch(this.error);
    }
    if (this.hasCapability('alarm_motion')) {
      await this.setCapabilityValue('alarm_motion', this.isPresent).catch(this.error);
    }

    this.lastSeenTime = this.isPresent ? Date.now() : 0;
    this.isProbing = false;

    // Attach to shared mDNS tracker
    this._setupmDNSListener();

    // Start proactive polling loop
    this._startPollingLoop();

    // Trigger initial probe immediately
    this.forceProbe().catch(this.error);
  }

  /**
   * Parse comma-separated port string into array of numbers.
   * @private
   */
  _parsePorts(portsString) {
    if (!portsString) return [62078, 5353, 80, 443];
    return portsString
      .split(',')
      .map((p) => parseInt(p.trim(), 10))
      .filter((p) => !isNaN(p) && p > 0 && p <= 65535);
  }

  /**
   * Listen for mDNS announcements from the shared mDNSTracker.
   * @private
   */
  _setupmDNSListener() {
    if (!this.homey.app || !this.homey.app.mdnsTracker) return;

    this.onDeviceSeen = ({ hostname, ip }) => {
      const cleanHost = (hostname || '').toLowerCase();

      // Check if hostname matches
      if (this.hostname && cleanHost === this.hostname) {
        if (ip && ip !== this.currentIP) {
          this.log(`IP changed for hostname ${this.hostname}: ${this.currentIP} -> ${ip}`);
          this.currentIP = ip;
          this.setSettings({ ip }).catch(this.error);
        }
        this.onDeviceDetected('mdns_hostname_match');
        return;
      }

      // Check if IP matches
      if (this.currentIP && ip === this.currentIP) {
        this.onDeviceDetected('mdns_ip_match');
      }
    };

    this.onIPTraffic = ({ ip }) => {
      if (this.currentIP && ip === this.currentIP) {
        this.onDeviceDetected('ip_traffic');
      }
    };

    this.homey.app.mdnsTracker.on('device_seen', this.onDeviceSeen);
    this.homey.app.mdnsTracker.on('ip_traffic', this.onIPTraffic);
  }

  /**
   * Start interval polling.
   * @private
   */
  _startPollingLoop() {
    this._stopPollingLoop();
    const intervalMs = Math.max(5000, this.probeIntervalSec * 1000);

    this.pollInterval = this.homey.setInterval(() => {
      this._pollCycle().catch((err) => {
        this.error('Error during poll cycle:', err);
      });
    }, intervalMs);
  }

  /**
   * Stop interval polling.
   * @private
   */
  _stopPollingLoop() {
    if (this.pollInterval) {
      this.homey.clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Single probe cycle.
   * @private
   */
  async _pollCycle() {
    if (this.isProbing) return;
    this.isProbing = true;

    try {
      // If hostname is configured but IP is missing or needs resolving, check mDNS cache
      if (this.hostname && this.homey.app && this.homey.app.mdnsTracker) {
        const resolvedIP = this.homey.app.mdnsTracker.resolveIP(this.hostname);
        if (resolvedIP && resolvedIP !== this.currentIP) {
          this.log(`Resolved hostname ${this.hostname} to new IP ${resolvedIP}`);
          this.currentIP = resolvedIP;
          this.setSettings({ ip: resolvedIP }).catch(this.error);
        }
      }

      if (!this.currentIP) {
        return;
      }

      const probeResult = await ProbeEngine.probeDevice(this.currentIP, this.tcpPorts, 1200);

      if (probeResult.online) {
        await this.onDeviceDetected(`probe_${probeResult.reason}`);
      } else {
        await this._evaluateAbsence();
      }
    } finally {
      this.isProbing = false;
    }
  }

  /**
   * Called whenever the device is confirmed active on the network.
   */
  async onDeviceDetected(source = 'unknown') {
    this.lastSeenTime = Date.now();

    if (!this.isPresent) {
      this.log(`Presence transition: AWAY -> HOME (source: ${source}, ip: ${this.currentIP})`);
      this.isPresent = true;

      await this.setCapabilityValue('alarm_presence', true).catch(this.error);
      if (this.hasCapability('alarm_motion')) {
        await this.setCapabilityValue('alarm_motion', true).catch(this.error);
      }

      // Fire Flow trigger
      if (this.homey.app && this.homey.app.triggerTurnedHome) {
        this.homey.app.triggerTurnedHome.trigger(this).catch(this.error);
      }

      // Sync with Homey user presence if enabled
      this._syncHomeyPresence(true).catch(this.error);
    }
  }

  /**
   * Evaluates how long the device has been silent and transitions to Away if grace period exceeded.
   * @private
   */
  async _evaluateAbsence() {
    if (!this.isPresent) return;

    const silentMs = Date.now() - this.lastSeenTime;
    const graceMs = this.awayDelayMinutes * 60 * 1000;

    if (silentMs >= graceMs) {
      this.log(`Presence transition: HOME -> AWAY (silent for ${Math.round(silentMs / 1000)}s, threshold: ${graceMs / 1000}s)`);
      this.isPresent = false;

      await this.setCapabilityValue('alarm_presence', false).catch(this.error);
      if (this.hasCapability('alarm_motion')) {
        await this.setCapabilityValue('alarm_motion', false).catch(this.error);
      }

      // Fire Flow trigger
      if (this.homey.app && this.homey.app.triggerTurnedAway) {
        this.homey.app.triggerTurnedAway.trigger(this).catch(this.error);
      }

      // Sync with Homey user presence if enabled
      this._syncHomeyPresence(false).catch(this.error);
    }
  }

  /**
   * Synchronize with Homey's built-in presence manager.
   * @private
   */
  async _syncHomeyPresence(present) {
    if (!this.settings.sync_homey_presence) return;

    try {
      if (this.homey.presence && typeof this.homey.presence.setPresent === 'function') {
        const targetUser = this.settings.homey_user_name;
        if (present) {
          await this.homey.presence.setPresent(targetUser ? { user: targetUser } : {});
        } else {
          await this.homey.presence.setAway(targetUser ? { user: targetUser } : {});
        }
        this.log(`Homey global user presence synchronized to ${present ? 'PRESENT' : 'AWAY'}`);
      }
    } catch (err) {
      this.error('Could not synchronize Homey user presence:', err.message);
    }
  }

  /**
   * Condition check for Flow cards.
   */
  isCurrentlyPresent() {
    return this.isPresent;
  }

  /**
   * Force an immediate check (triggered by Flow action or manually).
   */
  async forceProbe() {
    this.log(`Forced presence probe requested for ${this.getName()} (${this.currentIP})`);
    await this._pollCycle();
    return this.isPresent;
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Settings changed:', changedKeys);
    this.settings = newSettings;

    if (changedKeys.includes('ip')) {
      this.currentIP = (newSettings.ip || '').trim();
    }
    if (changedKeys.includes('hostname')) {
      this.hostname = (newSettings.hostname || '').trim().toLowerCase();
    }
    if (changedKeys.includes('mac')) {
      this.mac = (newSettings.mac || '').trim().toLowerCase();
    }
    if (changedKeys.includes('away_delay')) {
      this.awayDelayMinutes = Number(newSettings.away_delay) || 10;
    }
    if (changedKeys.includes('tcp_ports')) {
      this.tcpPorts = this._parsePorts(newSettings.tcp_ports);
    }
    if (changedKeys.includes('probe_interval')) {
      this.probeIntervalSec = Number(newSettings.probe_interval) || 15;
      this._startPollingLoop();
    }
  }

  async onDeleted() {
    this.log(`Device deleted: ${this.getName()}`);
    this._stopPollingLoop();

    if (this.homey.app && this.homey.app.mdnsTracker) {
      if (this.onDeviceSeen) {
        this.homey.app.mdnsTracker.removeListener('device_seen', this.onDeviceSeen);
      }
      if (this.onIPTraffic) {
        this.homey.app.mdnsTracker.removeListener('ip_traffic', this.onIPTraffic);
      }
    }
  }
}

module.exports = PhoneDevice;
