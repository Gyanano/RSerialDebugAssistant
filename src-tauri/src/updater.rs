//! Update checker module for fetching releases from GitHub

use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Emitter};

const GITHUB_API_URL: &str = "https://api.github.com/repos/Gyanano/RSerialDebugAssistant/releases/latest";
const USER_AGENT: &str = "RSerialDebugAssistant";

/// GitHub Release asset
#[derive(Debug, Deserialize)]
pub struct GitHubAsset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
}

/// GitHub Release response
#[derive(Debug, Deserialize)]
pub struct GitHubRelease {
    pub tag_name: String,
    #[allow(dead_code)]
    pub name: Option<String>,
    pub html_url: String,
    pub assets: Vec<GitHubAsset>,
}

/// Update check result returned to frontend
#[derive(Debug, Serialize, Clone)]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub download_url: Option<String>,
    pub download_size: Option<u64>,
    pub release_url: String,
    pub asset_name: Option<String>,
}

/// Download progress event
#[derive(Debug, Serialize, Clone)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percentage: u8,
}

fn strip_version_prefix(version: &str) -> &str {
    version.trim().trim_start_matches(['v', 'V'])
}

/// Parse version string (e.g., "v1.2.0", "V1.2.0", or "1.2.0") into (major, minor, patch)
fn parse_version(version: &str) -> Option<(u32, u32, u32)> {
    let v = strip_version_prefix(version);
    let parts: Vec<&str> = v.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let major = parts[0].parse().ok()?;
    let minor = parts[1].parse().ok()?;
    let patch = parts[2].parse().ok()?;
    Some((major, minor, patch))
}

