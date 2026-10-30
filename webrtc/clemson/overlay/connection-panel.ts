import type { ConnectionConfig } from '../types';
import { cloudApi } from '../api/unitree-cloud';

let sessionKey = '';
export function getClemsonAesKey(): string { return sessionKey; }
export function clearClemsonAesKey(): void { sessionKey = ''; }
export type ConnectHandler = (config: ConnectionConfig) => void;

/** Clemson's single AP connection form; no account, family, or mode menus. */
export class ConnectionPanel {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private statusEl: HTMLElement;
  private key: HTMLInputElement;
  private ip: HTMLInputElement;

  constructor(parent: HTMLElement, onConnect: ConnectHandler,
              _onBack: () => void, _onAccount: () => void, _onFamilyChange?: () => void) {
    cloudApi.setConnectFamily('Go2');
    this.container = document.createElement('form');
    this.container.className = 'connection-panel clemson-connect';
    this.container.innerHTML = `
      <p class="clemson-eyebrow">CLEMSON / GO2</p><h2>Open robot web view</h2>
      <p class="clemson-connect-hint">Join the Go2 Wi-Fi hotspot first.</p>
      <label for="clemson-ip">Robot IP address</label>
      <input id="clemson-ip" value="192.168.12.1" inputmode="decimal" required autocomplete="off">
      <label for="clemson-key">AES key</label>
      <input id="clemson-key" type="password" required autocomplete="off" spellcheck="false"
        minlength="32" maxlength="32" pattern="[0-9a-fA-F]{32}" placeholder="32-character robot key">
      <p class="clemson-connect-hint">The key stays in this page's memory until disconnect or reload.</p>
      <button type="submit" class="btn-connect">Connect and open web view</button>
      <p class="status" role="status" aria-live="polite"></p>`;
    parent.appendChild(this.container);
    this.button = this.container.querySelector('button')!;
    this.statusEl = this.container.querySelector('.status')!;
    this.key = this.container.querySelector('#clemson-key')!;
    this.ip = this.container.querySelector('#clemson-ip')!;
    this.container.addEventListener('submit', event => {
      event.preventDefault();
      const ip = this.ip.value.trim();
      const parts = ip.split('.');
      if (parts.length !== 4 || !parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255)) {
        this.setStatus('Enter a valid IPv4 address; Go2 hotspot default is 192.168.12.1.', 'error');
        return;
      }
      const key = this.key.value.trim();
      if (!/^[0-9a-fA-F]{32}$/.test(key)) {
        this.setStatus('Enter the 32-character hexadecimal AES key.', 'error');
        return;
      }
      sessionKey = key;
      this.key.value = '';
      this.setConnecting(true);
      onConnect({mode: 'AP', ip, serialNumber: '', token: '', email: '', password: ''});
    });
  }

  destroy(): void { this.container.remove(); }
  setStatus(text: string, type = 'info'): void {
    this.statusEl.textContent = text;
    this.statusEl.className = `status status-${type}`;
  }
  setConnecting(connecting: boolean): void {
    this.button.disabled = connecting;
    this.ip.disabled = connecting;
    this.key.disabled = connecting;
    this.button.textContent = connecting ? 'Connecting…' : 'Connect and open web view';
  }
  setConnected(connected: boolean): void {
    // Keep the form locked until validation opens the web view.
    if (connected) this.setConnecting(true);
  }
}
