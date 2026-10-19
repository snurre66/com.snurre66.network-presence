'use strict';

const dgram = require('dgram');
const { EventEmitter } = require('events');

const MDNS_MULTICAST_ADDR = '224.0.0.251';
const MDNS_PORT = 5353;

/**
 * mDNSTracker listens for mDNS Bonjour multicast packets on the local network.
 * It detects devices as they connect or announce themselves, even when MAC or IP changes.
 */
class mDNSTracker extends EventEmitter {
  constructor(homey) {
    super();
    this.homey = homey;
    this.socket = null;
    this.cache = new Map(); // hostname (lower) -> { ip, lastSeen, originalName }
    this.ipToHost = new Map(); // ip -> hostname
    this.isListening = false;
  }

  /**
   * Start listening for mDNS broadcasts.
   */
  start() {
    if (this.isListening) return;

    try {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err) => {
        if (this.homey && this.homey.log) {
          this.homey.log(`[mDNSTracker] Socket error: ${err.message}`);
        }
      });

      this.socket.on('message', (msg, rinfo) => {
        this._parseMessage(msg, rinfo);
      });

      this.socket.on('listening', () => {
        try {
          this.socket.addMembership(MDNS_MULTICAST_ADDR);
        } catch (e) {
          // May fail if network interface not ready or already joined
        }
        this.isListening = true;
        if (this.homey && this.homey.log) {
          this.homey.log('[mDNSTracker] Listening for mDNS announcements on 224.0.0.251:5353');
        }
      });

      this.socket.bind(MDNS_PORT);
    } catch (err) {
      if (this.homey && this.homey.log) {
        this.homey.log(`[mDNSTracker] Could not bind to port 5353: ${err.message}`);
      }
    }
  }

  /**
   * Stop tracker and release socket.
   */
  stop() {
    if (this.socket) {
      try {
        if (this.isListening) {
          this.socket.dropMembership(MDNS_MULTICAST_ADDR);
        }
        this.socket.close();
      } catch (e) {
        // Ignore close error
      }
      this.socket = null;
      this.isListening = false;
    }
  }

  /**
   * Send an mDNS query to provoke active announcements on the network.
   */
  queryDiscovery() {
    if (!this.socket) return;

    try {
      // Query for _services._dns-sd._udp.local (standard Bonjour service discovery query)
      const queryBuf = Buffer.from([
        0x00, 0x00, // Transaction ID
        0x00, 0x00, // Flags (Standard Query)
        0x00, 0x01, // Questions: 1
        0x00, 0x00, // Answers: 0
        0x00, 0x00, // Authority RRs: 0
        0x00, 0x00, // Additional RRs: 0
        // Query Name: _services._dns-sd._udp.local
        0x09, 0x5f, 0x73, 0x65, 0x72, 0x76, 0x69, 0x63, 0x65, 0x73,
        0x07, 0x5f, 0x64, 0x6e, 0x73, 0x2d, 0x73, 0x64,
        0x04, 0x5f, 0x75, 0x64, 0x70,
        0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c,
        0x00,
        0x00, 0x0c, // Type: PTR (12)
        0x00, 0x01  // Class: IN (1)
      ]);

      this.socket.send(queryBuf, 0, queryBuf.length, MDNS_PORT, MDNS_MULTICAST_ADDR);
    } catch (e) {
      // Ignore query errors
    }
  }

  /**
   * Resolve a hostname to its most recent IP address.
   * @param {string} hostname e.g. "Thomas-iPhone.local"
   * @returns {string|null}
   */
  resolveIP(hostname) {
    if (!hostname) return null;
    const clean = hostname.trim().toLowerCase();
    const entry = this.cache.get(clean);
    return entry ? entry.ip : null;
  }

  /**
   * Get all currently discovered devices.
   */
  getDiscoveredDevices() {
    const list = [];
    for (const [host, item] of this.cache.entries()) {
      list.push({
        hostname: item.originalName || host,
        ip: item.ip,
        lastSeen: item.lastSeen
      });
    }
    return list;
  }

  /**
   * Parse DNS message buffer to find names and A records (IPv4).
   * @private
   */
  _parseMessage(buf, rinfo) {
    try {
      if (!buf || buf.length < 12) return;

      const srcIP = rinfo.address;
      const foundNames = [];

      // Extract printable labels from the buffer
      let offset = 12;
      while (offset < buf.length) {
        const len = buf[offset];
        if (len === 0) {
          offset++;
          continue;
        }

        // Pointer compression check
        if ((len & 0xc0) === 0xc0) {
          offset += 2;
          continue;
        }

        if (offset + 1 + len <= buf.length) {
          const str = buf.toString('utf8', offset + 1, offset + 1 + len);
          if (str && /^[a-zA-Z0-9_-]+$/.test(str)) {
            foundNames.push(str);
          }
          offset += 1 + len;
        } else {
          break;
        }
      }

      // Check if any extracted string looks like a device hostname ending with or next to "local"
      for (let i = 0; i < foundNames.length; i++) {
        const name = foundNames[i];
        if (name === 'local' && i > 0) {
          const hostPart = foundNames[i - 1];
          // Filter out generic protocol prefixes
          if (!hostPart.startsWith('_') && hostPart.length > 2) {
            const fullHost = `${hostPart}.local`;
            this._registerDevice(fullHost, srcIP);
          }
        } else if (name.toLowerCase().includes('iphone') || name.toLowerCase().includes('android') || name.toLowerCase().includes('galaxy') || name.toLowerCase().includes('ipad')) {
          const fullHost = `${name}.local`;
          this._registerDevice(fullHost, srcIP);
        }
      }

      // Also record the IP source as active
      this.emit('ip_traffic', { ip: srcIP, timestamp: Date.now() });
    } catch (e) {
      // Ignore parsing errors of malformed packets
    }
  }

  /**
   * Register or update device in cache.
   * @private
   */
  _registerDevice(hostname, ip) {
    const key = hostname.toLowerCase();
    const existing = this.cache.get(key);

    this.cache.set(key, {
      originalName: hostname,
      ip,
      lastSeen: Date.now()
    });

    this.ipToHost.set(ip, hostname);

    if (!existing || existing.ip !== ip) {
      if (this.homey && this.homey.log) {
        this.homey.log(`[mDNSTracker] Device identified: ${hostname} -> ${ip}`);
      }
      this.emit('device_seen', {
        hostname,
        ip,
        timestamp: Date.now()
      });
    }
  }
}

module.exports = mDNSTracker;
