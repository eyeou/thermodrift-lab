/**
 * NPG Lite over Web Bluetooth (Chrome, secure context such as http://127.0.0.1).
 * Same service, characteristics and START/STOP command sequence as Berger Lab v3; no other
 * command is sent to the device (WHORU/STATUS exist in the inspected firmware but are not used
 * until tested on the board). One BLE client at a time: close Chords or other apps first.
 */
export const NPG_BLE = Object.freeze({
  service: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
  data: 'beb5483e-36e1-4688-b7f5-ea07361b26a8',
  control: '0000ff01-0000-1000-8000-00805f9b34fb',
  namePrefix: 'NPG',
});

class TransportError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export function createNpgBleTransport({ bluetooth = globalThis.navigator?.bluetooth, now = () => performance.now() } = {}) {
  const listeners = { packet: new Set(), disconnected: new Set() };
  let device = null, control = null, data = null, streaming = false;
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
      if (!bluetooth) throw new TransportError('Web Bluetooth unavailable. Open this page in desktop Chrome.', 'unsupported');
      try {
        device = await bluetooth.requestDevice({ filters: [{ namePrefix: NPG_BLE.namePrefix }], optionalServices: [NPG_BLE.service] });
      } catch (error) {
        if (error?.name === 'NotFoundError' || error?.name === 'SecurityError' || error?.name === 'NotAllowedError') throw new TransportError(error.name === 'NotFoundError' ? 'No device chosen (dialog closed). Retry when the NPG is on.' : `Bluetooth permission denied: ${error.message}`, 'permission_denied');
        throw new TransportError(`Bluetooth request failed: ${error.message}`, 'error');
      }
      device.addEventListener('gattserverdisconnected', onGattDisconnected);
      try {
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(NPG_BLE.service);
        control = await service.getCharacteristic(NPG_BLE.control);
        data = await service.getCharacteristic(NPG_BLE.data);
      } catch (error) {
        device.gatt?.disconnect();
        throw new TransportError(`Connected to ${device.name ?? 'device'} but the NPG service was not found: ${error.message}`, 'error');
      }
      return { deviceName: device.name ?? 'NPG (unnamed)' };
    },
    async start() {
      if (!data || !control) throw new TransportError('Not connected', 'error');
      data.addEventListener('characteristicvaluechanged', onValue);
      try {
        await data.startNotifications();
        streaming = true;
        await control.writeValue(new TextEncoder().encode('START'));
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
        await control?.writeValue(new TextEncoder().encode('STOP'));
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
    get streaming() { return streaming; },
  };
}
