param([switch]$Install, [string]$Serial)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$app = Join-Path $root 'artifacts/card-game'
$tools = Join-Path $root '.tools/android-build'
$env:JAVA_HOME = (Get-ChildItem "$tools/java" -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME = Join-Path $tools 'sdk'
$env:GRADLE_USER_HOME = Join-Path $tools 'gradle-cache'
$node = Join-Path $tools 'node.exe'
$adb = Join-Path $env:ANDROID_HOME 'platform-tools/adb.exe'
$previousUsbMode = $env:DONKEY_USB_DEBUG
$env:DONKEY_USB_DEBUG = '1'

function Check-Exit {
    if ($LASTEXITCODE -ne 0) { throw "Build command failed with exit code $LASTEXITCODE" }
}

Push-Location $app
try {
    & $node 'node_modules/vite/bin/vite.js' build --mode android
    Check-Exit
    & $node 'node_modules/@capacitor/cli/bin/capacitor' sync android
    Check-Exit
    Push-Location android
    try {
        & ./gradlew.bat --no-daemon assembleDebug
        Check-Exit
    } finally { Pop-Location }

    $apk = Join-Path $app 'android/app/build/outputs/apk/debug/app-debug.apk'
    Write-Output "APK ready: $apk"
    if ($Install) {
        $deviceArgs = @()
        if ($Serial) { $deviceArgs = @('-s', $Serial) }
        # Expose only the laptop game server to this USB-connected device.
        & $adb @deviceArgs reverse tcp:3001 tcp:3001
        Check-Exit
        & $adb @deviceArgs install -r $apk
        Check-Exit
    }
} finally {
    $env:DONKEY_USB_DEBUG = $previousUsbMode
    Pop-Location
}
