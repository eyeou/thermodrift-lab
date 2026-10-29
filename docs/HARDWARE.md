# Hardware matrix

What we know about the NPG Lite as used here, and how we know it. **Vendor** = Upside Down Labs documentation. **Firmware** = reading the vendor's open-source firmware. **Measured** = observed in our recordings or tests. **Operator** = reported by the person running the session. **Unknown** = not documented and not measured.

| Item | Value | Basis |
|---|---|---|
| Board | NPG Lite (Beast kit, VibZ+ playmate); exact revision not verified | Operator |
| Microcontroller | ESP32-C6 | Vendor |
| ADC | 12-bit; values arrive as big-endian 16-bit words, 0–4095 | Vendor · Measured |
| Channels | Up to 6; packets carry 3 or 6 | Vendor · Firmware |
| Sample rate | 500 Hz nominal; ≈500.0–500.2 samples/s arrive in the browser | Firmware · Measured |
| Clock accuracy | Not calibrated against a reference | Unknown |
| Gain, input range in µV, hardware filters | Not stated on the inspected pages | Unknown |
| Bluetooth | Service `4fafc201-1fb5-459e-8fcc-c5c9c331914b`, data `beb5483e-36e1-4688-b7f5-ea07361b26a8`, control `0000ff01-0000-1000-8000-00805f9b34fb`; text commands `START` / `STOP` | Firmware · Measured |
| Packet | `[counter u8][ch1 u16 BE]…[chN u16 BE]`, 10 records per notification: 7 / 13 / 70 / 130 bytes | Firmware · Measured |
| Counter | 8-bit, +1 per sample, restarts at `START` | Firmware · Measured |
| Silent losses | When Bluetooth buffers are full, samples are dropped **before** they are numbered, so counter gaps cannot reveal them (Chords-Arduino-Firmware `NPG-LITE-BLE.ino` @ `57adf4d`) | Firmware |
| CN switch | Ties the negative inputs to the common line inside the board (the vendor's wording: “physically connects all negative inputs to the common line”) | Vendor |
| REF | A separate input from CN and the negatives; its electrical role is not described | Vendor · Unknown |
| Vendor EEG placement | Positive lead on the target site; REF and negative lead on the bony area behind the ears | Vendor |
| Impedance | No meter; never measured | Unknown |
| Firmware installed | Not queried by the apps | Unknown |

## Montages used so far

| Montage | Leads | Status |
|---|---|---|
| One channel, Oz − left ear | A0P → Oz, A0N → left rear-ear bony site, REF → right rear-ear bony site, CN unused (switch position not confirmed) | Used for the completed Berger session (29 Oct 2026) |
| Two channels against a common negative | A0P → Oz, A1P → Fpz, CN → left ear (switch on), REF → right ear | Earlier attempts dominated by a ~33 Hz comb; planned again with a wiring check first |
| One channel, Fpz − Oz direct | A0P → Fpz, A0N → Oz, REF behind an ear | Planned; not a vendor-documented montage |

## Observations worth knowing (operator and measured)

- Mains (50 Hz) dominates raw power on this setup, even with the battery-only check ticked; the analysis path notches 50/100/150/200 Hz and the raw view keeps it visible.
- A ~33 Hz comb (16.7 Hz spacing) dominated two-channel sessions; moving the black lead from CN to A0N was reported to remove it. Cause not established.
- Contacts that slip push samples to the ADC floor; the clipping flag catches it and the analysis rejects those windows.
- The Chords web app (2.7.1a) filters ≈0.1–90 Hz, not the 1–45 Hz its comments say.

## Not done (yet)

Gain calibration with a known signal · impedance measurement · firmware identification · controlled CN vs A0N comparison · an independent review by the vendor or an EEG technician.
