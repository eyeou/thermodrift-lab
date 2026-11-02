# Safety and limitations

Thermodrift Lab is a research tool for self-run experiments. It is not a medical device and makes no diagnosis.

## Setup

- Record on battery: the NPG Lite and the laptop unplugged, nothing mains-powered touching the setup.
- Use the vendor's electrodes and placement guidance. Stop if the skin is irritated.
- The apps only listen. They send `START` and `STOP` to the board and never change its firmware.

## Breathing sessions

- The Breathwork app records a session. It cues its short signal check and supervises nothing.
- Fast breathing can cause dizziness, tingling or fainting, and it delays the urge to breathe. Stay lying down, never in or near water, standing or driving. Give any hold a time limit, and stop for chest pain, faintness or anything unusual.
- With a heart condition, epilepsy or a pregnancy, ask a doctor first.

## What the numbers are

- **ADC counts**, not microvolts. Gain and electrode impedance are not measured.
- **Prompted** eye states. The app knows what it asked, not what the eyes did.
- **Mixed signals during breathwork.** Breathing changes CO₂, movement and muscle tone, and each of these can change the EEG. Scalp EEG above about 20 Hz carries muscle activity, more so during effortful breathing ([source](docs/SOURCES.md)).
- **Heuristic** quality flags (clipping, flat signal, mains, high-frequency share). They are not an impedance check and do not separate brain activity from eye, muscle or line noise.
- **Browser** timing. Cue callbacks report what the speech engine did, not what was heard; arrival times are browser times.
- **One session, one person.** Adjacent blocks are not independent repetitions; results are descriptive.

## Known blind spots

- The inspected NPG firmware can drop samples before numbering them when Bluetooth buffers are full. Such losses do not show up as counter gaps. See [`docs/HARDWARE.md`](docs/HARDWARE.md).
- The role of the board's REF input is not documented by the vendor.
- The simulator is a fixed test pattern for the interface, never a model of physiology.
