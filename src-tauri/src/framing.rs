//! Pure frame segmentation logic, extracted from `SerialManager`'s reader
//! thread (RFC #3, Step 1).
//!
//! Behavior is intentionally identical to the legacy read loop — including
//! its quirks — and is pinned by golden tests both here (unit level, no
//! threads) and in `serial_manager::tests` (driving the real reader thread
//! through a scripted fake port). Step 2 will swap the legacy loop's four
//! duplicated emission blocks over to this component; until then the
//! segmenter is exercised only by tests.

use crate::types::{FrameSegmentationConfig, FrameSegmentationMode};
use std::time::{Duration, Instant};

/// Hard cap on frame size (RFC #3): a frame may never exceed this many
/// bytes. Continuous streams with no delimiter are cut into cap-sized
/// chunks during `feed`, so memory stays bounded and every frame carries a
/// size guarantee. 64 KiB matches the planned IPC batch budget.
pub const DEFAULT_MAX_FRAME_BYTES: usize = 64 * 1024;

/// Bytes in, frames out. The caller drives it with explicit timestamps so
/// tests never need to sleep.
pub struct FrameSegmenter {
    config: FrameSegmentationConfig,
    max_frame_bytes: usize,
    buffer: Vec<u8>,
    last_data_time: Instant,
}

impl FrameSegmenter {
    pub fn new(config: FrameSegmentationConfig, now: Instant) -> Self {
        Self::with_max_frame_bytes(config, now, DEFAULT_MAX_FRAME_BYTES)
    }

    pub fn with_max_frame_bytes(
        config: FrameSegmentationConfig,
        now: Instant,
        max_frame_bytes: usize,
    ) -> Self {
        Self {
            config,
            max_frame_bytes,
            buffer: Vec::new(),
            last_data_time: now,
        }
    }

    /// Mirrors the legacy loop, which re-reads the shared config every
    /// iteration: swapping config mid-stream does NOT flush or clear
    /// already-buffered bytes.
    pub fn set_config(&mut self, config: FrameSegmentationConfig) {
        self.config = config;
    }

    /// Feed bytes just read from the port. Returns frames closed by
    /// delimiter processing — delimiter bytes are included in the frame,
    /// matching the legacy behavior. Delimiter processing only happens in
    /// Combined mode; in Timeout mode everything waits for `flush_if_idle`
    /// or the hard cap.
    ///
    /// Hard cap (new in Step 2, replaces legacy unbounded growth): a
    /// delimiter only closes a frame if the match lies fully inside the
    /// first `max_frame_bytes` of the buffer; beyond that the buffer is cut
    /// into cap-sized chunks. A delimiter straddling the cap boundary can
    /// therefore be split — same family as the pinned CRLF-across-reads
    /// quirk, deterministic and bounded. Invariant on return:
    /// `buffer.len() < max_frame_bytes`.
    pub fn feed(&mut self, bytes: &[u8], now: Instant) -> Vec<Vec<u8>> {
        self.buffer.extend_from_slice(bytes);
        self.last_data_time = now;

        let delimiter = self.config.delimiter.to_bytes();
        let combined = self.config.mode == FrameSegmentationMode::Combined;
        let mut frames = Vec::new();
        loop {
            if combined {
                let hit = {
                    let window = &self.buffer[..self.buffer.len().min(self.max_frame_bytes)];
                    if self.config.delimiter.is_any_newline() {
                        find_any_newline(window)
                    } else {
                        find_delimiter(window, &delimiter).map(|pos| (pos, delimiter.len()))
                    }
                };
                if let Some((pos, len)) = hit {
                    frames.push(self.buffer.drain(..pos + len).collect());
                    continue;
                }
            }
            if self.buffer.len() >= self.max_frame_bytes {
                frames.push(self.buffer.drain(..self.max_frame_bytes).collect());
                continue;
            }
            break;
        }
        frames
    }

    /// Timeout flush, meant for idle reads (Ok(0) / TimedOut). Mirrors the
    /// legacy semantics: applies in Timeout and Combined modes, compares
    /// with strict `>`, and takes the WHOLE buffer (a partial frame with no
    /// delimiter still flushes whole in Combined mode).
    pub fn flush_if_idle(&mut self, now: Instant) -> Option<Vec<u8>> {
        let timeout = Duration::from_millis(self.config.timeout_ms);
        let should_flush = matches!(
            self.config.mode,
            FrameSegmentationMode::Timeout | FrameSegmentationMode::Combined
        ) && !self.buffer.is_empty()
            && now.duration_since(self.last_data_time) > timeout;

        if should_flush {
            Some(std::mem::take(&mut self.buffer))
        } else {
            None
        }
    }

    /// Bytes currently pending (received but not yet framed).
    #[cfg(test)]
    pub fn pending(&self) -> &[u8] {
        &self.buffer
    }