/// Compare two version strings
/// Returns Ordering::Greater if version_a > version_b
fn compare_versions(version_a: &str, version_b: &str) -> Option<Ordering> {
    let a = parse_version(version_a)?;
    let b = parse_version(version_b)?;
    Some(a.cmp(&b))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TargetPlatform {
    Windows,
    Macos,
    Linux,
}

fn current_platform() -> TargetPlatform {
    if cfg!(target_os = "windows") {
        TargetPlatform::Windows
    } else if cfg!(target_os = "macos") {
        TargetPlatform::Macos
    } else {
        TargetPlatform::Linux
    }
}

fn is_arm_macos_asset(name: &str) -> bool {
    name.contains("aarch64") || name.contains("arm64") || name.contains("apple-silicon")
}

fn is_intel_macos_asset(name: &str) -> bool {
    name.contains("x64") || name.contains("x86_64") || name.contains("intel")
}

/// Pick the installer that matches the running OS (and Mac CPU when possible).
fn find_platform_asset(assets: &[GitHubAsset], platform: TargetPlatform) -> Option<&GitHubAsset> {
    match platform {
        TargetPlatform::Windows => assets
            .iter()
            .find(|asset| {
                let name = asset.name.to_lowercase();
                name.ends_with(".exe") && !name.ends_with(".msi")
            })
            .or_else(|| {
                assets
                    .iter()
                    .find(|asset| asset.name.to_lowercase().ends_with(".msi"))
            }),
        TargetPlatform::Macos => {
            let dmgs: Vec<&GitHubAsset> = assets
                .iter()
                .filter(|asset| asset.name.to_lowercase().ends_with(".dmg"))
                .collect();
            if dmgs.is_empty() {
                return assets.iter().find(|asset| {
                    let name = asset.name.to_lowercase();
                    name.ends_with(".app.tar.gz") || name.ends_with(".app")
                });
            }

            let prefer_arm = cfg!(target_arch = "aarch64");
            if prefer_arm {
                dmgs.iter()
                    .copied()
                    .find(|asset| is_arm_macos_asset(&asset.name.to_lowercase()))
                    .or_else(|| {
                        dmgs.iter()
                            .copied()
                            .find(|asset| !is_intel_macos_asset(&asset.name.to_lowercase()))
                    })
                    .or_else(|| dmgs.first().copied())
            } else {
                dmgs.iter()
                    .copied()
                    .find(|asset| is_intel_macos_asset(&asset.name.to_lowercase()))
                    .or_else(|| {
                        dmgs.iter()
                            .copied()
                            .find(|asset| !is_arm_macos_asset(&asset.name.to_lowercase()))
                    })
                    .or_else(|| dmgs.first().copied())
            }
        }
        TargetPlatform::Linux => assets
            .iter()
            .find(|asset| asset.name.to_lowercase().ends_with(".appimage"))
            .or_else(|| {
                assets
                    .iter()
                    .find(|asset| asset.name.to_lowercase().ends_with(".deb"))
            }),
    }
}

/// Check for updates by fetching the latest release from GitHub
pub async fn check_for_updates(current_version: &str) -> Result<UpdateCheckResult, String> {
    let client = Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(GITHUB_API_URL)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !response.status().is_success() {
        if response.status().as_u16() == 404 {
            return Err("No releases available".to_string());
        }
        return Err(format!("GitHub API error: {}", response.status()));
    }

    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse release data: {}", e))?;

    let latest_version = strip_version_prefix(&release.tag_name).to_string();
    let current = strip_version_prefix(current_version);

    let has_update = match compare_versions(&latest_version, current) {
        Some(Ordering::Greater) => true,
        _ => false,
    };

    let asset = find_platform_asset(&release.assets, current_platform());

    Ok(UpdateCheckResult {
        has_update,
        current_version: current.to_string(),
        latest_version: latest_version.clone(),
        download_url: asset.map(|a| a.browser_download_url.clone()),
        download_size: asset.map(|a| a.size),
        release_url: release.html_url,
        asset_name: asset.map(|a| a.name.clone()),
    })
}

/// Download update to temp directory with progress reporting
pub async fn download_update(
    app_handle: &AppHandle,
    download_url: &str,
    asset_name: &str,
) -> Result<PathBuf, String> {
    let client = Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed: HTTP {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);

    // Create temp directory path
    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join(asset_name);

    let mut file = File::create(&file_path)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut last_emitted_percentage: u8 = 0;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write to file: {}", e))?;

        downloaded += chunk.len() as u64;

        let percentage = if total_size > 0 {
            ((downloaded as f64 / total_size as f64) * 100.0) as u8
        } else {
            0
        };

        // Emit progress event every 1%
        if percentage > last_emitted_percentage {
            last_emitted_percentage = percentage;
            let _ = app_handle.emit("update-download-progress", DownloadProgress {
                downloaded,
                total: total_size,
                percentage,
            });
        }
    }

    // Emit 100% completion
    let _ = app_handle.emit("update-download-progress", DownloadProgress {
        downloaded,
        total: total_size,
        percentage: 100,
    });

    Ok(file_path)
}

/// Launch the installer and exit the application.
///
/// macOS: when running from a real `.app` bundle, do an in-place update —
/// mount the dmg, hand a trampoline script the bundle swap, and exit. The
/// trampoline waits for this process to die, swaps bundles atomically
/// (stage → mv old aside → mv new in → relaunch), and falls back to opening
/// the dmg (the old manual drag flow) if anything fails. No Finder replace
/// prompt is ever shown.
pub fn launch_installer_and_exit(installer_path: &str) -> Result<(), String> {
    launch_inner(installer_path)
}

#[cfg(target_os = "macos")]
fn launch_inner(installer_path: &str) -> Result<(), String> {
    match prepare_inplace_script(std::path::Path::new(installer_path)) {
        Ok(script) => {
            let spawn_result = Command::new("/bin/sh")
                .arg(&script)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn();
            if let Err(e) = spawn_result {
                log::warn!("Failed to spawn update trampoline ({}); opening dmg instead", e);
                let _ = Command::new("open").arg(installer_path).spawn();
            }
        }
        Err(e) => {
            log::warn!("In-place update unavailable ({}); opening dmg instead", e);
            let _ = Command::new("open").arg(installer_path).spawn();
        }
    }
    std::process::exit(0);
}

