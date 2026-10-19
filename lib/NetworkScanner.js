'use strict';

const os = require('os');
const dns = require('dns');
const ProbeEngine = require('./ProbeEngine');

/**
 * NetworkScanner scans the local LAN to discover active devices during pairing.
 */
class NetworkScanner {
  /**
   * Determine the local IPv4 subnet prefix (e.g. "192.168.68.")
   */
  static getLocalSubnetPrefix() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (!iface.internal && iface.family === 'IPv4' && !iface.address.startsWith('127.')) {
          const parts = iface.address.split('.');
          if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.${parts[2]}.`;
          }
        }
      }
    }
    return '192.168.68.';
  }

  /**
   * Attempt reverse DNS lookup on an IP.
   */
  static reverseDNS(ip) {
    return new Promise((resolve) => {
      dns.reverse(ip, (err, hostnames) => {
        if (!err && hostnames && hostnames.length > 0) {
          resolve(hostnames[0]);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Scan local subnet for active devices.
   * 
   * @param {mDNSTracker} [mdnsTracker] Optional mDNS tracker instance
   * @param {number} [maxHosts=254]
   * @returns {Promise<Array<{ name: string, ip: string, hostname?: string }>>}
   */
  static async scanSubnet(mdnsTracker = null, maxHosts = 254) {
    const prefix = NetworkScanner.getLocalSubnetPrefix();
    const discovered = [];
    const discoveredIps = new Set();

    // 1. First add any devices already discovered by mDNS
    if (mdnsTracker) {
      mdnsTracker.queryDiscovery();
      const mdnsDevices = mdnsTracker.getDiscoveredDevices();
      for (const dev of mdnsDevices) {
        discoveredIps.add(dev.ip);
        discovered.push({
          name: dev.hostname ? `${dev.hostname} (${dev.ip})` : `Device (${dev.ip})`,
          ip: dev.ip,
          hostname: dev.hostname || ''
        });
      }
    }

    // 2. Scan remaining IPs in batches of 20 concurrent probes
    const batchSize = 25;
    const allIps = [];
    for (let i = 1; i <= maxHosts; i++) {
      const ip = `${prefix}${i}`;
      if (!discoveredIps.has(ip)) {
        allIps.push(ip);
      }
    }

    for (let i = 0; i < allIps.length; i += batchSize) {
      const batch = allIps.slice(i, i + batchSize);
      const batchPromises = batch.map(async (ip) => {
        const probe = await ProbeEngine.probeDevice(ip, [62078, 5353, 80, 443], 600);
        if (probe.online) {
          let host = mdnsTracker ? mdnsTracker.resolveIP(ip) : null;
          if (!host) {
            host = await NetworkScanner.reverseDNS(ip);
          }
          const label = host ? `${host} (${ip})` : `Network Device (${ip})`;
          return {
            name: label,
            ip,
            hostname: host || ''
          };
        }
        return null;
      });

      const results = await Promise.all(batchPromises);
      for (const res of results) {
        if (res) {
          discovered.push(res);
        }
      }
    }

    return discovered;
  }
}

module.exports = NetworkScanner;
