# dsh Plugin Nickname

Custom Chinese nicknames for DeepSeek Harness (dsh) plugins, displayed directly in the native plugin settings page.

## Features

- Automatically replace English package names in the plugin list with custom Chinese nicknames
- Visual edit panel: click the "📝 Nickname" button in the bottom left, or press `Ctrl+Shift+N`
- Automatically scan all installed plugins for direct editing
- Nicknames saved in browser localStorage, permanently effective
- Hover over the nickname to see the original English package name

## Installation

### Method 1: Install from GitHub (Recommended)

Desktop (DSH 0.2.0-rc.2): Open "Plugins → Add Plugin" in the sidebar, paste the address below, and select "Enable Now" after installation. If prompted to restart, follow the instructions.

```
github:sanlisanxun/dsh-plugin-nickname
```

### Method 2: Local Directory Installation

1. Download this project and extract it to a local folder
2. Open dsh → Plugins → Add Plugin
3. Enter the full path to the local folder and click install
4. Refresh the page to take effect

## Usage

After installation:
- Click the "📝 Nickname" button in the bottom left, or press `Ctrl+Shift+N` to open the edit panel
- Edit Chinese names directly in the input box, press Tab to save
- Leave blank to restore the original English package name

## Directory Structure

```
dsh-plugin-nickname/
├── lib/
│   ├── index.js      # Host-side plugin entry
│   └── client.js     # Client-side script (injected into the browser page)
├── cordis.patch.yml  # Cordis mount patch
├── package.json      # Package configuration
├── README.md         # Project documentation
└── LICENSE           # Open source license
```

## Changelog

### v0.1.1
- ✨ Added search box: quickly find plugins when there are many
- ✨ Added export/import: backup your nickname settings
- ✨ Improved interaction: click outside the panel to auto-close

### v0.1.0
- 🎉 First release
- Support custom plugin Chinese nicknames
- Support visual edit panel
- Support shortcut Ctrl+Shift+N to open panel

## Disclaimer

1. This software is for personal learning, research, and technical exchange only, and may not be used for any illegal or commercial purposes.
2. When using this software, please comply with the laws and regulations of your region, and do not use this software to engage in any illegal activities.
3. Any direct or indirect consequences arising from the use of this software shall be borne by the user, and the author shall not be liable.
4. This software is provided "as is" without any express or implied warranty.

## License

MIT License