#[cfg(not(target_os = "macos"))]
fn launch_inner(installer_path: &str) -> Result<(), String> {
    let mut command = if cfg!(target_os = "linux") && !installer_path.to_lowercase().ends_with(".appimage") {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(installer_path);
        cmd
    } else {
        Command::new(installer_path)
    };

    command
        .spawn()
        .map_err(|e| format!("Failed to launch installer: {}", e))?;

    std::process::exit(0);
}

// ---------- macOS in-place update ----------

/// Extract the enclosing `.app` bundle path from an executable path, e.g.
/// `/Applications/Foo.app/Contents/MacOS/foo` → `/Applications/Foo.app`.
/// Returns None when the binary is not inside a bundle (dev runs, tests).
fn bundle_path_from_exe(exe: &std::path::Path) -> Option<PathBuf> {
    exe.ancestors()
        .find(|p| p.extension().is_some_and(|e| e == "app"))
        .map(|p| p.to_path_buf())
}

/// Parse the mount point from `hdiutil attach` text output: the field
/// starting with "/Volumes/" on the last line that has one. Mount points
/// may contain spaces, so everything from that marker to EOL is kept.
fn parse_hdiutil_mount_point(output: &str) -> Option<String> {
    output.lines().rev().find_map(|line| {
        line.find("/Volumes/")
            .map(|i| line[i..].trim().to_string())
    })
}

/// Single-quote a value for POSIX shell (`a'b` → `'a'\''b'`).
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Render the trampoline shell script. Kept as a pure function so the exact
/// swap sequence is unit-testable without touching hdiutil/ditto.
fn render_trampoline_script(
    pid: u32,
    mount: &str,
    app_in_dmg: &std::path::Path,
    target: &std::path::Path,
    dmg: &std::path::Path,
) -> String {
    format!(
        r#"#!/bin/sh
# RSerial Debug Assistant in-place update trampoline (auto-generated).
# Waits for the running app to exit, swaps the .app bundle, relaunches.
PID={pid}
MOUNT={mount}
APP_IN_DMG={app}
TARGET={target}
DMG={dmg}

# 1. Wait for the app to exit (bounded at ~30 s; replacing a running .app
#    is harmless on macOS anyway — the process keeps the old inode).
i=0
while kill -0 "$PID" 2>/dev/null && [ "$i" -lt 150 ]; do
    i=$((i + 1))
    sleep 0.2
done

PARENT=$(dirname "$TARGET")
NEW_TMP="$PARENT/.rsda-update-new.app"
OLD_TMP="$PARENT/.rsda-update-old.app"

fallback() {{
    rm -rf "$NEW_TMP"
    hdiutil detach "$MOUNT" -quiet -force 2>/dev/null
    open "$DMG"
    exit 1
}}

# 2. Stage the new bundle next to the target (same volume => mv is atomic).
rm -rf "$NEW_TMP"
ditto "$APP_IN_DMG" "$NEW_TMP" || fallback

# 3. Swap: old aside, new in; roll back if the second move fails.
rm -rf "$OLD_TMP"
mv "$TARGET" "$OLD_TMP" || fallback
if ! mv "$NEW_TMP" "$TARGET"; then
    mv "$OLD_TMP" "$TARGET"
    fallback
fi

# 4. Clean up and relaunch the updated app.
rm -rf "$OLD_TMP"
hdiutil detach "$MOUNT" -quiet -force 2>/dev/null
rm -f "$DMG"
open "$TARGET"
rm -f "$0"
"#,
        pid = pid,
        mount = shell_quote(mount),
        app = shell_quote(&app_in_dmg.to_string_lossy()),
        target = shell_quote(&target.to_string_lossy()),
        dmg = shell_quote(&dmg.to_string_lossy()),
    )
}

