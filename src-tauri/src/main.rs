// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

mod serial_manager;
mod bus;
mod framing;
mod types;
mod updater;

use serial_manager::SerialManager;
use types::*;
use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};

// ── RFC #3 Step 4: event push bridge ─────────────────────────────────
/// Wire DTO for `serial://frames`: the hot path carries no raw bytes
/// (seq/dir/len + decorated display text); raw bytes remain available via
/// the snapshot command and export.
#[derive(Clone, serde::Serialize)]
struct FrameDto {
    session: u64,
    seq: u64,
    direction: Direction,
    len: usize,
    timestamp: chrono::DateTime<chrono::Utc>,
    display_text: String,
    timestamp_formatted: Option<String>,
}

#[derive(Clone, serde::Serialize)]
struct FrameBatchDto {
    session: u64,
    first_seq: u64,
    dropped_before: u64,
    frames: Vec<FrameDto>,
}

/// Bridge contract: a plain pump thread with bounded blocking recv; the
/// subscription lives for the app's lifetime (sessions come and go).
fn spawn_frame_pump(app: &tauri::App) {
    use tauri::{Emitter, Manager};
    let app_handle = app.handle().clone();
    let state = app.state::<AppState>();
    let (bus, disp, tz) = {
        let manager = state.serial_manager.lock().unwrap();
        (
            manager.bus(),
            manager.display_settings_handle(),
            manager.timezone_offset_handle(),
        )
    };
    std::thread::spawn(move || {
        let sub = bus.subscribe(bus::GUI_DEFAULT);
        loop {
            let Some(batch) = sub.recv_batch() else {
                continue; // quiet timeout tick
            };
            let settings = disp.lock().map(|g| g.clone()).unwrap_or_default();
            let tz_offset = *tz.lock().unwrap_or_else(|e| e.into_inner());
            let frames: Vec<FrameDto> = batch
                .frames
                .iter()
                .map(|f| FrameDto {
                    session: f.session,
                    seq: f.seq,
                    direction: f.dir,
                    len: f.data.len(),
                    timestamp: f.t_wall,
                    display_text: serial_manager::format_data_for_display(&f.data, &settings),
                    timestamp_formatted: if settings.show_timestamps {
                        Some(serial_manager::format_timestamp_with_offset(tz_offset))
                    } else {
                        None
                    },
                })
                .collect();
            let dto = FrameBatchDto {
                session: batch.session,
                first_seq: batch.first_seq,
                dropped_before: batch.dropped_before,
                frames,
            };
            let _ = app_handle.emit("serial://frames", dto);
        }
    });
}

// Application state
struct AppState {
    serial_manager: Mutex<SerialManager>,
    sessions: Mutex<HashMap<String, SerialConfig>>,
    update_downloading: AtomicBool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            serial_manager: Mutex::new(SerialManager::new()),
            sessions: Mutex::new(HashMap::new()),
            update_downloading: AtomicBool::new(false),
        }
    }
}

