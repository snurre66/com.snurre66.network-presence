'use strict';

const os = require('os');
const dns = require('dns');
const ProbeEngine = require('./ProbeEngine');
const ArpHelper = require('./ArpHelper');

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
   * Formats names with short IP prefix so Homey never truncates the identity.
   * 
   * @param {mDNSTracker} [mdnsTracker]
   * @param {number} [maxHosts=254]
   * @returns {Promise<Array<{ name: string, ip: string, hostname?: string, mac?: string, isPhone?: boolean }>>}
   */
  static async scanSubnet(mdnsTracker = null, maxHosts = 254) {
    const prefix = NetworkScanner.getLocalSubnetPrefix();
    const discovered = [];
    const discoveredIps = new Set();
    const arpTable = ArpHelper.getArpTable();

    // Helper to format device name as either hostname or short single-line IP (IP .xx)
    const formatDeviceName = (ip, host) => {
      const lastOctet = ip.split('.').pop();
      if (host) {
        const cleanHost = host.replace(/\.local$/i, '');
        return {
          name: cleanHost,
          isPhone: /iphone|android|galaxy|pixel|ipad|phone/i.test(host)
        };
      }

      return {
        name: `IP .${lastOctet}`,
        isPhone: false
      };
    };

    // 1. Add devices discovered by mDNS
    if (mdnsTracker) {
      mdnsTracker.queryDiscovery();
      const mdnsDevices = mdnsTracker.getDiscoveredDevices();
      for (const dev of mdnsDevices) {
        discoveredIps.add(dev.ip);
        const mac = arpTable.get(dev.ip) || '';
        const { name, isPhone } = formatDeviceName(dev.ip, dev.hostname, mac);
        discovered.push({
          name,
          ip: dev.ip,
          hostname: dev.hostname || '',
          mac,
          isPhone
        });
      }
    }

    // 2. Scan remaining IPs in batches
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
          const mac = arpTable.get(ip) || '';
          let host = mdnsTracker ? mdnsTracker.resolveIP(ip) : null;
          if (!host) {
            host = await NetworkScanner.reverseDNS(ip);
          }
          const { name, isPhone } = formatDeviceName(ip, host, mac);
          return {
            name,
            ip,
            hostname: host || '',
            mac,
            isPhone
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

    // Sort: Phones / mobile devices first, then by IP
    discovered.sort((a, b) => {
      if (a.isPhone && !b.isPhone) return -1;
      if (!a.isPhone && b.isPhone) return 1;
      const aNum = parseInt(a.ip.split('.').pop() || '0', 10);
      const bNum = parseInt(b.ip.split('.').pop() || '0', 10);
      return aNum - bNum;
    });

    return discovered;
  }
}

module.exports = NetworkScanner;
