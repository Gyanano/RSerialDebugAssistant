# Analysis Plan

## Architecture Summary
- **Frontend**: React + Vite app in `frontend/` with UI components, settings, and log viewer polling Tauri commands.
- **Backend**: Tauri + Rust in `src-tauri/` with `SerialManager` handling serial I/O, logging/recording, and `updater` for GitHub release checks.
- **Integration**: Frontend invokes Tauri commands in `src-tauri/src/main.rs` for ports, logging, segmentation, display settings, and updates.

## Build/Test Commands
- `cd frontend && npm run build`
- `cd src-tauri && cargo test`
- (Dev) `cd frontend && npm run dev` and `cargo tauri dev`

## Baseline Test Results (Before Changes)
- `npm run build` ✅
- `cargo test` ❌ failed: `glib-2.0` system library missing (`glib-sys` build script via pkg-config).

## Bugs/Behavioral Issues Identified
1. **Serial config parity/stop bits not honored**  
   - `serial_manager.rs` (`SerialManager::connect`): `Parity::Mark`/`Parity::Space` mapped to `serialport::Parity::None`, and `StopBits::OnePointFive` mapped to `StopBits::One`, so user selections are ignored.  
   - Plan: map to supported variants (if available) or return a user-visible error when unsupported.
2. **Configured timeout ignored**  
   - `serial_manager.rs`: port timeout hardcoded to 50ms; `SerialConfig.timeout` is never applied.  
   - Plan: use `config.timeout` or clamp to a safe range, and surface validation errors to the UI.
3. **Checksum encoding mismatch for non-UTF8 text**  
   - `App.tsx` (`handleSendData`): checksum calculation uses `TextEncoder` (UTF-8) even when GBK is selected, so bytes sent (GBK) and checksum differ.  
   - Plan: compute checksum on bytes encoded with selected encoding (use backend `encode_text` or encoding_rs in frontend).

## Optimization Opportunities
1. **High-frequency log polling**  
   - `App.tsx` polls `get_logs` every 100ms and replaces the full log array, which can be expensive with large logs.  
   - Plan: push logs from backend via events or fetch incrementally using a cursor/offset.
2. **LocalStorage polling in LogViewer**  
   - `LogViewer.tsx` polls localStorage every 500ms; this can be replaced with shared state or a single settings context.  
   - Plan: store settings in context and emit updates, removing the interval.
3. **Display settings lock in read loop**  
   - `serial_manager.rs` locks display settings on every read iteration.  
   - Plan: cache settings locally and refresh on change events or use a read-write lock to reduce contention.

## Planned Fix Sequence (No Code Changes Yet)
1. Align serial configuration handling (parity/stop bits/timeout) with user settings and report unsupported combinations.
2. Fix checksum calculation to respect chosen text encoding.
3. Reduce UI polling by switching to event-driven or incremental log updates.
4. Remove redundant localStorage polling and reduce lock contention in read loop.
