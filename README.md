# Jellyfin supports plugins for VR

**English** | [Français](README.fr.md)

---

# English

A JavaScript extension that adds VR video playback capabilities to **Jellyfin Web**.

It is mainly designed for **Meta Quest + Jellyfin Web + WebXR**, while keeping the normal Jellyfin media library, poster wall, metadata, and watch-history experience.

> This project is still under development and testing. Compatibility may vary depending on Jellyfin version, browser, device, and video format.

## Features

* VR180
* VR360
* SBS 3D
* OU / Top-Bottom 3D
* WebXR
* Meta Quest Browser
* Keeps the normal Jellyfin library / poster-wall experience
* No modification to Jellyfin Server core code
* Recommended installation through JavaScript Injector

## Recommended Installation: JavaScript Injector

The recommended way to install this project is through **Jellyfin JavaScript Injector**.

This allows the script to be injected into Jellyfin Web on the server side, so client devices such as Meta Quest do not need Tampermonkey or a separate app.

### 1. Install JavaScript Injector

Open Jellyfin and go to:

```text
Dashboard
→ Plugins
→ Repositories
```

Add the JavaScript Injector repository.

For Jellyfin 10.11:

```text
https://raw.githubusercontent.com/n00bcodr/jellyfin-plugins/main/10.11/manifest.json
```

For Jellyfin 10.10.7:

```text
https://raw.githubusercontent.com/n00bcodr/jellyfin-plugins/main/10.10/manifest.json
```

Then go to:

```text
Dashboard
→ Plugins
→ Catalog
```

Install:

```text
JavaScript Injector
```

Restart Jellyfin after installation.

## 2. Add the VR Script

Download:

```text
jellyfin-vr-player-v2.js
```

Then go to:

```text
Dashboard
→ JS Injector
→ Add Script
```

Recommended script name:

```text
Jellyfin VR Player
```

Paste the full contents of:

```text
jellyfin-vr-player-v2.js
```

into the JavaScript Code field.

Enable:

```text
Enabled
```

and save.

## 3. Use

Refresh Jellyfin Web.

Open:

```text
Library
→ Movie
→ Play
```

If the script loads correctly, VR-related controls should appear in the player.

On Meta Quest, simply use:

```text
Meta Quest Browser
→ Jellyfin Web
→ Movie
→ VR
```

No Tampermonkey or separate Quest application is required when using JavaScript Injector.

## Recommended Architecture

```text
NAS
 ↓
Jellyfin Server
 ↓
JavaScript Injector
 ↓
jellyfin-vr-player-v2.js
 ↓
Jellyfin Web
 ↓
WebXR
 ↓
Meta Quest
```

## Supported Video Types

Main target formats:

```text
VR180
VR360
SBS
OU / Top-Bottom
```

* `SBS`: left-eye and right-eye images arranged side by side
* `OU / TB`: left-eye and right-eye images arranged vertically

For high-resolution VR content, **Direct Play** is strongly recommended whenever possible.

## Updating

Download the latest version of:

```text
jellyfin-vr-player-v2.js
```

Then go to:

```text
Dashboard
→ JS Injector
→ Jellyfin VR Player
```

Replace the old script with the new version and save.

Refresh Jellyfin Web afterward.

## Uninstall

Go to:

```text
Dashboard
→ JS Injector
```

Find:

```text
Jellyfin VR Player
```

Then disable or delete the script.

## Compatibility

| Platform             | Status                    |
| -------------------- | ------------------------- |
| Jellyfin Web         | ✅ Main target             |
| JavaScript Injector  | ✅ Recommended             |
| Chrome               | 🧪 Testing                |
| Edge                 | 🧪 Testing                |
| Meta Quest Browser   | 🧪 Main target            |
| Quest 2              | 🧪 Testing                |
| Quest 3              | 🧪 Testing                |
| Quest 3S             | 🧪 Testing                |
| Jellyfin Android App | ❌ Not currently supported |
| Jellyfin TV App      | ❌ Not currently supported |

## Troubleshooting

### VR button does not appear

Check:

```text
Dashboard
→ JS Injector
```

Make sure:

```text
Jellyfin VR Player
```

exists and is enabled.

Try a hard refresh:

```text
Ctrl + F5
```

or:

```text
Ctrl + Shift + R
```

On Meta Quest Browser, close the Jellyfin page and open it again.

### VR mode does not start

Check:

* WebXR support
* Browser permissions
* HTTPS / secure context requirements
* JavaScript console errors
* Whether the browser supports `immersive-vr`

### Video plays but is not displayed in VR

The normal video element may be playing correctly while the VR renderer failed to start.

Check:

* VR mode
* Projection mode
* Stereo mode
* WebXR availability
* Browser console

## Why This Project Exists

Apps such as SKYBOX and 4XVR are excellent VR players, but when browsing a NAS directly, you often lose the full Jellyfin-style media-library experience.

The goal is to keep this workflow:

**Poster wall → Movie details → Metadata → Play**

while adding VR playback support.

## Credits

Special thanks to **Mix1C** and the original project:

**Jellyfin-360VR-Player**

https://github.com/Mix1C/Jellyfin-360VR-Player

The original project provided important inspiration for extending Jellyfin Web with VR / 360° playback functionality.

This project continues exploring that idea with a focus on:

* VR180
* VR360
* SBS
* OU / Top-Bottom
* WebXR
* Meta Quest
* VR playback controls
* Jellyfin integration

Many thanks to Mix1C for the original exploration and inspiration.

## License

This project is released under the **GNU General Public License**.

See:

```text
LICENSE
```

for the complete license terms.

## Disclaimer

This is an unofficial third-party Jellyfin project.

It is not affiliated with or endorsed by Jellyfin.

## Contributing

Feedback and contributions are welcome:

* Issues
* Bug reports
* Feature requests
* Pull requests

GitHub:

https://github.com/JiaruiGe/jellyfinvr
