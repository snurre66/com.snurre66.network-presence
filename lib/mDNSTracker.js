'use strict';

const dgram = require('dgram');
const { EventEmitter } = require('events');

const MDNS_MULTICAST_ADDR = '224.0.0.251';
const MDNS_PORT = 5353;
const MAX_CACHE_SIZE = 30;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Super-lean mDNSTracker with minimal memory footprint and bounded cache.
 */
class mDNSTracker extends EventEmitter {
  constructor(homey) {
    super();
    this.homey = homey;
    this.socket = null;
    this.cache = new Map(); // hostname (lower) -> { ip, lastSeen, originalName }
    this.isListening = false;
  }

  start() {
    if (this.isListening) return;

    try {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err) => {
        // Suppress repeated socket errors to keep logs clean
      });

      this.socket.on('message', (msg, rinfo) => {
        this._parseMessage(msg, rinfo);
      });

      this.socket.on('listening', () => {
        try {
          this.socket.addMembership(MDNS_MULTICAST_ADDR);
          // unref the socket so Node's event loop isn't forced to stay pinned
          this.socket.unref();
        } catch (e) {
          // Interface might not be ready
        }
        this.isListening = true;
      });

      this.socket.bind(MDNS_PORT);
    } catch (err) {
      // Ignored
    }
  }

  stop() {
    if (this.socket) {
      try {
        if (this.isListening) {
          this.socket.dropMembership(MDNS_MULTICAST_ADDR);
        }
        this.socket.close();
      } catch (e) {}
      this.socket = null;
      this.isListening = false;
      this.cache.clear();
    }
  }

  queryDiscovery() {
    if (!this.socket) return;
    try {
      const queryBuf = Buffer.from([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x09, 0x5f, 0x73, 0x65, 0x72, 0x76, 0x69, 0x63, 0x65, 0x73,
        0x07, 0x5f, 0x64, 0x6e, 0x73, 0x2d, 0x73, 0x64,
        0x04, 0x5f, 0x75, 0x64, 0x70,
        0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c,
        0x00,
        0x00, 0x0c, 0x00, 0x01
      ]);
      this.socket.send(queryBuf, 0, queryBuf.length, MDNS_PORT, MDNS_MULTICAST_ADDR);
    } catch (e) {}
  }

  resolveIP(hostname) {
    if (!hostname) return null;
    const clean = hostname.trim().toLowerCase();
    const entry = this.cache.get(clean);
    if (!entry) return null;
    if (Date.now() - entry.lastSeen > CACHE_TTL_MS) {
      this.cache.delete(clean);
      return null;
    }
    return entry.ip;
  }

  getDiscoveredDevices() {
    const list = [];
    const now = Date.now();
    for (const [host, item] of this.cache.entries()) {
      if (now - item.lastSeen <= CACHE_TTL_MS) {
        list.push({
          hostname: item.originalName || host,
          ip: item.ip,
          lastSeen: item.lastSeen
        });
      }
    }
    return list;
  }

  _parseMessage(buf, rinfo) {
    try {
      if (!buf || buf.length < 12) return;

      const srcIP = rinfo.address;
      const foundNames = [];
      let offset = 12;

      while (offset < buf.length && foundNames.length < 5) {
        const len = buf[offset];
        if (len === 0) {
          offset++;
          continue;
        }
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

      for (let i = 0; i < foundNames.length; i++) {
        const name = foundNames[i];
        if (name === 'local' && i > 0) {
          const hostPart = foundNames[i - 1];
          if (!hostPart.startsWith('_') && hostPart.length > 2) {
            this._registerDevice(`${hostPart}.local`, srcIP);
          }
        } else if (/iphone|android|galaxy|pixel|ipad/i.test(name)) {
          this._registerDevice(`${name}.local`, srcIP);
        }
      }

      this.emit('ip_traffic', { ip: srcIP, timestamp: Date.now() });
    } catch (e) {}
  }

  _registerDevice(hostname, ip) {
    const key = hostname.toLowerCase();

    // Prune cache if it exceeds max size
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    const existing = this.cache.get(key);
    this.cache.set(key, {
      originalName: hostname,
      ip,
      lastSeen: Date.now()
    });

    if (!existing || existing.ip !== ip) {
      this.emit('device_seen', {
        hostname,
        ip,
        timestamp: Date.now()
      });
    }
  }
}

module.exports = mDNSTracker;
