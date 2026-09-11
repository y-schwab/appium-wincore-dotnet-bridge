import { execSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { Browser } from 'webdriverio';
import { remote } from 'webdriverio';

export const APPIUM_SERVER = {
    hostname: '127.0.0.1',
    port: 4723,
    path: '/',
};

/**
 * Fixture apps live in the sibling appium-wincore-test-apps repo, not in this repo — override
 * via env var for CI or a different checkout layout.
 */
export const TEST_APPS_DIR = process.env.TEST_APPS_DIR ?? resolve(process.cwd(), '..', 'appium-wincore-test-apps');

export const NOTEPAD_APP_PATH = 'C:\\Windows\\notepad.exe';

type Caps = WebdriverIO.Capabilities;

export const WINFORMS_LARGE_APP_PATH = resolve(
    TEST_APPS_DIR, 'winforms-large', 'bin', 'x64', 'Debug', 'net472', 'WinformsLarge.exe',
);

/**
 * Launches winforms-large as an external process (for the .NET bridge perf suite, which
 * must attach via appTopLevelWindow). Caller kills the process in afterAll.
 */
export async function launchWinformsLargeExternally(nodeCount = 1500): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(WINFORMS_LARGE_APP_PATH, ['--nodes', String(nodeCount)], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn winforms-large app: ${WINFORMS_LARGE_APP_PATH}`);
    }

    const pid = proc.pid;
    // Generous: the fixture builds thousands of controls before the window shows.
    const deadline = Date.now() + 45_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`winforms-large app window did not appear within 45s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const DEVEXPRESS_GRID_APP_PATH = resolve(
    TEST_APPS_DIR, 'devexpress-grid-ownerdraw', 'bin', 'DevExpressGridOwnerDraw.exe'
);
export const DEVEXPRESS_GRID_WINDOW_TITLE = 'DevExpress Grid OwnerDraw Fixture';

/**
 * Launches the bespoke DevExpress WinForms grid test app as an external process (simulating a
 * customer's app the driver has no launch control over). Returns the child process and its main
 * window handle (decimal HWND string) for the fixture's actual window — not the "About
 * DevExpress" trial-evaluation dialog every launch pops first (this fixture has no registered
 * WinForms-tier license, only the WPF-tier trial key set up earlier in this project — see
 * feedback_devexpress_licensing memory). The caller is responsible for killing the process in
 * afterAll.
 */
export async function launchDevExpressGridExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(DEVEXPRESS_GRID_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn DevExpress grid app: ${DEVEXPRESS_GRID_APP_PATH}`);
    }

    const pid = proc.pid;

    async function pollMainWindow(): Promise<{ hwnd: string; title: string }> {
        const out = execSync(
            `powershell -Command "$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; ` +
            `if ($p -and $p.MainWindowHandle -ne 0) { Write-Output $p.MainWindowHandle; Write-Output $p.MainWindowTitle } else { Write-Output '0' }"`,
            { stdio: ['ignore', 'pipe', 'ignore'] }
        ).toString().trim().split(/\r?\n/);
        return { hwnd: out[0] ?? '0', title: out[1] ?? '' };
    }

    // First window to appear is the "About DevExpress" trial nag — dismiss it with Escape so the
    // fixture's real window can come up. SendKeys targets the foreground window, which is this
    // freshly-launched dialog.
    let dismissed = false;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        const { hwnd: currentHwnd, title } = await pollMainWindow();
        if (currentHwnd !== '0' && title === DEVEXPRESS_GRID_WINDOW_TITLE) {
            hwnd = currentHwnd;
            break;
        }
        if (currentHwnd !== '0' && !dismissed) {
            execSync(
                'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'{ESC}\')"',
                { stdio: 'ignore' }
            );
            dismissed = true;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`DevExpress grid app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const MINIMAL_OWNERDRAW_APP_PATH = resolve(
    TEST_APPS_DIR, 'minimal-ownerdraw-winforms', 'bin', 'x64', 'Debug', 'net472', 'MinimalOwnerDraw.exe'
);
export const MINIMAL_OWNERDRAW_WINDOW_TITLE = 'Minimal OwnerDraw Fixture';

/**
 * Launches the minimal owner-draw WinForms fixture externally (simulating a customer's app the
 * driver has no launch control over). No DevExpress dependency, no trial dialog to dismiss —
 * a single Control subclass that paints its own text and blanks AccessibleName, so plain UIA
 * can't see the value at all. The caller is responsible for killing the process in afterAll.
 */
export async function launchMinimalOwnerDrawExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(MINIMAL_OWNERDRAW_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn minimal owner-draw app: ${MINIMAL_OWNERDRAW_APP_PATH}`);
    }

    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`Minimal owner-draw app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const MINIMAL_OWNERDRAW_X86_APP_PATH = resolve(
    TEST_APPS_DIR, 'minimal-ownerdraw-x86', 'bin', 'x86', 'Debug', 'net472', 'MinimalOwnerDrawX86.exe'
);

/**
 * Launches the 32-bit twin of the minimal owner-draw fixture (see
 * launchMinimalOwnerDrawExternally) — same pattern, but built PlatformTarget=x86 so it's a
 * genuine WOW64 process. Exists solely to exercise the bridge's x86 injection path
 * (BridgeInjectorX86Stub) end to end: a 64-bit host can't CreateRemoteThread into this process
 * directly, so attachDotnetBridge here only works if bitness detection + the x86 stub dispatch
 * are both wired correctly. The caller is responsible for killing the process in afterAll.
 */
export async function launchMinimalOwnerDrawX86Externally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(MINIMAL_OWNERDRAW_X86_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn 32-bit minimal owner-draw app: ${MINIMAL_OWNERDRAW_X86_APP_PATH}`);
    }

    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`32-bit minimal owner-draw app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

/**
 * Confirms a process is genuinely 32-bit (running under WOW64) — a sanity check so the 32-bit
 * bridge e2e test can't silently pass against an accidentally-64-bit build of the fixture.
 */
export function isProcess32Bit(pid: number): boolean {
    const out = execSync(
        `powershell -Command "` +
        `Add-Type -Namespace W -Name K -MemberDefinition '[DllImport(\\"kernel32.dll\\")] public static extern bool IsWow64Process(IntPtr h, out bool w);'; ` +
        `$p = Get-Process -Id ${pid}; $w = $false; [W.K]::IsWow64Process($p.Handle, [ref]$w) | Out-Null; Write-Output $w` +
        `"`,
        { stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim();
    return out === 'True';
}