// Tauri commands
#[tauri::command]
async fn list_serial_ports() -> Result<Vec<SerialPortInfo>, String> {
    SerialManager::list_available_ports()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn connect_to_port(
    state: State<'_, AppState>,
    port_name: String,
    config: SerialConfig,
) -> Result<(), String> {
    let mut manager = state.serial_manager.lock().unwrap();
    manager.connect(&port_name, config)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn disconnect_port(state: State<'_, AppState>) -> Result<(), String> {
    // Fast state cleanup under the lock; the (bounded) reader join happens
    // AFTER the lock is released so polling commands are never blocked
    // behind a thread wait (RFC #3 Step 3).
    let handle = {
        let mut manager = state.serial_manager.lock().unwrap();
        manager.disconnect().map_err(|e| e.to_string())?
    };
    if let Some(h) = handle {
        SerialManager::join_reader_bounded(h);
    }
    Ok(())
}

#[tauri::command]
async fn send_data(
    state: State<'_, AppState>,
    data: String,
    format: DataFormat,
    encoding: Option<TextEncoding>,
) -> Result<(), String> {
    let text_encoding = encoding.unwrap_or_default();

    // Process data conversion in a separate task to avoid blocking UI
    let bytes = tokio::task::spawn_blocking(move || {
        match format {
            DataFormat::Text => {
                // Encode text using the specified encoding
                match text_encoding {
                    TextEncoding::Utf8 => Ok(data.into_bytes()),
                    TextEncoding::Gbk => {
                        let (encoded, _, had_errors) = encoding_rs::GBK.encode(&data);
                        if had_errors {
                            // If encoding fails for some characters, still send what we can
                            log::warn!("Some characters could not be encoded to GBK");
                        }
                        Ok(encoded.into_owned())
                    }
                }
            }
            DataFormat::Hex => {
                let cleaned = data.replace(" ", "").replace("\n", "");
                if cleaned.len() % 2 != 0 {
                    return Err("Hex string must have even number of characters".to_string());
                }

                let mut bytes = Vec::new();
                for i in (0..cleaned.len()).step_by(2) {
                    match u8::from_str_radix(&cleaned[i..i+2], 16) {
                        Ok(byte) => bytes.push(byte),
                        Err(_) => return Err("Invalid hex characters".to_string()),
                    }
                }
                Ok(bytes)
            }
        }
    }).await.map_err(|e| e.to_string())??;

    let mut manager = state.serial_manager.lock().unwrap();
    manager.send_data(bytes)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_connection_status(state: State<'_, AppState>) -> Result<ConnectionStatus, String> {
    let mut manager = state.serial_manager.lock().unwrap();
    Ok(manager.get_status())
}

#[tauri::command]
async fn get_logs(state: State<'_, AppState>) -> Result<Vec<LogEntry>, String> {
    let manager = state.serial_manager.lock().unwrap();
    Ok(manager.get_logs())
}

/// Initial alignment for the event-driven log view (RFC #3 Step 4).
#[tauri::command]
async fn get_logs_snapshot(state: State<'_, AppState>) -> Result<LogsSnapshot, String> {
    let manager = state.serial_manager.lock().unwrap();
    Ok(manager.get_logs_snapshot())
}

/// Returns the new log epoch; the frontend uses it to discard snapshots
/// that raced this clear.
#[tauri::command]
async fn clear_logs(state: State<'_, AppState>) -> Result<u64, String> {
    let mut manager = state.serial_manager.lock().unwrap();
    Ok(manager.clear_logs())
}

#[tauri::command]
async fn export_logs(
    state: State<'_, AppState>,
    file_path: String,
    format: ExportFormat,
    timezone_offset_minutes: Option<i32>,
) -> Result<(), String> {
    let manager = state.serial_manager.lock().unwrap();
    manager.export_logs(&file_path, format, timezone_offset_minutes.unwrap_or(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_session(
    state: State<'_, AppState>,
    name: String,
    config: SerialConfig,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    sessions.insert(name, config);
    Ok(())
}

#[tauri::command]
async fn load_session(
    state: State<'_, AppState>,
    name: String,
) -> Result<SerialConfig, String> {
    let sessions = state.sessions.lock().unwrap();
    sessions.get(&name)
        .cloned()
        .ok_or_else(|| "Session not found".to_string())
}

#[tauri::command]
async fn list_sessions(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let sessions = state.sessions.lock().unwrap();
    Ok(sessions.keys().cloned().collect())
}

#[tauri::command]
async fn set_log_limit(state: State<'_, AppState>, limit: usize) -> Result<(), String> {
    let manager = state.serial_manager.lock().unwrap();
    manager.set_max_log_entries(limit);
    Ok(())
}

#[tauri::command]
async fn get_log_limit(state: State<'_, AppState>) -> Result<usize, String> {
    let manager = state.serial_manager.lock().unwrap();
    Ok(manager.get_max_log_entries())
}

#[tauri::command]
async fn set_frame_segmentation(
    state: State<'_, AppState>,
    config: FrameSegmentationConfig,
) -> Result<(), String> {
    let manager = state.serial_manager.lock().unwrap();
    manager.set_frame_segmentation_config(config);
    Ok(())
}

#[tauri::command]
async fn get_frame_segmentation(state: State<'_, AppState>) -> Result<FrameSegmentationConfig, String> {
    let manager = state.serial_manager.lock().unwrap();
    Ok(manager.get_frame_segmentation_config())
}

// Recording commands

#[tauri::command]
async fn set_log_directory(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let manager = state.serial_manager.lock().unwrap();
    manager.set_log_directory(path);
    Ok(())
}

#[tauri::command]
async fn get_log_directory(state: State<'_, AppState>) -> Result<String, String> {
    let manager = state.serial_manager.lock().unwrap();
    Ok(manager.get_log_directory())
}

#[tauri::command]
async fn set_timezone_offset(state: State<'_, AppState>, offset_minutes: i32) -> Result<(), String> {
    let manager = state.serial_manager.lock().unwrap();
    manager.set_timezone_offset(offset_minutes);
    Ok(())
}

#[tauri::command]
async fn start_text_recording(state: State<'_, AppState>) -> Result<String, String> {
    let manager = state.serial_manager.lock().unwrap();
    manager.start_text_recording().map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_text_recording(state: State<'_, AppState>) -> Result<(), String> {
    let manager = state.serial_manager.lock().unwrap();
    manager.stop_text_recording().map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_raw_recording(state: State<'_, AppState>) -> Result<String, String> {
    let manager = state.serial_manager.lock().unwrap();
    manager.start_raw_recording().map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_raw_recording(state: State<'_, AppState>) -> Result<(), String> {
    let manager = state.serial_manager.lock().unwrap();
    manager.stop_raw_recording().map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_recording_status(state: State<'_, AppState>) -> Result<RecordingStatus, String> {
    let manager = state.serial_manager.lock().unwrap();
    Ok(manager.get_recording_status())
}

/// Encode text string to bytes using the specified encoding
#[tauri::command]
async fn encode_text(text: String, encoding: TextEncoding) -> Result<Vec<u8>, String> {
    match encoding {
        TextEncoding::Utf8 => Ok(text.into_bytes()),
        TextEncoding::Gbk => {
            let (encoded, _, had_errors) = encoding_rs::GBK.encode(&text);
            if had_errors {
                log::warn!("Some characters could not be encoded to GBK");
            }
            Ok(encoded.into_owned())
        }
    }
}

/// Decode bytes to text string using the specified encoding
#[tauri::command]
async fn decode_bytes(bytes: Vec<u8>, encoding: TextEncoding) -> Result<String, String> {
    match encoding {
        TextEncoding::Utf8 => {
            String::from_utf8(bytes)
                .map_err(|e| format!("Invalid UTF-8 sequence: {}", e))
        }
        TextEncoding::Gbk => {
            let (decoded, _, had_errors) = encoding_rs::GBK.decode(&bytes);
            if had_errors {
                log::warn!("Some bytes could not be decoded from GBK");
            }
            Ok(decoded.into_owned())
        }
    }
}

// Display settings commands

#[tauri::command]
async fn set_display_format(state: State<'_, AppState>, format: ReceiveDisplayFormat) -> Result<(), String> {
    let manager = state.serial_manager.lock().unwrap();
    manager.set_display_format(format);
    Ok(())
}

#[tauri::command]
async fn set_text_encoding_display(state: State<'_, AppState>, encoding: TextEncoding) -> Result<(), String> {
    let manager = state.serial_manager.lock().unwrap();
    manager.set_text_encoding(encoding);
    Ok(())
}

#[tauri::command]
async fn set_special_char_config(state: State<'_, AppState>, config: SpecialCharConfig) -> Result<(), String> {
    let manager = state.serial_manager.lock().unwrap();
    manager.set_special_char_config(config);
    Ok(())
}

#[tauri::command]
async fn set_show_timestamps(state: State<'_, AppState>, show: bool) -> Result<(), String> {
    let manager = state.serial_manager.lock().unwrap();
    manager.set_show_timestamps(show);
    Ok(())
}

#[tauri::command]
async fn get_display_settings(state: State<'_, AppState>) -> Result<DisplaySettings, String> {
    let manager = state.serial_manager.lock().unwrap();
    Ok(manager.get_display_settings())
}

// Update checker commands

#[tauri::command]
async fn check_for_updates() -> Result<updater::UpdateCheckResult, String> {
    let current_version = env!("CARGO_PKG_VERSION");
    updater::check_for_updates(current_version).await
}

#[tauri::command]
async fn download_update(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    download_url: String,
    asset_name: String,
) -> Result<String, String> {
    // Prevent multiple simultaneous downloads
    if state.update_downloading.swap(true, AtomicOrdering::SeqCst) {
        return Err("Download already in progress".to_string());
    }

    let result = updater::download_update(&app_handle, &download_url, &asset_name).await;

    state.update_downloading.store(false, AtomicOrdering::SeqCst);

    result.map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
async fn launch_installer_and_exit(installer_path: String) -> Result<(), String> {
    updater::launch_installer_and_exit(&installer_path)
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    updater::open_url(&url)
}

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            spawn_frame_pump(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            connect_to_port,
            disconnect_port,
            send_data,
            get_connection_status,
            get_logs,
            get_logs_snapshot,
            clear_logs,
            export_logs,
            save_session,
            load_session,
            list_sessions,
            set_log_limit,
            get_log_limit,
            set_frame_segmentation,
            get_frame_segmentation,
            set_log_directory,
            get_log_directory,
            set_timezone_offset,
            start_text_recording,
            stop_text_recording,
            start_raw_recording,
            stop_raw_recording,
            get_recording_status,
            encode_text,
            decode_bytes,
            set_display_format,
            set_text_encoding_display,
            set_special_char_config,
            set_show_timestamps,
            get_display_settings,
            check_for_updates,
            download_update,
            launch_installer_and_exit,
            open_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}