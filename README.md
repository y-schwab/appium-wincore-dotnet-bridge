# appium-wincore-dotnet-bridge

In-process **.NET (WinForms / WPF / DevExpress)** UI-tree bridge for
[appium-wincore-driver](https://github.com/verisoft-ai/appium-wincore-driver), as an installable
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
through a **tree provider** (`ITreeProvider`) contributed by this package's DesktopDriverServer
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
provider by appending its `native/plugin/` directory to the `DESKTOP_DRIVER_PLUGINS`
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

Or set the `dotnetBridge: true` + `appTopLevelWindow` capabilities to attach at session start.

## Build from source

```bash
npm install
npm run build:all      # native bridge (needs VS C++/CLI), profiler, x86 stub, plugin DLL, then tsc
```

The native C++/CLI and C++ projects (`dotnet-bridge-agent/`, `dotnet-bridge-profiler/`) need
Visual Studio with the "Desktop development with C++" workload (plus "C++/CLI support" for the
agent). Run from a Developer Command Prompt.

## Contract

The plugin DLL compiles against `WincoreServerSdk` (`ITreeProvider`, `IServerPlugin`). While the
contract is still stabilising this is a relative project reference to a sibling
`appium-wincore-driver` checkout; it moves to a published NuGet package once stable.
