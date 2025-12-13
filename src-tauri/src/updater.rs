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

/// Parse version string (e.g., "v1.2.0" or "1.2.0") into (major, minor, patch)
fn parse_version(version: &str) -> Option<(u32, u32, u32)> {
    let v = version.trim_start_matches('v');
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

/// Find the .exe asset from release assets (excludes .msi)
fn find_exe_asset(assets: &[GitHubAsset]) -> Option<&GitHubAsset> {
    assets
        .iter()
        .find(|asset| {
            let name_lower = asset.name.to_lowercase();
            name_lower.ends_with(".exe") && !name_lower.ends_with(".msi")
        })
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

    let latest_version = release.tag_name.trim_start_matches('v').to_string();
    let current = current_version.trim_start_matches('v');

    let has_update = match compare_versions(&latest_version, current) {
        Some(Ordering::Greater) => true,
        _ => false,
    };

    let exe_asset = find_exe_asset(&release.assets);

    Ok(UpdateCheckResult {
        has_update,
        current_version: current.to_string(),
        latest_version: latest_version.clone(),
        download_url: exe_asset.map(|a| a.browser_download_url.clone()),
        download_size: exe_asset.map(|a| a.size),
        release_url: release.html_url,
        asset_name: exe_asset.map(|a| a.name.clone()),
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
    // Spawn the installer process
    Command::new(installer_path)
        .spawn()
        .map_err(|e| format!("Failed to launch installer: {}", e))?;

    // Exit the application
    std::process::exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_version() {
        assert_eq!(parse_version("1.2.0"), Some((1, 2, 0)));
        assert_eq!(parse_version("v1.2.0"), Some((1, 2, 0)));
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
}
