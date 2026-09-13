# appium-wincore-dotnet-bridge

In-process **.NET (WinForms / WPF / DevExpress)** UI-tree bridge for
[appium-wincore-driver](https://github.com/y-schwab/appium-wincore-driver), as an installable
Appium plugin.

## The problem

Custom-drawn .NET control libraries — DevExpress `XtraGrid`, owner-drawn `ListView`s, WPF
templated columns — expose only a generic `"<Column> row <N>"` placeholder to out-of-process UI
Automation. The real cell values, bound or unbound, are simply not reachable through UIA, the
Value pattern, or `HelpText`.

## The fix

A bridge DLL is injected into the target .NET process (Win32 `LoadLibrary`/`CreateRemoteThread`
for .NET Framework; CoreCLR diagnostics-IPC profiler attach for .NET 5+) and reflects the live
WinForms/WPF control tree over a loopback-TCP JSON protocol. The driver's server reaches it
through a **tree provider** (`ITreeProvider`) contributed by this package's WincoreServer
plugin (`native/plugin/WincoreDotnetBridge.dll`).

Unlike the Java bridge, the reflected tree is **never auto-merged** into the real UIA tree —
standard `findElement` / `getPageSource` stay pure UIA even on a bridge-attached window. The
bridge tree is opt-in, reached through the dedicated `windows: *ViaDotnetBridge` commands.

## Install

```bash
appium plugin install --source=npm appium-wincore-dotnet-bridge
appium --use-plugins=wincore-dotnet-bridge
```

Requires Appium 3 and `appium-wincore-driver`. The plugin registers its server-side tree
provider by appending its `native/plugin/` directory to the `WINCORE_SERVER_PLUGINS`
environment variable at load, before any session starts.

## Usage

```js
// Attach the bridge to the current window's process (needs appTopLevelWindow, attach-only).
await driver.executeScript('windows: attachDotnetBridge', []);

// Standard find still sees only real UIA:
await driver.getPageSource();                       // no grid values

// Reach the reflected content explicitly:
const el = await driver.executeScript('windows: findElementViaDotnetBridge',
    [{ using: 'xpath', value: '//*[@Name="Status"]' }]);
```

| Command | Params | Description |
|---|---|---|
| `windows: attachDotnetBridge` | none | Inject the bridge into the current window's process |
| `windows: findElementViaDotnetBridge` | `using`, `value`, `contextElementId?` | Find one element in the reflected tree |
| `windows: findElementsViaDotnetBridge` | `using`, `value`, `contextElementId?` | Find all |
| `windows: getPageSourceViaDotnetBridge` | `contextElementId?` | Dump the reflected tree as XML |

Attach is a command, not a capability — start the session on the target window
(`appTopLevelWindow` capability, or `switchToWindow` first), then call
`windows: attachDotnetBridge`.

Note: WebdriverIO's `executeScript` transport does not re-throw a `no such element`
response from `findElementViaDotnetBridge` — it resolves with the error body
(`{ error: 'no such element', message, stacktrace }`). Check for that shape, or catch
the error, when calling it via `executeScript`. The returned element reference works with
every other `windows:` command exactly like an element from standard find; wrap it with
`driver.$()` to use WebdriverIO's chainable API (`.getText()`, `.click()`, ...).

### How it works

Unlike the Java bridge, .NET has no cooperative attach API — this is real Win32 injection
(`LoadLibraryW` + `CreateRemoteThread`), not a JVM-sanctioned mechanism. The bridge DLL (built
from a C++/CLI mixed-mode assembly, so it has a real native entry point `CreateRemoteThread`
can target, but runs managed reflection code once loaded) starts a loopback TCP server inside
the target process and serves element queries from the driver's server. Every command — reads
(`getInfo`/`getChildren`/`getWindowRoot`) and mutating commands
(`invoke`/`select`/`expand`/`setValue`/`requestFocus`) alike — is marshaled onto the target's
real UI thread before touching WinForms state, or onto the WPF Dispatcher thread before
touching a `DependencyObject`; WPF enforces this more strictly than WinForms, throwing rather
than silently misbehaving if violated.

Bitness is detected automatically: 64-bit targets are injected directly, 32-bit (WOW64)
targets go through a separate 32-bit stub process, since a 64-bit host cannot
`CreateRemoteThread` across bitness. There is no launch-time injection path — the target
process must already be running before the bridge can attach.

### Supported controls

- Generic ownerdraw controls (ListBox, TreeView, ComboBox, ContextMenu, custom-painted
  controls with blanked `AccessibleName`)
- DevExpress WinForms: `XtraGrid` (including grouped grids), `XtraTreeList`, `ComboBoxEdit`,
  `TokenEdit`
- Plain WPF elements — reads (getPageSource/getInfo/getChildren/getValue) and mutating
  commands (invoke, select, expand, setValue, requestFocus) both work against arbitrary
  `DependencyObject`/`FrameworkElement` targets, correctly marshaled onto the WPF Dispatcher
  thread. This includes owner-drawn WPF cells/elements (e.g. a `DataGridTemplateColumn` whose
  cell content paints itself via `OnRender` and returns a suppressed `AutomationPeer`) —
  genuinely UIA-blind, the WPF analog of WinForms custom-draw, but read by the bridge's
  generic visual-tree walk with **no dedicated reflection code**, since a WPF `DataTemplate`
  always renders through a real `FrameworkElement` with gettable properties (unlike WinForms
  owner-draw, which paints raw GDI pixels with no backing element at all)
- DevExpress WPF (`Xpf.*`) controls — probed against `DevExpress.Xpf.Grid.GridControl`
  specifically: bound and unbound columns are already fully readable via plain UIA (no bridge
  needed for those), and `CellTemplate`-rendered cells are covered by the same generic
  mechanism above — no dedicated `Xpf.Grid` reflection exists or is needed
- Invoke on WPF `ButtonBase`-derived controls (`Button`, `RepeatButton`, `ToggleButton`, ...)
  uses the protected `OnClick` method (the WPF equivalent of WinForms' `PerformClick`), so no
  XAML/AutomationPeer wiring is required on the target app's side

### Limitations

- **.NET Framework only** — targets hosting CoreCLR (.NET 5+ / .NET Core, detected via
  `coreclr.dll`) are rejected. Only classic `clr.dll`-hosted processes are supported.
- **x64 and x86 (WOW64) targets only** — both are supported via automatic bitness detection.

## Build from source

```bash
npm install
npm run build:all      # native bridge (needs VS C++/CLI), profiler, x86 stub, plugin DLL, then tsc
```

The native C++/CLI and C++ projects (`dotnet-bridge-agent/`, `dotnet-bridge-profiler/`) need
Visual Studio with the "Desktop development with C++" workload (plus "C++/CLI support" for the
agent). Run from a Developer Command Prompt.

## Contract

The plugin DLL compiles against [`WincoreServerSdk`](https://www.nuget.org/packages/WincoreServerSdk)
(`ITreeProvider`, `IServerPlugin`) via a `PackageReference`. `PluginLoader` refuses to load a
plugin whose declared SDK major version doesn't match the host's — see the driver's
[server plugin architecture](https://github.com/y-schwab/appium-wincore-driver#readme) docs.
