import { BasePlugin } from 'appium/plugin';
import { join } from 'node:path';

/**
 * The real work of this bridge is a DesktopDriverServer tree-provider plugin
 * (`native/plugin/WincoreDotnetBridge.dll`). This npm package's only job on the
 * Node side is to make the driver's server load it: appended to
 * `DESKTOP_DRIVER_PLUGINS` here, at module load — which happens once when Appium
 * boots an enabled plugin, before any session spawns a server, so the server
 * inherits the variable.
 *
 * `__dirname` at runtime is `build/lib/`, so the payload sits three levels up.
 */
const PLUGIN_NATIVE_DIR = join(__dirname, '..', '..', 'native', 'plugin');

const existing = process.env.DESKTOP_DRIVER_PLUGINS;
process.env.DESKTOP_DRIVER_PLUGINS =
    existing && existing.length > 0 ? `${existing};${PLUGIN_NATIVE_DIR}` : PLUGIN_NATIVE_DIR;

/**
 * No client-facing command surface of its own: once the server plugin is loaded,
 * the driver's existing `windows: attachDotnetBridge` / `windows: *ViaDotnetBridge`
 * commands and the `dotnetBridge` capability reach it over the normal WebDriver
 * protocol. The class exists so Appium has something to activate for
 * `--use-plugins=wincore-dotnet-bridge`.
 */
export class DotnetBridgePlugin extends BasePlugin {}

export default DotnetBridgePlugin;
