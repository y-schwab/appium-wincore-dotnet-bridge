import { errors, W3C_ELEMENT_KEY } from 'appium/driver';
import type { Element, ExternalDriver, NextPluginCallback } from '@appium/types';

/**
 * `driver.sendCommand` is a server-side method of appium-wincore-driver (its
 * stdin/stdout bridge to WincoreServer.exe), not part of the generic
 * `ExternalDriver` type — same cast the sibling appium-wincore-uia-bridge-plugin
 * uses. The `*DotnetBridge` / `injectDotnetBridge` server commands it reaches are
 * contributed by this package's WincoreDotnetBridge.dll tree provider.
 */
type ServerDriver = ExternalDriver & {
    sendCommand(method: string, params: Record<string, unknown>): Promise<unknown>;
};

/** Locator strategies the .NET bridge's reflected tree can be searched by. */
const STRATEGIES = ['id', 'name', 'xpath', 'tag name', 'class name', 'accessibility id'] as const;
export type BridgeStrategy = typeof STRATEGIES[number];

interface PropertyCondition {
    type: 'property';
    property: string;
    value: unknown;
}

function propertyCondition(property: string, value: unknown): PropertyCondition {
    return { type: 'property', property, value };
}

/**
 * Same strategy → UIA-property-condition mapping the driver's own `locateElements`
 * uses (lib/commands/find-via.ts), minus xpath (handled server-side) and
 * `-windows uiautomation` (needs the driver's PSObject converter — not supported
 * against the bridge tree).
 */
function toCondition(using: BridgeStrategy, value: string): PropertyCondition {
    switch (using) {
        case 'id':
            return propertyCondition('RuntimeId', value.split('.').map(Number));
        case 'name':
            return propertyCondition('Name', value);
        case 'class name':
            return propertyCondition('ClassName', value);
        case 'accessibility id':
            return propertyCondition('AutomationId', value);
        case 'tag name':
            // Match the driver: lowercase selector → LocalizedControlType, PascalCase → ControlType.
            return value === value.toLowerCase()
                ? propertyCondition('LocalizedControlType', value)
                : propertyCondition('ControlType', value);
        default:
            throw new errors.InvalidArgumentError(
                `Unsupported locator strategy for the .NET bridge: '${using}'. ` +
                `Supported: ${STRATEGIES.join(', ')}.`,
            );
    }
}

/**
 * `windows: attachDotnetBridge` — inject the bridge into the process owning the
 * session's current root window (the server resolves the PID from the root
 * element's HWND) and connect. Attach only: switch to the target window first.
 */
export async function attachDotnetBridge(
    this: unknown,
    _next: NextPluginCallback,
    driver: ExternalDriver,
): Promise<void> {
    await (driver as ServerDriver).sendCommand('injectDotnetBridge', {});
}

/**
 * `windows: findElementViaDotnetBridge` — search the bridge's own reflected tree
 * directly (bypassing real UIA). The element reference this returns works with
 * every other `windows:` command; those already dispatch on the `dotnet:` /
 * `dotnetcore:` id prefix regardless of how the element was found.
 */
export async function findElementViaDotnetBridge(
    this: unknown,
    _next: NextPluginCallback,
    driver: ExternalDriver,
    using: BridgeStrategy,
    value: string,
    contextElementId?: string,
): Promise<Element> {
    const els = await locate(driver as ServerDriver, using, value, false, contextElementId);
    return els as Element;
}

/** `windows: findElementsViaDotnetBridge` — see {@link findElementViaDotnetBridge}. */
export async function findElementsViaDotnetBridge(
    this: unknown,
    _next: NextPluginCallback,
    driver: ExternalDriver,
    using: BridgeStrategy,
    value: string,
    contextElementId?: string,
): Promise<Element[]> {
    const els = await locate(driver as ServerDriver, using, value, true, contextElementId);
    return els as Element[];
}

/**
 * `windows: getPageSourceViaDotnetBridge` — dump the bridge's reflected tree as
 * XML. Standard `getPageSource()` always reflects real UIA only, even on a
 * bridge-attached window.
 */
export async function getPageSourceViaDotnetBridge(
    this: unknown,
    _next: NextPluginCallback,
    driver: ExternalDriver,
    contextElementId?: string,
): Promise<string> {
    return await (driver as ServerDriver).sendCommand('getPageSourceDotnetBridge', {
        contextElementId: contextElementId ?? null,
    }) as string;
}

async function locate(
    driver: ServerDriver,
    using: BridgeStrategy,
    value: string,
    multiple: boolean,
    contextElementId: string | undefined,
): Promise<Element | Element[]> {
    if (using === 'xpath') {
        const result = await driver.sendCommand('evaluateXPathDotnetBridge', {
            expression: value,
            multiple,
            contextElementId: contextElementId ?? null,
        });
        if (multiple) {
            return ((result as string[] | null) ?? []).map((id) => ({ [W3C_ELEMENT_KEY]: id }));
        }
        if (!result) {
            throw new errors.NoSuchElementError();
        }
        return { [W3C_ELEMENT_KEY]: result as string };
    }

    const params = {
        scope: 'descendants',
        condition: toCondition(using, value),
        contextElementId: contextElementId ?? null,
    };

    if (multiple) {
        const ids = await driver.sendCommand('findElementsDotnetBridge', params) as string[] | null;
        return (ids ?? []).map((id) => ({ [W3C_ELEMENT_KEY]: id }));
    }

    const id = await driver.sendCommand('findElementDotnetBridge', params) as string | null;
    if (!id) {
        throw new errors.NoSuchElementError();
    }
    return { [W3C_ELEMENT_KEY]: id };
}
