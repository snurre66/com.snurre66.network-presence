'use strict';

const Homey = require('homey');
const ProbeEngine = require('../../lib/ProbeEngine');
const NetworkScanner = require('../../lib/NetworkScanner');

class PhoneDevice extends Homey.Device {
  async onInit() {
    this.log(`Device initialized: ${this.getName()}`);

    this.settings = this.getSettings() || {};
    this.currentIP = (this.settings.ip || '').trim();
    this.hostname = (this.settings.hostname || '').trim().toLowerCase();
    this.awayDelayMinutes = Number(this.settings.away_delay) || 10;
    this.tcpPorts = this._parsePorts(this.settings.tcp_ports);

    // Ensure smooth capability migration for existing devices
    if (!this.hasCapability('at_home')) {
      await this.addCapability('at_home').catch(this.error);
    }
    if (!this.hasCapability('last_seen')) {
      await this.addCapability('last_seen').catch(this.error);
    }
    if (this.hasCapability('alarm_presence')) {
      await this.removeCapability('alarm_presence').catch(this.error);
    }

    // Initial presence state
    this.isPresent = this.getCapabilityValue('at_home');
    if (typeof this.isPresent !== 'boolean') {
      this.isPresent = false;
      await this.setCapabilityValue('at_home', false).catch(this.error);
    }

    if (this.getCapabilityValue('last_seen') === null) {
      await this.setCapabilityValue('last_seen', 'Venter på første sjekk...').catch(this.error);
    }

    this.lastSeenTime = this.isPresent ? Date.now() : 0;
    this.isProbing = false;

    // Attach to shared mDNS tracker
    this._setupmDNSListener();

    // Start adaptive polling loop (30s when Home, 10s when Away)
    this._scheduleNextPoll(1000);
  }

  _parsePorts(portsString) {
    if (!portsString) return [62078, 5353, 80, 443];
    return portsString
      .split(',')
      .map((p) => parseInt(p.trim(), 10))
      .filter((p) => !isNaN(p) && p > 0 && p <= 65535);
  }

  _setupmDNSListener() {
    if (!this.homey.app || !this.homey.app.mdnsTracker) return;

    this.onDeviceSeen = ({ hostname, ip }) => {
      const cleanHost = (hostname || '').toLowerCase();
      if (this.hostname && cleanHost === this.hostname) {
        if (ip && ip !== this.currentIP) {
          this.log(`IP changed via mDNS for ${this.hostname}: ${this.currentIP} -> ${ip}`);
          this.currentIP = ip;
          this.setSettings({ ip }).catch(this.error);
        }
        this.onDeviceDetected('mdns_hostname_match');
        return;
      }

      if (this.currentIP && ip === this.currentIP) {
        if (!this.hostname && hostname) {
          this.hostname = cleanHost;
          this.setSettings({ hostname: cleanHost }).catch(this.error);
        }
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

  _scheduleNextPoll(delayMs = null) {
    this._clearPollTimer();

    let ms = delayMs;
    if (ms === null) {
      ms = this.isPresent ? 30000 : 10000;
    }

    this.pollTimer = this.homey.setTimeout(() => {
      this._pollCycle()
        .catch((err) => this.error('Error in poll cycle:', err))
        .finally(() => {
          this._scheduleNextPoll();
        });
    }, ms);
  }

  _clearPollTimer() {
    if (this.pollTimer) {
      this.homey.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async _pollCycle() {
    if (this.isProbing) return;
    this.isProbing = true;

    try {
      if (this.hostname && this.homey.app && this.homey.app.mdnsTracker) {
        const resolvedIP = this.homey.app.mdnsTracker.resolveIP(this.hostname);
        if (resolvedIP && resolvedIP !== this.currentIP) {
          this.currentIP = resolvedIP;
          this.setSettings({ ip: resolvedIP }).catch(this.error);
        }
      }

      if (!this.currentIP) return;

      const probeResult = await ProbeEngine.probeDevice(this.currentIP, this.tcpPorts, 1000);

      if (probeResult.online) {
        await this.onDeviceDetected(`probe_${probeResult.reason}`);
      } else {
        await this._evaluateAbsence();
      }
    } finally {
      this.isProbing = false;
    }
  }

  async onDeviceDetected(source = 'unknown') {
    const now = Date.now();
    this.lastSeenTime = now;

    // Auto-detect hostname if missing
    this._enrichMissingFields().catch(this.error);

    const timeStr = new Date(now).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
    await this.setCapabilityValue('last_seen', `I dag kl. ${timeStr}`).catch(this.error);

    if (!this.isPresent) {
      this.log(`Presence transition: AWAY -> HOME (source: ${source}, ip: ${this.currentIP})`);
      this.isPresent = true;

      await this.setCapabilityValue('at_home', true).catch(this.error);

      if (this.homey.app && this.homey.app.triggerTurnedHome) {
        this.homey.app.triggerTurnedHome.trigger(this).catch(this.error);
      }
    }
  }

  async _enrichMissingFields() {
    if (!this.hostname && this.currentIP) {
      const host = await NetworkScanner.reverseDNS(this.currentIP).catch(() => null);
      if (host) {
        this.hostname = host.toLowerCase();
        await this.setSettings({ hostname: host }).catch(this.error);
        this.log(`Auto-discovered hostname for ${this.currentIP}: ${host}`);
      }
    }
  }

  async _evaluateAbsence() {
    if (!this.isPresent) return;

    const silentMs = Date.now() - this.lastSeenTime;
    const graceMs = this.awayDelayMinutes * 60 * 1000;

    if (silentMs >= graceMs) {
      this.log(`Presence transition: HOME -> AWAY (silent for ${Math.round(silentMs / 1000)}s)`);
      this.isPresent = false;

      await this.setCapabilityValue('at_home', false).catch(this.error);

      const timeStr = this.lastSeenTime
        ? new Date(this.lastSeenTime).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
        : '';
      const lastSeenText = timeStr ? `Borte (sist sett ${timeStr})` : 'Borte';
      await this.setCapabilityValue('last_seen', lastSeenText).catch(this.error);

      if (this.homey.app && this.homey.app.triggerTurnedAway) {
        this.homey.app.triggerTurnedAway.trigger(this).catch(this.error);
      }
    }
  }

  isCurrentlyPresent() {
    return this.isPresent;
  }

  async forceProbe() {
    await this._pollCycle();
    return this.isPresent;
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.settings = newSettings;
    if (changedKeys.includes('ip')) this.currentIP = (newSettings.ip || '').trim();
    if (changedKeys.includes('hostname')) this.hostname = (newSettings.hostname || '').trim().toLowerCase();
    if (changedKeys.includes('away_delay')) this.awayDelayMinutes = Number(newSettings.away_delay) || 10;
    if (changedKeys.includes('tcp_ports')) this.tcpPorts = this._parsePorts(newSettings.tcp_ports);


  }

  async onDeleted() {
    this.log(`Device deleted: ${this.getName()}`);
    this._clearPollTimer();

    if (this.homey.app && this.homey.app.mdnsTracker) {
      if (this.onDeviceSeen) this.homey.app.mdnsTracker.removeListener('device_seen', this.onDeviceSeen);
      if (this.onIPTraffic) this.homey.app.mdnsTracker.removeListener('ip_traffic', this.onIPTraffic);
    }
  }
}

module.exports = PhoneDevice;