export const OWNERDRAW_GALLERY_APP_PATH = resolve(
    TEST_APPS_DIR, 'ownerdraw-gallery', 'bin', 'x64', 'Debug', 'net472', 'OwnerDrawGallery.exe'
);

/**
 * Launches the ownerdraw-gallery fixture externally (simulating a customer's app the driver has
 * no launch control over). No third-party dependency, no trial dialog to dismiss. See
 * appium-wincore-test-apps/ownerdraw-gallery/Program.cs for the 5 element kinds it hosts.
 */
export async function launchOwnerDrawGalleryExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(OWNERDRAW_GALLERY_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn ownerdraw-gallery app: ${OWNERDRAW_GALLERY_APP_PATH}`);
    }

    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`ownerdraw-gallery app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const WPF_MINIMAL_APP_PATH = resolve(TEST_APPS_DIR, 'wpf-minimal', 'bin', 'WpfMinimal.exe');

/**
 * Launches the wpf-minimal fixture externally (no DevExpress dependency, no trial dialog).
 * See appium-wincore-test-apps/wpf-minimal/Program.cs — a TextBox, Button, and an owner-drawn list following the
 * bridge's generic list convention, used to validate the WPF Dispatcher-marshaling fix.
 */
export async function launchWpfMinimalExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(WPF_MINIMAL_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn wpf-minimal app: ${WPF_MINIMAL_APP_PATH}`);
    }

    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`wpf-minimal app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const NET8_WINFORMS_MINIMAL_APP_PATH = resolve(
    TEST_APPS_DIR, 'net8-winforms-minimal', 'bin', 'Debug', 'net8.0-windows', 'Net8WinformsMinimal.exe'
);

/**
 * Launches the net8-winforms-minimal fixture externally — CoreCLR (.NET 8) twin of
 * wpf-minimal/winform-combo, exercising BridgeInjector's CoreCLR attach path (profiler attach via
 * CoreClrAttacher) instead of Win32 injection. See dotnet-bridge-agent/CORECLR-BRIDGE-SPEC.md.
 */
export async function launchNet8WinformsMinimalExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(NET8_WINFORMS_MINIMAL_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn net8-winforms-minimal app: ${NET8_WINFORMS_MINIMAL_APP_PATH}`);
    }

    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`net8-winforms-minimal app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const NET8_WPF_MINIMAL_APP_PATH = resolve(
    TEST_APPS_DIR, 'net8-wpf-minimal', 'bin', 'Debug', 'net8.0-windows', 'Net8WpfMinimal.exe'
);

/**
 * Launches the net8-wpf-minimal fixture externally — CoreCLR (.NET 8) WPF twin of
 * net8-winforms-minimal, used to prove/fix the profiler's anchor-discovery gap: unlike the
 * WinForms fixture, this process never loads System.Windows.Forms.dll, so
 * ProfilerCallback.cpp's WndProc-only kAnchorCandidates list can never find an anchor here. See
 * dotnet-bridge-agent/CORECLR-BRIDGE-SPEC.md.
 */
export async function launchNet8WpfMinimalExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(NET8_WPF_MINIMAL_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn net8-wpf-minimal app: ${NET8_WPF_MINIMAL_APP_PATH}`);
    }

    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`net8-wpf-minimal app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const NET8_WINFORMS_MINIMAL_X86_APP_PATH = resolve(
    TEST_APPS_DIR, 'net8-winforms-minimal', 'bin', 'Debug', 'net8.0-windows', 'win-x86', 'Net8WinformsMinimal.exe'
);

/**
 * 32-bit twin of launchNet8WinformsMinimalExternally — same fixture source, published with
 * `-r win-x86`, genuinely loading a 32-bit CoreCLR (confirmed via IsWow64Process). Exercises
 * BridgeInjector.InjectFromPidAutoBitness's CoreCLR branch picking the x86 profiler DLL and
 * CoreClrAttacher picking the x86-published bridge-core.dll.
 *
 * Requires an x86 .NET 8 Desktop Runtime installed (`winget install
 * Microsoft.DotNet.DesktopRuntime.8.x86`) — a 32-bit CoreCLR process needs its own
 * architecture-specific runtime, separate from the machine's normal x64 .NET install.
 */
export async function launchNet8WinformsMinimalX86Externally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(NET8_WINFORMS_MINIMAL_X86_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn net8-winforms-minimal (x86) app: ${NET8_WINFORMS_MINIMAL_X86_APP_PATH}`);
    }

    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`net8-winforms-minimal (x86) app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const WPF_DATAGRID_TEMPLATE_APP_PATH = resolve(
    TEST_APPS_DIR, 'wpf-datagrid-template', 'bin', 'WpfDataGridTemplate.exe'
);

/**
 * Launches the wpf-datagrid-template fixture externally (no DevExpress dependency). See
 * appium-wincore-test-apps/wpf-datagrid-template/Program.cs — a plain WPF DataGrid with two bound text columns
 * and one DataGridTemplateColumn whose cell content is owner-drawn (OnRender + null
 * AutomationPeer), genuinely invisible to plain UIA.
 */
export async function launchWpfDataGridTemplateExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(WPF_DATAGRID_TEMPLATE_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn wpf-datagrid-template app: ${WPF_DATAGRID_TEMPLATE_APP_PATH}`);
    }

    const pid = proc.pid;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        try {
            hwnd = execSync(
                `powershell -Command "(Get-Process -Id ${pid} -ErrorAction Stop).MainWindowHandle"`,
                { stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();
        } catch {
            hwnd = '0';
        }
        if (hwnd !== '0') {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`wpf-datagrid-template app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const DEVEXPRESS_ELEMENTS_GALLERY_APP_PATH = resolve(
    TEST_APPS_DIR, 'devexpress-elements-gallery', 'bin', 'DevExpressElementsGallery.exe'
);
export const DEVEXPRESS_ELEMENTS_GALLERY_WINDOW_TITLE = 'DevExpress Elements Gallery';

/**
 * Launches the DevExpress-specific elements fixture externally (simulating a customer's app the
 * driver has no launch control over). Same trial-nag tolerance as launchDevExpressGridExternally
 * — an "About DevExpress" dialog pops inconsistently depending on build-cache state, so this polls
 * for the real window's title rather than assuming a dialog will or won't appear. See
 * appium-wincore-test-apps/devexpress-elements-gallery/Program.cs for the 4 element kinds it hosts (TreeList,
 * ComboBoxEdit, TokenEdit, grouped GridControl) — each confirmed genuinely UIA-blind via a
 * throwaway probe before this fixture was written.
 */
export async function launchDevExpressElementsGalleryExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(DEVEXPRESS_ELEMENTS_GALLERY_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn devexpress-elements-gallery app: ${DEVEXPRESS_ELEMENTS_GALLERY_APP_PATH}`);
    }

    const pid = proc.pid;

    async function pollMainWindow(): Promise<{ hwnd: string; title: string }> {
        const out = execSync(
            `powershell -Command "$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; ` +
            `if ($p -and $p.MainWindowHandle -ne 0) { Write-Output $p.MainWindowHandle; Write-Output $p.MainWindowTitle } else { Write-Output '0' }"`,
            { stdio: ['ignore', 'pipe', 'ignore'] }
        ).toString().trim().split(/\r?\n/);
        return { hwnd: out[0] ?? '0', title: out[1] ?? '' };
    }

    let dismissed = false;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        const { hwnd: currentHwnd, title } = await pollMainWindow();
        if (currentHwnd !== '0' && title === DEVEXPRESS_ELEMENTS_GALLERY_WINDOW_TITLE) {
            hwnd = currentHwnd;
            break;
        }
        if (currentHwnd !== '0' && !dismissed) {
            execSync(
                'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'{ESC}\')"',
                { stdio: 'ignore' }
            );
            dismissed = true;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`devexpress-elements-gallery app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export const WPF_DEVEXPRESS_LIGHTWEIGHT_APP_PATH = resolve(
    TEST_APPS_DIR, 'wpf-devexpress-lightweight', 'bin', 'WpfDevExpressLightweight.exe'
);
export const WPF_DEVEXPRESS_LIGHTWEIGHT_WINDOW_TITLE = 'WPF DevExpress Lightweight Cell Fixture';

/**
 * Launches the wpf-devexpress-lightweight fixture externally — CoreCLR (.NET 8) WPF,
 * DevExpress.Xpf.Grid GridControl with 5000 rows and explicit (non-auto-generated) columns, large
 * enough that TableView renders unfocused/off-screen cells via
 * DevExpress.Xpf.Grid.LightweightCellEditor instead of a full editor. Reproduces a real customer
 * report: LightweightCellEditor exposed none of Reflector.TryAddDevExpressProps's existing
 * Text/EditValue/DisplayText candidates, so cells came back Name="" Value="" in the page source.
 * This build's DX1000 evaluation warning means an "About DevExpress" trial nag pops before the
 * real window — same tolerance as launchDevExpressGridExternally, title-matched and ESC-dismissed
 * rather than assumed away.
 */
export async function launchWpfDevExpressLightweightExternally(): Promise<{ proc: ChildProcess; hwnd: string }> {
    const proc = spawn(WPF_DEVEXPRESS_LIGHTWEIGHT_APP_PATH, [], { detached: true, stdio: 'ignore' });

    if (!proc.pid) {
        throw new Error(`Failed to spawn wpf-devexpress-lightweight app: ${WPF_DEVEXPRESS_LIGHTWEIGHT_APP_PATH}`);
    }

    const pid = proc.pid;

    async function pollMainWindow(): Promise<{ hwnd: string; title: string }> {
        const out = execSync(
            `powershell -Command "$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; ` +
            `if ($p -and $p.MainWindowHandle -ne 0) { Write-Output $p.MainWindowHandle; Write-Output $p.MainWindowTitle } else { Write-Output '0' }"`,
            { stdio: ['ignore', 'pipe', 'ignore'] }
        ).toString().trim().split(/\r?\n/);
        return { hwnd: out[0] ?? '0', title: out[1] ?? '' };
    }

    let dismissed = false;
    const deadline = Date.now() + 15_000;
    let hwnd = '0';
    while (Date.now() < deadline) {
        const { hwnd: currentHwnd, title } = await pollMainWindow();
        if (currentHwnd !== '0' && title === WPF_DEVEXPRESS_LIGHTWEIGHT_WINDOW_TITLE) {
            hwnd = currentHwnd;
            break;
        }
        if (currentHwnd !== '0' && !dismissed) {
            execSync(
                'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'{ESC}\')"',
                { stdio: 'ignore' }
            );
            dismissed = true;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (hwnd === '0') {
        proc.kill();
        throw new Error(`wpf-devexpress-lightweight app window did not appear within 15s (pid=${pid})`);
    }

    return { proc, hwnd };
}

export async function createDotnetBridgeAttachSession(hwnd: string, extraCaps?: Record<string, unknown>): Promise<Browser> {
    const driver = await remote({
        ...APPIUM_SERVER,
        capabilities: {
            platformName: 'Windows',
            'appium:automationName': 'Wincore',
            'appium:appTopLevelWindow': hwnd,
            'appium:shouldCloseApp': false,
            ...extraCaps,
        } as Caps,
    });
    // Attach is a plugin command, not a capability — the session root is already the
    // target window (appTopLevelWindow), so no explicit switch is needed first.
    await driver.executeScript('windows: attachDotnetBridge', []);
    await driver.setTimeout({ implicit: 3000 });
    return driver;
}

export async function quitSession(driver: Browser | null): Promise<void> {
    try {
        await driver?.deleteSession();
    } catch {
        // noop — session may already be terminated
    }
}
