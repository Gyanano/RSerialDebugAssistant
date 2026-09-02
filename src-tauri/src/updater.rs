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

/// Launch the installer and exit the application
pub fn launch_installer_and_exit(installer_path: &str) -> Result<(), String> {
    let mut command = if cfg!(target_os = "macos") {
        let mut cmd = Command::new("open");
        cmd.arg(installer_path);
        cmd
    } else if cfg!(target_os = "linux") && !installer_path.to_lowercase().ends_with(".appimage") {
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