    /// Drain any buffered bytes as a final frame regardless of idle time.
    /// Used when the reader is shutting down or dying so the tail of the
    /// stream is not silently dropped (RFC #3 Step 3).
    pub fn flush(&mut self) -> Option<Vec<u8>> {
        if self.buffer.is_empty() {
            None
        } else {
            Some(std::mem::take(&mut self.buffer))
        }
    }
}

/// Find the position of a delimiter in the data buffer.
pub(crate) fn find_delimiter(data: &[u8], delimiter: &[u8]) -> Option<usize> {
    if delimiter.is_empty() || data.len() < delimiter.len() {
        return None;
    }

    data.windows(delimiter.len())
        .position(|window| window == delimiter)
}

/// Find any newline sequence (\r, \n, or \r\n) in the data buffer.
/// Returns (position, length) where length is 1 for \r or \n alone, and 2
/// for \r\n.
///
/// QUIRK (pinned, do not "fix" in isolation): a `\r` at the very end of the
/// buffer is returned immediately as a 1-byte match without waiting for a
/// possible `\n` in the next read. A CRLF pair split across two reads
/// therefore produces TWO frames ("...\r" then "\n").
pub(crate) fn find_any_newline(data: &[u8]) -> Option<(usize, usize)> {
    for i in 0..data.len() {
        match data[i] {
            0x0D => {
                // CR
                if i + 1 < data.len() && data[i + 1] == 0x0A {
                    return Some((i, 2)); // CRLF
                }
                return Some((i, 1)); // CR alone
            }
            0x0A => {
                // LF alone (not preceded by CR, as CRLF would have been caught above)
                return Some((i, 1));
            }
            _ => continue,
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::FrameDelimiter;

    fn combined(delimiter: FrameDelimiter) -> FrameSegmentationConfig {
        FrameSegmentationConfig {
            mode: FrameSegmentationMode::Combined,
            timeout_ms: 10,
            delimiter,
        }
    }

    fn timeout_mode() -> FrameSegmentationConfig {
        FrameSegmentationConfig {
            mode: FrameSegmentationMode::Timeout,
            timeout_ms: 10,
            delimiter: FrameDelimiter::AnyNewline,
        }
    }

    #[test]
    fn timeout_mode_flushes_after_idle() {
        let t0 = Instant::now();
        let mut seg = FrameSegmenter::new(timeout_mode(), t0);
        assert!(seg.feed(b"hello", t0).is_empty());

        // Strict `>` comparison: exactly at the deadline is NOT a flush.
        assert!(seg.flush_if_idle(t0 + Duration::from_millis(10)).is_none());
        assert_eq!(
            seg.flush_if_idle(t0 + Duration::from_millis(11)),
            Some(b"hello".to_vec())
        );
        assert!(seg.pending().is_empty());
    }

    #[test]
    fn timeout_mode_ignores_delimiters() {
        let t0 = Instant::now();
        let mut seg = FrameSegmenter::new(timeout_mode(), t0);
        // Newlines arrive but Timeout mode never frames on arrival.
        assert!(seg.feed(b"OK\r\nOK\r\n", t0).is_empty());
        assert_eq!(
            seg.flush_if_idle(t0 + Duration::from_millis(11)),
            Some(b"OK\r\nOK\r\n".to_vec())
        );
    }

    #[test]
    fn timeout_mode_no_flush_without_data() {
        let t0 = Instant::now();
        let mut seg = FrameSegmenter::new(timeout_mode(), t0);
        assert!(seg.flush_if_idle(t0 + Duration::from_secs(60)).is_none());
    }

    #[test]
    fn combined_any_newline_frames_on_arrival() {
        let t0 = Instant::now();
        let mut seg = FrameSegmenter::new(combined(FrameDelimiter::AnyNewline), t0);
        let frames = seg.feed(b"AT\r\nOK\r\n", t0);
        assert_eq!(frames, vec![b"AT\r\n".to_vec(), b"OK\r\n".to_vec()]);
        assert!(seg.pending().is_empty());
    }

    #[test]
    fn combined_any_newline_crlf_split_across_reads_is_two_frames() {
        // QUIRK pinned: "\r" ending a read matches immediately, so a CRLF
        // pair split across read boundaries yields "OK\r" and "\n".
        let t0 = Instant::now();
        let mut seg = FrameSegmenter::new(combined(FrameDelimiter::AnyNewline), t0);
        assert_eq!(seg.feed(b"OK\r", t0), vec![b"OK\r".to_vec()]);
        assert_eq!(seg.feed(b"\n", t0), vec![b"\n".to_vec()]);
    }

    #[test]
    fn combined_explicit_crlf_delimiter() {
        let t0 = Instant::now();
        let mut seg = FrameSegmenter::new(combined(FrameDelimiter::CRLF), t0);
        // A lone \n does not match the CRLF delimiter and stays in the stream.
        let frames = seg.feed(b"a\r\nb\nc\r\n", t0);
        assert_eq!(frames, vec![b"a\r\n".to_vec(), b"b\nc\r\n".to_vec()]);
        assert!(seg.pending().is_empty());
    }

    #[test]
    fn combined_custom_delimiter_residue_flushes_on_timeout() {
        let t0 = Instant::now();
        let mut seg = FrameSegmenter::new(combined(FrameDelimiter::Custom(b"##".to_vec())), t0);
        let frames = seg.feed(b"ab##cd##e", t0);
        assert_eq!(frames, vec![b"ab##".to_vec(), b"cd##".to_vec()]);
        assert_eq!(seg.pending(), b"e");
        // Combined mode: timeout flush takes the whole residue.
        assert_eq!(
            seg.flush_if_idle(t0 + Duration::from_millis(11)),
            Some(b"e".to_vec())
        );
    }

    #[test]
    fn combined_empty_custom_delimiter_never_frames() {
        let t0 = Instant::now();
        let mut seg = FrameSegmenter::new(combined(FrameDelimiter::Custom(vec![])), t0);
        assert!(seg.feed(b"abc", t0).is_empty());
        assert_eq!(seg.pending(), b"abc");
        assert_eq!(
            seg.flush_if_idle(t0 + Duration::from_millis(11)),
            Some(b"abc".to_vec())
        );
    }

    #[test]
    fn config_change_preserves_buffer() {
        let t0 = Instant::now();
        let mut seg = FrameSegmenter::new(timeout_mode(), t0);
        assert!(seg.feed(b"ab", t0).is_empty());

        seg.set_config(combined(FrameDelimiter::LF));
        // Bytes buffered under the old config join the new delimiter framing.
        let frames = seg.feed(b"c\n", t0);
        assert_eq!(frames, vec![b"abc\n".to_vec()]);
    }

    #[test]
    fn feed_resets_idle_clock() {
        let t0 = Instant::now();
        let mut seg = FrameSegmenter::new(timeout_mode(), t0);
        seg.feed(b"a", t0);
        // Late data restarts the idle window.
        seg.feed(b"b", t0 + Duration::from_millis(8));
        assert!(seg.flush_if_idle(t0 + Duration::from_millis(15)).is_none());
        assert_eq!(
            seg.flush_if_idle(t0 + Duration::from_millis(19)),
            Some(b"ab".to_vec())
        );
    }

    #[test]
    fn hard_cap_cuts_continuous_stream_without_waiting_for_idle() {
        let t0 = Instant::now();
        let mut seg =
            FrameSegmenter::with_max_frame_bytes(timeout_mode(), t0, 1024);
        // 2500 bytes with no idle gap: two full chunks cut immediately,
        // residue waits for the timeout flush.
        let frames = seg.feed(&vec![b'x'; 2500], t0);
        assert_eq!(frames.len(), 2);
        assert!(frames.iter().all(|f| f.len() == 1024));
        assert_eq!(seg.pending().len(), 452);
        assert_eq!(
            seg.flush_if_idle(t0 + Duration::from_millis(11)),
            Some(vec![b'x'; 452])
        );
    }

    #[test]
    fn delimiter_within_cap_window_wins_over_hard_cut() {
        let t0 = Instant::now();
        let mut seg = FrameSegmenter::with_max_frame_bytes(
            combined(FrameDelimiter::LF),
            t0,
            8,
        );
        // LF inside the first 8 bytes closes a short frame; rest pends.
        let frames = seg.feed(b"ab\ncdefgh", t0);
        assert_eq!(frames, vec![b"ab\n".to_vec()]);
        assert_eq!(seg.pending(), b"cdefgh");
    }

    #[test]
    fn delimiter_beyond_cap_window_gets_hard_cut() {
        let t0 = Instant::now();
        let mut seg = FrameSegmenter::with_max_frame_bytes(
            combined(FrameDelimiter::LF),
            t0,
            8,
        );
        // LF at position 8 is outside the 8-byte window: hard cut first,
        // then the lone LF frames on its own (cap-boundary split, pinned).
        let frames = seg.feed(b"abcdefgh\n", t0);
        assert_eq!(frames, vec![b"abcdefgh".to_vec(), b"\n".to_vec()]);
        assert!(seg.pending().is_empty());
    }

    #[test]
    fn flush_drains_pending_regardless_of_idle() {
        let t0 = Instant::now();
        let mut seg = FrameSegmenter::new(combined(FrameDelimiter::LF), t0);
        assert!(seg.flush().is_none());
        let frames = seg.feed(b"abc", t0);
        assert!(frames.is_empty());
        assert_eq!(seg.flush(), Some(b"abc".to_vec()));
        assert!(seg.pending().is_empty());
        assert!(seg.flush().is_none());
    }
}