/// Mount the dmg read-only and return its mount point.
#[cfg(target_os = "macos")]
fn attach_dmg(dmg_path: &std::path::Path) -> Result<String, String> {
    let out = Command::new("hdiutil")
        .args(["attach", "-nobrowse", "-readonly"])
        .arg(dmg_path)
        .output()
        .map_err(|e| format!("Failed to run hdiutil: {}", e))?;
    if !out.status.success() {
        return Err(format!(
            "hdiutil attach failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    parse_hdiutil_mount_point(&String::from_utf8_lossy(&out.stdout))
        .ok_or_else(|| "Could not parse hdiutil mount point".to_string())
}

/// First `.app` bundle inside a directory (the mounted dmg root).
#[cfg(target_os = "macos")]
fn find_app_in_dir(dir: &std::path::Path) -> Result<PathBuf, String> {
    let entries = std::fs::read_dir(dir).map_err(|e| format!("Cannot read dmg mount: {}", e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|e| e == "app") {
            return Ok(path);
        }
    }
    Err("No .app found inside the dmg".to_string())
}

/// Build the trampoline script for an in-place update from `dmg_path` onto
/// the currently running bundle. Err => caller falls back to manual flow.
#[cfg(target_os = "macos")]
fn prepare_inplace_script(dmg_path: &std::path::Path) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("Cannot locate exe: {}", e))?;
    let bundle = bundle_path_from_exe(&exe)
        .ok_or_else(|| "App is not running from an .app bundle".to_string())?;

    let mount = attach_dmg(dmg_path)?;
    let app_in_dmg = match find_app_in_dir(std::path::Path::new(&mount)) {
        Ok(p) => p,
        Err(e) => {
            let _ = Command::new("hdiutil")
                .args(["detach", &mount, "-quiet", "-force"])
                .status();
            return Err(e);
        }
    };

    let script = render_trampoline_script(std::process::id(), &mount, &app_in_dmg, &bundle, dmg_path);
    let script_path = std::env::temp_dir().join(format!("rsda-update-{}.sh", std::process::id()));
    std::fs::write(&script_path, script).map_err(|e| format!("Cannot write trampoline: {}", e))?;
    Ok(script_path)
}

/// Open a URL in the system browser (release notes, project page, …).
///
/// Plain `<a target="_blank">` is a no-op inside the Tauri webview, so the
/// frontend hands external links here instead of using the shell plugin.
pub fn open_url(url: &str) -> Result<(), String> {
    // Cheap sanity check: only web URLs may be handed to the OS opener.
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(format!("Refusing to open non-http(s) URL: {}", url));
    }

    let status = if cfg!(target_os = "macos") {
        Command::new("open").arg(url).status()
    } else if cfg!(target_os = "windows") {
        Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", url])
            .status()
    } else {
        Command::new("xdg-open").arg(url).status()
    };

    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(s) => Err(format!("System URL opener exited with {}", s)),
        Err(e) => Err(format!("Failed to launch URL opener: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_version() {
        assert_eq!(parse_version("1.2.0"), Some((1, 2, 0)));
        assert_eq!(parse_version("v1.2.0"), Some((1, 2, 0)));
        assert_eq!(parse_version("V1.2.0"), Some((1, 2, 0)));
        assert_eq!(parse_version("1.10.5"), Some((1, 10, 5)));
        assert_eq!(parse_version("invalid"), None);
    }

    #[test]
    fn test_compare_versions() {
        assert_eq!(compare_versions("1.3.0", "1.2.0"), Some(Ordering::Greater));
        assert_eq!(compare_versions("1.2.0", "1.2.0"), Some(Ordering::Equal));
        assert_eq!(compare_versions("1.2.0", "1.3.0"), Some(Ordering::Less));
        assert_eq!(compare_versions("2.0.0", "1.9.9"), Some(Ordering::Greater));
    }

    #[test]
    fn open_url_rejects_non_http_schemes() {
        assert!(open_url("file:///etc/passwd").is_err());
        assert!(open_url("javascript:alert(1)").is_err());
        assert!(open_url("").is_err());
    }

    #[test]
    fn bundle_path_extracted_from_nested_exe() {
        let exe = std::path::Path::new("/Applications/RSerial Debug Assistant.app/Contents/MacOS/serial-debug-assistant");
        assert_eq!(
            bundle_path_from_exe(exe),
            Some(PathBuf::from("/Applications/RSerial Debug Assistant.app"))
        );
    }

    #[test]
    fn bundle_path_none_outside_bundle() {
        let exe = std::path::Path::new("/Users/x/project/target/debug/serial-debug-assistant");
        assert_eq!(bundle_path_from_exe(exe), None);
    }

    #[test]
    fn hdiutil_mount_point_parsed_with_spaces() {
        let out = "/dev/disk6              GUID_partition_scheme\n\
                   /dev/disk6s1            EFI\n\
                   /dev/disk6s2            Apple_HFS   /Volumes/RSerial Debug Assistant 1.4.1\n";
        assert_eq!(
            parse_hdiutil_mount_point(out),
            Some("/Volumes/RSerial Debug Assistant 1.4.1".to_string())
        );
    }

    #[test]
    fn hdiutil_mount_point_none_on_garbage() {
        assert_eq!(parse_hdiutil_mount_point("no mounts here"), None);
        assert_eq!(parse_hdiutil_mount_point(""), None);
    }

    #[test]
    fn shell_quote_handles_spaces_and_quotes() {
        assert_eq!(shell_quote("/a b/c"), "'/a b/c'");
        assert_eq!(shell_quote("a'b"), "'a'\\''b'");
    }

    #[test]
    fn trampoline_script_swaps_and_relaunches() {
        let script = render_trampoline_script(
            4242,
            "/Volumes/RSDA 1.4.1",
            std::path::Path::new("/Volumes/RSDA 1.4.1/RSerial Debug Assistant.app"),
            std::path::Path::new("/Applications/RSerial Debug Assistant.app"),
            std::path::Path::new("/tmp/rsda.dmg"),
        );
        // Waits for our pid, stages via ditto, swaps, rolls back on failure,
        // detaches, relaunches the target — and quotes every path.
        assert!(script.contains("PID=4242"));
        assert!(script.contains("kill -0 \"$PID\""));
        assert!(script.contains("MOUNT='/Volumes/RSDA 1.4.1'"));
        assert!(script.contains("ditto \"$APP_IN_DMG\" \"$NEW_TMP\""));
        assert!(script.contains("mv \"$TARGET\" \"$OLD_TMP\""));
        assert!(script.contains("mv \"$OLD_TMP\" \"$TARGET\""));
        assert!(script.contains("hdiutil detach \"$MOUNT\""));
        assert!(script.contains("open \"$TARGET\""));
        assert!(script.contains("open \"$DMG\""));
    }

    fn asset(name: &str) -> GitHubAsset {
        GitHubAsset {
            name: name.to_string(),
            browser_download_url: format!("https://example.com/{name}"),
            size: 1,
        }
    }

    #[test]
    fn windows_prefers_exe_over_dmg() {
        let assets = vec![asset("app.dmg"), asset("app.exe"), asset("app.msi")];
        let found = find_platform_asset(&assets, TargetPlatform::Windows).unwrap();
        assert_eq!(found.name, "app.exe");
    }

    #[test]
    fn macos_prefers_dmg_over_exe() {
        let assets = vec![asset("app.exe"), asset("app.dmg")];
        let found = find_platform_asset(&assets, TargetPlatform::Macos).unwrap();
        assert_eq!(found.name, "app.dmg");
    }

    #[test]
    fn linux_prefers_appimage() {
        let assets = vec![asset("app.exe"), asset("app.AppImage"), asset("app.deb")];
        let found = find_platform_asset(&assets, TargetPlatform::Linux).unwrap();
        assert_eq!(found.name, "app.AppImage");
    }
}
