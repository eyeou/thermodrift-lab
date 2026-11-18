/**
 * NPG Lite over Web Bluetooth (desktop Chrome or Edge, secure context such as http://127.0.0.1).
 * START and STOP drive streaming. `command()` sends the live-status commands of the Thermodrift
 * firmware (Q + six letters, BZn, VBn); stock firmware answers them UNKNOWN COMMAND and ignores them.
 * Writes are queued: Web Bluetooth refuses overlapping GATT operations. One BLE client at a time: close Chords or other apps first.
 */
export const NPG_BLE = Object.freeze({
  service: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
  data: 'beb5483e-36e1-4688-b7f5-ea07361b26a8',
  control: '0000ff01-0000-1000-8000-00805f9b34fb',
  battery: 'f633d0ec-46b4-43c1-a39f-1ca06d0602e1',
  namePrefix: 'NPG',
});

class TransportError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export function createNpgBleTransport({ bluetooth = globalThis.navigator?.bluetooth, now = () => performance.now() } = {}) {
  const listeners = { packet: new Set(), disconnected: new Set(), control: new Set(), battery: new Set() };
  let device = null, control = null, data = null, streaming = false;
  let queue = Promise.resolve();
  const queued = (operation) => {
    const p = queue.then(operation);
    queue = p.catch(() => {});
    return p;
  };
  const write = (text) => queued(() => control.writeValue(new TextEncoder().encode(text)));
  const onControl = (event) => { const text = new TextDecoder().decode(event.target.value); for (const fn of listeners.control) fn(text); };
  const onBattery = (event) => { const pct = event.target.value.getUint8(0); for (const fn of listeners.battery) fn(pct); };
  /** Characteristics are per GATT connection, so a reconnection fetches them again. Extras are optional: stock firmware or older boards simply lack them. */
  const attach = async () => {
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(NPG_BLE.service);
    control = await service.getCharacteristic(NPG_BLE.control);
    data = await service.getCharacteristic(NPG_BLE.data);
    try { await queued(() => control.startNotifications()); control.addEventListener('characteristicvaluechanged', onControl); } catch { /* no button or version replies */ }
    try {
      const battery = await service.getCharacteristic(NPG_BLE.battery);
      await queued(() => battery.startNotifications());
      battery.addEventListener('characteristicvaluechanged', onBattery);
    } catch { /* no battery notifications */ }
  };
  const onValue = (event) => {
    const arrival = now();
    for (const fn of listeners.packet) fn(event.target.value, arrival);
  };
  const onGattDisconnected = () => {
    streaming = false;
    data?.removeEventListener('characteristicvaluechanged', onValue);
    for (const fn of listeners.disconnected) fn({ reason: 'Bluetooth connection lost (gattserverdisconnected)' });
  };
  return {
    kind: 'ble',
    transportName: 'web-bluetooth',
    label: 'NPG Lite · Web Bluetooth',
    supported: !!bluetooth,
    on(event, fn) { listeners[event].add(fn); return () => listeners[event].delete(fn); },
    async connect() {
      if (!bluetooth) throw new TransportError('Web Bluetooth unavailable. Open this page in desktop Chrome or Edge.', 'unsupported');
      try {
        device = await bluetooth.requestDevice({ filters: [{ namePrefix: NPG_BLE.namePrefix }], optionalServices: [NPG_BLE.service] });
      } catch (error) {
        if (error?.name === 'NotFoundError' || error?.name === 'SecurityError' || error?.name === 'NotAllowedError') throw new TransportError(error.name === 'NotFoundError' ? 'No device chosen (dialog closed). Retry when the NPG is on.' : `Bluetooth permission denied: ${error.message}`, 'permission_denied');
        throw new TransportError(`Bluetooth request failed: ${error.message}`, 'error');
      }
      device.addEventListener('gattserverdisconnected', onGattDisconnected);
      try {
        await attach();
      } catch (error) {
        device.gatt?.disconnect();
        throw new TransportError(`Connected to ${device.name ?? 'device'} but the NPG service was not found: ${error.message}`, 'error');
      }
      return { deviceName: device.name ?? 'NPG (unnamed)' };
    },
    /** Same device, no chooser, so no user gesture is needed. Throws while the board is out of reach. */
    async reconnect() {
      if (!device) throw new TransportError('No device to reconnect to', 'error');
      device.addEventListener('gattserverdisconnected', onGattDisconnected);
      await attach();
      return { deviceName: device.name ?? 'NPG (unnamed)' };
    },
    async start() {
      if (!data || !control) throw new TransportError('Not connected', 'error');
      data.addEventListener('characteristicvaluechanged', onValue);
      try {
        await queued(() => data.startNotifications());
        streaming = true;
        await write('START');
      } catch (error) {
        streaming = false;
        data.removeEventListener('characteristicvaluechanged', onValue);
        try { await data.stopNotifications(); } catch { /* already stopped */ }
        throw new TransportError(`Start failed: ${error.message}`, 'error');
      }
    },
    async stop() {
      streaming = false;
      try {
        if (control) await write('STOP');
        await data?.stopNotifications();
      } finally {
        data?.removeEventListener('characteristicvaluechanged', onValue);
      }
    },
    async disconnect() {
      streaming = false;
      data?.removeEventListener('characteristicvaluechanged', onValue);
      device?.removeEventListener('gattserverdisconnected', onGattDisconnected);
      device?.gatt?.disconnect();
    },
    /** Fire-and-forget device command; resolves true when written. */
    async command(text) {
      if (!control || !device?.gatt?.connected) return false;
      try { await write(text); return true; } catch { return false; }
    },
    get streaming() { return streaming; },
  };
}
