'use strict';

const net = require('net');
const dgram = require('dgram');

/**
 * ProbeEngine provides robust network probing tailored for mobile devices (iOS / Android)
 * which enter deep sleep and ignore standard ICMP pings.
 */
class ProbeEngine {
  /**
   * Probe a target IP address across multiple TCP ports.
   * If any port connects OR returns ECONNREFUSED/ECONNRESET, the target's network stack is proven alive.
   * 
   * @param {string} ip Target IP address
   * @param {number[]} ports Array of TCP ports to test
   * @param {number} timeoutMs Timeout in milliseconds per probe
   * @returns {Promise<{ online: boolean, port?: number, reason?: string, latencyMs?: number }>}
   */
  static async probeTCP(ip, ports = [62078, 5353, 80, 443], timeoutMs = 1200) {
    if (!ip || typeof ip !== 'string') {
      return { online: false, reason: 'Invalid IP' };
    }

    // Try ports in parallel with a short timeout
    const probePromises = ports.map((port) => {
      return new Promise((resolve) => {
        const start = Date.now();
        const socket = new net.Socket();
        let resolved = false;

        const finish = (online, reason) => {
          if (resolved) return;
          resolved = true;
          socket.removeAllListeners();
          socket.destroy();
          resolve({
            online,
            port,
            reason,
            latencyMs: Date.now() - start
          });
        };

        socket.setTimeout(timeoutMs);

        socket.on('connect', () => {
          finish(true, 'connected');
        });

        socket.on('timeout', () => {
          finish(false, 'timeout');
        });

        socket.on('error', (err) => {
          // ECONNREFUSED or ECONNRESET means the target IP sent back a TCP RST packet.
          // This definitively confirms the target machine is powered on and active on the network!
          if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
            finish(true, `rst_${err.code.toLowerCase()}`);
          } else {
            finish(false, err.code ? err.code.toLowerCase() : 'error');
          }
        });

        try {
          socket.connect(port, ip);
        } catch (e) {
          finish(false, 'connect_exception');
        }
      });
    });

    const results = await Promise.all(probePromises);
    const aliveResult = results.find((r) => r.online);

    if (aliveResult) {
      return aliveResult;
    }

    return { online: false, reason: 'all_ports_timed_out' };
  }

  /**
   * Send a UDP wake/tickle packet to the target on port 5353 to encourage the Wi-Fi radio to wake.
   * 
   * @param {string} ip Target IP
   * @param {number} port Target port (default 5353 mDNS)
   */
  static sendUDPWake(ip, port = 5353) {
    return new Promise((resolve) => {
      if (!ip) return resolve(false);

      const socket = dgram.createSocket('udp4');
      // Standard dummy buffer / mDNS header query
      const buf = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

      socket.send(buf, 0, buf.length, port, ip, (err) => {
        try {
          socket.close();
        } catch (e) {
          // Ignore close error
        }
        resolve(!err);
      });
    });
  }

  /**
   * Complete multi-vector probe combining UDP wake and TCP multi-port check.
   * 
   * @param {string} ip Target IP
   * @param {number[]} ports TCP ports
   * @param {number} timeoutMs
   */
  static async probeDevice(ip, ports = [62078, 5353, 80, 443], timeoutMs = 1200) {
    if (!ip) return { online: false, reason: 'missing_ip' };

    // Send UDP tickle first
    ProbeEngine.sendUDPWake(ip).catch(() => {});

    // Small pause to allow hardware radio state change if sleeping
    await new Promise((r) => setTimeout(r, 60));

    // Probe TCP
    const tcpResult = await ProbeEngine.probeTCP(ip, ports, timeoutMs);
    return tcpResult;
  }
}

module.exports = ProbeEngine;
