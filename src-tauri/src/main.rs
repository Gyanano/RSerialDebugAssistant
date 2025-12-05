// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

mod serial_manager;
mod types;

use serial_manager::SerialManager;
use types::*;

// Application state
struct AppState {
    serial_manager: Mutex<SerialManager>,
    sessions: Mutex<HashMap<String, SerialConfig>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            serial_manager: Mutex::new(SerialManager::new()),
            sessions: Mutex::new(HashMap::new()),
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
    let mut manager = state.serial_manager.lock().unwrap();
    manager.disconnect()
        .map_err(|e| e.to_string())
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
    let manager = state.serial_manager.lock().unwrap();
    Ok(manager.get_status())
}

#[tauri::command]
async fn get_logs(state: State<'_, AppState>) -> Result<Vec<LogEntry>, String> {
    let manager = state.serial_manager.lock().unwrap();
    Ok(manager.get_logs())
}

#[tauri::command]
async fn clear_logs(state: State<'_, AppState>) -> Result<(), String> {
    let mut manager = state.serial_manager.lock().unwrap();
    manager.clear_logs();
    Ok(())
}

#[tauri::command]
async fn export_logs(
    state: State<'_, AppState>,
    file_path: String,
    format: ExportFormat,
) -> Result<(), String> {
    let manager = state.serial_manager.lock().unwrap();
    manager.export_logs(&file_path, format)
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

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            connect_to_port,
            disconnect_port,
            send_data,
            get_connection_status,
            get_logs,
            clear_logs,
            export_logs,
            save_session,
            load_session,
            list_sessions,
            set_log_limit,
            get_log_limit
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}