import { BasePlugin } from 'appium/plugin';
import type { ExecuteMethodMap, ExternalDriver, NextPluginCallback } from '@appium/types';
import { join } from 'node:path';
import {
    attachDotnetBridge,
    findElementViaDotnetBridge,
    findElementsViaDotnetBridge,
    getPageSourceViaDotnetBridge,
} from './commands.js';

/**
 * The real work of this bridge is a DesktopDriverServer tree-provider plugin
 * (`native/plugin/WincoreDotnetBridge.dll`). This is made discoverable by
 * appending its folder to `DESKTOP_DRIVER_PLUGINS` here, at module load — which
 * happens once when Appium boots an enabled plugin, before any session spawns a
 * server, so the server inherits the variable.
 *
 * `__dirname` at runtime is `build/lib/`, so the payload sits three levels up.
 */
const PLUGIN_NATIVE_DIR = join(__dirname, '..', '..', 'native', 'plugin');
const existing = process.env.DESKTOP_DRIVER_PLUGINS;
process.env.DESKTOP_DRIVER_PLUGINS =
    existing && existing.length > 0 ? `${existing};${PLUGIN_NATIVE_DIR}` : PLUGIN_NATIVE_DIR;

export class DotnetBridgePlugin extends BasePlugin {
    static override executeMethodMap: ExecuteMethodMap<DotnetBridgePlugin> = {
        'windows: attachDotnetBridge': { command: 'attachDotnetBridge', params: {} },
        'windows: findElementViaDotnetBridge': {
            command: 'findElementViaDotnetBridge',
            params: { required: ['using', 'value'], optional: ['contextElementId'] },
        },
        'windows: findElementsViaDotnetBridge': {
            command: 'findElementsViaDotnetBridge',
            params: { required: ['using', 'value'], optional: ['contextElementId'] },
        },
        'windows: getPageSourceViaDotnetBridge': {
            command: 'getPageSourceViaDotnetBridge',
            params: { optional: ['contextElementId'] },
        },
    };

    attachDotnetBridge = attachDotnetBridge;
    findElementViaDotnetBridge = findElementViaDotnetBridge;
    findElementsViaDotnetBridge = findElementsViaDotnetBridge;
    getPageSourceViaDotnetBridge = getPageSourceViaDotnetBridge;

    /**
     * Appium's plugin dispatcher (`AppiumDriver.pluginsToHandleCmd`) only gives a plugin a turn
     * for an HTTP command if the plugin instance defines a method with that command's exact name;
     * for the classic `execute`/`executeScript` endpoint that name is `execute`. `BasePlugin`
     * only auto-implements `executeMethod` (a different name, which checks `executeMethodMap`),
     * never `execute` — so a plugin that only declares `executeMethodMap` is never asked. This
     * override delegates into the inherited `executeMethod`, which does the real lookup and
     * calls `next()` for anything it does not recognise. (Same shim as the sibling
     * appium-wincore-vision-plugin / uia-bridge plugin.)
     */
    async execute(next: NextPluginCallback, driver: ExternalDriver, script: string, args: unknown[]): Promise<unknown> {
        return await this.executeMethod(next, driver, script, args as [Record<string, unknown>]);
    }
}

export default DotnetBridgePlugin;
