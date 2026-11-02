# Hardware matrix

What is known about the NPG Lite as used here, and how it is known. **Vendor** = Upside Down Labs documentation. **Firmware** = reading the vendor's open-source firmware. **Code** = what the apps in this repository do. **Unknown** = not documented and not measured.

| Item | Value | Basis |
|---|---|---|
| Board | NPG Lite; the apps do not read its revision | Vendor · Code |
| Microcontroller | ESP32-C6 | Vendor |
| ADC | 12-bit; values arrive as big-endian 16-bit words, 0–4095 | Vendor · Firmware |
| Channels | Up to 6; packets carry 3 or 6 | Vendor · Firmware |
| VibZ+ channels | Channels 4–6 (A3P/A3N, A4P/A4N, A5P/A5N) are on the VibZ+ playmate of the Beast kit | Vendor |
| VibZ+ start-up | The Breathwork app asks for VibZ+ to be attached before the NPG is switched on, and for the board to appear as `NPG-Lite-6CH`; the vendor page does not mention this name | Code |
| Second REF | One REF serves all six channels; if channels 4–6 look floating, the montage notes place a second REF next to the first. Its electrical role is not described | Code · Unknown |
| Sample rate | 500 Hz nominal | Firmware |
| Clock accuracy | Not calibrated against a reference | Unknown |
| Gain, input range in µV, hardware filters | Not stated on the inspected pages | Unknown |
| Bluetooth | Service `4fafc201-1fb5-459e-8fcc-c5c9c331914b`, data `beb5483e-36e1-4688-b7f5-ea07361b26a8`, control `0000ff01-0000-1000-8000-00805f9b34fb`; text commands `START` / `STOP` | Firmware · Code |
| Packet | `[counter u8][ch1 u16 BE]…[chN u16 BE]`, 10 records per notification: 7 / 13 / 70 / 130 bytes | Firmware · Code |
| Counter | 8-bit, +1 per sample, restarts at `START` | Firmware |
| Silent losses | When Bluetooth buffers are full, samples are dropped **before** they are numbered, so counter gaps cannot reveal them (Chords-Arduino-Firmware `NPG-LITE-BLE.ino` @ `57adf4d`) | Firmware |
| CN switch | Ties the negative inputs to the common line inside the board (the vendor's wording: “physically connects all negative inputs to the common line”) | Vendor |
| REF | A separate input from CN and the negatives; its electrical role is not described | Vendor · Unknown |
| Vendor EEG placement | Positive lead on the target site; REF and negative lead on the bony area behind the ears | Vendor |
| Impedance | No meter; never measured | Unknown |
| Firmware installed | Not queried by the apps | Unknown |

## Montages

| Montage | App | Leads | Basis |
|---|---|---|---|
| One channel, Oz − left ear | Berger Effect | A0P → Oz, A0N → left rear-ear bony site, REF → right rear-ear bony site, CN unused, A0-to-CN link off | Vendor EEG placement · Code |
| Two channels against a common negative | Berger Effect, separate session | A0P → Oz, A1P → Fpz, CN → left ear (switch on), REF → right ear | Vendor CN switch · Code |
| One channel, Fpz − Oz direct | Berger Effect, separate session | A0P → Fpz, A0N → Oz, CN link off, REF behind an ear | Code; not a vendor-documented montage |
| Six channels (default) | Breathwork | ECG: A0P → left lower ribs, A0N → below the right collarbone. EEG: A1P → Oz, A1N → left rear-ear bony site; A2P → Cz, A2N → second electrode behind the left ear. EOG: A3P → right eye, A3N → left eye, 1 cm out from the outer corner. EMG: A4P/A4N → left sternocleidomastoid; A5P/A5N → right upper trapezius. REF → right rear-ear bony site. CN switch off, VibZ+ attached | Code (`apps/breathwork/config.js`); EEG leads follow the vendor EEG placement, channels 4–6 are on VibZ+ (Vendor) |
| Other montages | Breathwork | Six channels with Fpz on A3 instead of the EOG; three channels (ECG, Oz, and neck EMG or Fpz on A2); two channels (ECG, Oz) | Code (`apps/breathwork/config.js`) |

## Open questions

- What is REF electrically on this board (driven, bias or reference)?
- What is the gain, so counts could be converted to microvolts?
- How often do silent firmware drops happen at 500 Hz with 3 and 6 channels?

Not done: gain calibration with a known signal, impedance measurement, firmware identification, an independent review by the vendor or an EEG technician.
