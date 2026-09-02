//! Frame bus: session/seq allocation, bounded per-subscriber queues with
//! drop-oldest backpressure, and Nagle-style batching (RFC #3 Step 4).
//!
//! Contract pinned here:
//! - `seq` is strictly increasing from 1 within a session; TX and RX share
//!   one sequence (transcript interleaving preserved).
//! - A slow subscriber loses the OLDEST frames and every batch reports
//!   `dropped_before`, so gaps are always detectable (prefix gap + count).
//! - The publisher (read thread / send path) never blocks: queue push is a
//!   µs-scale lock, never I/O.

use crate::types::Direction;
use chrono::{DateTime, Utc};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock, Weak};
use std::time::{Duration, Instant};

pub type SessionId = u64;
pub type Seq = u64;

/// Process-level monotonic clock base (reserved for cross-port time alignment).
fn mono_base() -> &'static Instant {
    static BASE: OnceLock<Instant> = OnceLock::new();
    BASE.get_or_init(Instant::now)
}

fn mono_now_ns() -> u64 {
    mono_base().elapsed().as_nanos() as u64
}

#[derive(Clone, Debug)]
pub struct Frame {
    pub session: SessionId,
    pub seq: Seq,
    pub dir: Direction,
    /// Process-level monotonic timestamp, reserved for future cross-port
    /// time alignment (RFC #3: must land now; adding it later would break
    /// the transcript format).
    #[allow(dead_code)]
    pub t_mono_ns: u64,
    pub t_wall: DateTime<Utc>,
    /// Arc-shared so fan-out to N subscribers is zero-copy.
    pub data: Arc<[u8]>,
}

#[derive(Debug)]
pub struct FrameBatch {
    /// Session of the batch's LAST frame. A batch never mixes sessions in
    /// practice (a session change requires a reconnect, which implies a
    /// quiet port), but consumers should resync on session change anyway.
    pub session: SessionId,
    pub first_seq: Seq,
    /// Frames dropped for THIS subscriber since the previous batch
    /// (drop-oldest => the gap is always a prefix of the sequence).
    pub dropped_before: u64,
    pub frames: Vec<Frame>,
}

#[derive(Debug, Clone, Copy)]
pub struct BatchPolicy {
    /// Max time the oldest pending frame may wait before flushing.
    pub max_delay: Duration,
    /// Minimum spacing between flushes; a lone frame for an idle consumer
    /// pushes immediately only if the last flush is at least this old.
    pub min_interval: Duration,
    /// Flush when pending payload reaches this many bytes.
    pub max_bytes: usize,
    /// Flush when pending reaches this many frames.
    pub max_frames: usize,
    /// Bounded queue capacity per subscriber, in frames.
    pub queue_frames: usize,
}

/// GUI default: ~60 fps worst case, IPC batches bounded by the frame cap.
pub const GUI_DEFAULT: BatchPolicy = BatchPolicy {
    max_delay: Duration::from_millis(16),
    min_interval: Duration::from_millis(4),
    max_bytes: 64 * 1024,
    max_frames: 512,
    queue_frames: 4096,
};

struct SubscriberState {
    queue: VecDeque<Frame>,
    dropped: u64,
}

struct SubscriberShared {
    state: Mutex<SubscriberState>,
    cond: Condvar,
    /// Bounded queue capacity in frames, from the subscriber's policy.
    queue_frames: usize,
}

/// Receiving end of a subscription. The bridge contract is a pump thread
/// calling `recv_batch` in a loop (bounded blocking, never async).
pub struct Subscription {
    shared: Arc<SubscriberShared>,
    policy: BatchPolicy,
    last_flush: Mutex<Instant>,
}

