# Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| *Web Bluetooth unavailable* | Not desktop Chrome/Edge, or opened from a LAN address | Use `http://127.0.0.1:8072` in Chrome or Edge |
| No device in the dialog | Board off, or held by another app (Chords, a second tab) | Close other BLE clients; power-cycle the board |
| *Stale: no data for 2 s* | Link dropped or the tab was throttled | Keep the tab visible; move the laptop closer; check the battery |
| Missing counter grows | Bluetooth losses | Expect analysis to restart (10 s guard); losses inside the firmware are invisible, see `HARDWARE.md` |
| *ADC clipping* | Contact lost or electrode saturated | Re-seat pads; check the − and REF sites; do not trust filtered views while clipping |
| Strong 50 Hz | Mains nearby, laptop charging, cable loops | Unplug chargers; shorten and twist leads |
| High-frequency share | Jaw or face tension, swallowing | Relax the jaw; mark the event |
| Filters settling | Just started or recovered from a gap | Wait 10 s before a protocol |
| Long test blocked: *Test the spoken cue* | Cue not tested in this session | Click *Test spoken cue*, then tick *I heard it clearly* |
| *Storage full* | Browser quota | Export, then delete old sessions in the browser |
| Export downloads instead of asking where to save | Browser without the save dialog API | The file is in Downloads; the page cannot confirm completion |
| Report says *still recording in another tab* | The session is open live elsewhere | Finish it there; if that tab is gone, reload the home page to mark it interrupted |
