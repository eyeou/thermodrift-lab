---
name: td-npg-bringup
description: Connect and bring up an Upside Down Labs NPG Lite over Web Bluetooth with the Thermodrift transport, or debug connection, packets and counters. Use for "no device", "no data", packet-format or firmware questions. Never flashes firmware.
---

# NPG transport and bring-up

## Before you start
Read `docs/HARDWARE.md` (vendor facts vs code findings vs unknowns) and `src/transport/npg-ble.js`.

## Steps
1. Serve on `127.0.0.1` (secure context) and open the app in desktop Chrome or Edge.
2. The operator powers the board, closes other BLE clients and clicks Connect: device choice is a user gesture, never automated.
3. Confirm packet length (7/13/70/130 bytes), rate ≈ 500 samples/s, missing counter 0, raw values within 0–4095.
4. For decoding questions, test with `encodePacket` fixtures in `tests/core-dsp.test.js`, not with the board.

## Stop if
Anything suggests changing firmware, sending commands other than START/STOP, or recording while mains-powered equipment touches the setup. Ask the operator.

## Check
`npm test` (decoder, counters); a simulator session shows the same packet path (`?source=simulated`).