impl Subscription {
    /// Block (bounded) until a batch is ready per the Nagle rules:
    /// 1. idle consumer + lone frame + min_interval elapsed => push immediately
    /// 2. otherwise accumulate until max_delay / max_bytes / max_frames
    /// Returns `None` on timeout with no frames (lets the pump react to
    /// external state); the subscription lives for the app's lifetime.
    pub fn recv_batch(&self) -> Option<FrameBatch> {
        let policy = &self.policy;
        let mut st = self.shared.state.lock().unwrap();

        // Wait for the first frame, bounded by max_delay.
        while st.queue.is_empty() {
            let (g, timed_out) = self
                .shared
                .cond
                .wait_timeout(st, policy.max_delay)
                .unwrap();
            st = g;
            if st.queue.is_empty() && timed_out.timed_out() {
                return None;
            }
        }

        let now = Instant::now();
        let mut last_flush = self.last_flush.lock().unwrap();

        // Rule 1: idle consumer, single frame, quiet period honored.
        if st.queue.len() == 1 && now.duration_since(*last_flush) >= policy.min_interval {
            let frame = st.queue.pop_front().unwrap();
            let dropped_before = std::mem::take(&mut st.dropped);
            *last_flush = Instant::now();
            return Some(FrameBatch {
                session: frame.session,
                first_seq: frame.seq,
                dropped_before,
                frames: vec![frame],
            });
        }

        // Rule 2: collect until a threshold or the max_delay deadline.
        let mut frames: Vec<Frame> = st.queue.drain(..).collect();
        let mut bytes: usize = frames.iter().map(|f| f.data.len()).sum();
        let deadline = Instant::now() + policy.max_delay;
        loop {
            if frames.len() >= policy.max_frames || bytes >= policy.max_bytes {
                break;
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                break;
            }
            let (g, _) = self.shared.cond.wait_timeout(st, remaining).unwrap();
            st = g;
            while let Some(f) = st.queue.pop_front() {
                bytes += f.data.len();
                frames.push(f);
            }
            if Instant::now() >= deadline {
                break;
            }
        }

        let dropped_before = std::mem::take(&mut st.dropped);
        *last_flush = Instant::now();
        let first = frames.first().expect("non-empty after wait");
        Some(FrameBatch {
            session: frames.last().unwrap().session,
            first_seq: first.seq,
            dropped_before,
            frames: std::mem::take(&mut frames),
        })
    }
}

pub struct FrameBus {
    session: AtomicU64,
    seq: AtomicU64,
    session_counter: AtomicU64,
    subscribers: Mutex<Vec<Weak<SubscriberShared>>>,
}

impl FrameBus {
    pub fn new() -> Self {
        Self {
            session: AtomicU64::new(0),
            seq: AtomicU64::new(0),
            session_counter: AtomicU64::new(0),
            subscribers: Mutex::new(Vec::new()),
        }
    }

    /// Start a new session: id increments, seq resets so the next allocated
    /// frame is seq 1. Called once per connect.
    pub fn start_session(&self) -> SessionId {
        let id = self.session_counter.fetch_add(1, Ordering::SeqCst) + 1;
        self.seq.store(0, Ordering::SeqCst);
        self.session.store(id, Ordering::SeqCst);
        id
    }

    pub fn current_session(&self) -> SessionId {
        self.session.load(Ordering::SeqCst)
    }

    /// Allocate a frame (assigns session/seq/timestamps, wraps data in Arc).
    /// Separate from `publish` so the caller can also record the same
    /// seq/session into its own structures (e.g. LogEntry) before fan-out.
    pub fn alloc_frame(&self, dir: Direction, data: Vec<u8>) -> Frame {
        Frame {
            session: self.session.load(Ordering::SeqCst),
            seq: self.seq.fetch_add(1, Ordering::SeqCst) + 1,
            dir,
            t_mono_ns: mono_now_ns(),
            t_wall: Utc::now(),
            data: Arc::from(data.into_boxed_slice()),
        }
    }

    /// Fan out to all live subscribers. Never blocks on I/O; a full queue
    /// drops the OLDEST frame and counts it for `dropped_before`.
    pub fn publish(&self, frame: &Frame) {
        let mut subs = self.subscribers.lock().unwrap();
        subs.retain(|weak| {
            if let Some(shared) = weak.upgrade() {
                let mut st = shared.state.lock().unwrap();
                if st.queue.len() >= shared.queue_frames {
                    st.queue.pop_front();
                    st.dropped += 1;
                }
                st.queue.push_back(frame.clone());
                drop(st);
                shared.cond.notify_one();
                true
            } else {
                false // prune dead subscriptions
            }
        });
    }

    pub fn subscribe(&self, policy: BatchPolicy) -> Subscription {
        let shared = Arc::new(SubscriberShared {
            state: Mutex::new(SubscriberState {
                queue: VecDeque::new(),
                dropped: 0,
            }),
            cond: Condvar::new(),
            queue_frames: policy.queue_frames,
        });
        self.subscribers.lock().unwrap().push(Arc::downgrade(&shared));
        Subscription {
            shared,
            policy,
            // Allow the very first frame to push immediately.
            last_flush: Mutex::new(Instant::now() - policy.min_interval),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fast_policy() -> BatchPolicy {
        BatchPolicy {
            max_delay: Duration::from_millis(5),
            min_interval: Duration::from_millis(2),
            max_bytes: 1024,
            max_frames: 3,
            queue_frames: 4,
        }
    }

    #[test]
    fn seq_is_strictly_monotonic_and_resets_per_session() {
        let bus = FrameBus::new();
        let s1 = bus.start_session();
        let f1 = bus.alloc_frame(Direction::Received, b"a".to_vec());
        let f2 = bus.alloc_frame(Direction::Sent, b"b".to_vec());
        assert_eq!((f1.session, f1.seq), (s1, 1));
        assert_eq!((f2.session, f2.seq), (s1, 2)); // TX/RX share one sequence

        let s2 = bus.start_session();
        assert!(s2 > s1);
        let f3 = bus.alloc_frame(Direction::Received, b"c".to_vec());
        assert_eq!((f3.session, f3.seq), (s2, 1));
    }

    #[test]
    fn lone_frame_pushes_immediately_for_idle_consumer() {
        let bus = FrameBus::new();
        bus.start_session();
        let sub = bus.subscribe(fast_policy());
        bus.publish(&bus.alloc_frame(Direction::Received, b"hi".to_vec()));
        let start = Instant::now();
        let batch = sub.recv_batch().unwrap();
        assert!(start.elapsed() < Duration::from_millis(5));
        assert_eq!(batch.first_seq, 1);
        assert_eq!(batch.frames.len(), 1);
        assert_eq!(batch.dropped_before, 0);
    }

    #[test]
    fn queued_frames_collect_into_one_batch_without_waiting() {
        let bus = FrameBus::new();
        bus.start_session();
        let sub = bus.subscribe(fast_policy());
        for i in 0..3u8 {
            bus.publish(&bus.alloc_frame(Direction::Received, vec![i]));
        }
        // 3 frames queued > lone-frame case: drained as one batch, no delay.
        let batch = sub.recv_batch().unwrap();
        assert_eq!(batch.frames.len(), 3);
        assert_eq!(batch.first_seq, 1);
    }

    #[test]
    fn slow_subscriber_drops_oldest_and_counts_prefix_gap() {
        let bus = FrameBus::new();
        bus.start_session();
        let sub = bus.subscribe(fast_policy()); // queue_frames = 4
        // Publish 6 without draining: frames 1-2 are dropped as oldest.
        for i in 0..6u32 {
            bus.publish(&bus.alloc_frame(Direction::Received, i.to_le_bytes().to_vec()));
        }
        let batch = sub.recv_batch().unwrap();
        assert_eq!(batch.dropped_before, 2);
        assert_eq!(batch.first_seq, 3);
        let seqs: Vec<Seq> = batch.frames.iter().map(|f| f.seq).collect();
        assert_eq!(seqs, vec![3, 4, 5, 6]);
    }

    #[test]
    fn recv_batch_times_out_when_quiet() {
        let bus = FrameBus::new();
        bus.start_session();
        let sub = bus.subscribe(fast_policy());
        let start = Instant::now();
        assert!(sub.recv_batch().is_none());
        let elapsed = start.elapsed();
        assert!(elapsed >= Duration::from_millis(5) && elapsed < Duration::from_millis(50));
    }
}
