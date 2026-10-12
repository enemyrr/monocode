//! One-shot shell commands typed as `!<command>` in a session composer.
//!
//! Each run is non-interactive: stdin is closed and stdout and stderr share one
//! stream. Interactive programs belong in a terminal tab.

use std::collections::{HashMap, VecDeque};
use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

const OUTPUT_EVENT: &str = "shell-run-output";
const EXIT_EVENT: &str = "shell-run-exit";
/// Streamed live. Past it, only the last `TAIL_BYTES` are kept.
const HEAD_BYTES: usize = 192 * 1024;
const TAIL_BYTES: usize = 64 * 1024;
const READ_CHUNK: usize = 16 * 1024;
const COALESCE: Duration = Duration::from_millis(16);
const FLUSH_BYTES: usize = 32 * 1024;
/// Chunks waiting for the pump. A full queue blocks the readers, so a flood
/// such as `yes` cannot outgrow memory before the cap applies.
const QUEUE_CHUNKS: usize = 64;
/// A background child can hold the pipe open after the shell exits. Past
/// this grace the rest of the process group is stopped.
const DRAIN_GRACE: Duration = Duration::from_millis(250);
const IDLE_WAIT: Duration = Duration::from_secs(3600);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ShellRunOutput {
    id: String,
    data: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ShellRunExit {
    id: String,
    code: Option<i32>,
    cancelled: bool,
    /// Output kept after the streamed head filled up.
    tail: String,
    dropped_bytes: usize,
}

struct LiveRun {
    pid: u32,
    cancelled: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct ShellRuns {
    runs: Mutex<HashMap<String, LiveRun>>,
}

impl ShellRuns {
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, LiveRun>> {
        self.runs.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub(crate) fn kill_all(&self) {
        let pids: Vec<u32> = self.lock().drain().map(|(_, run)| run.pid).collect();
        crate::harness::terminate_all(&pids);
    }
}

enum Event {
    Data(Vec<u8>),
    Eof,
    Exit(Option<i32>),
}

#[tauri::command]
pub fn shell_run_start(
    app: AppHandle,
    runs: State<ShellRuns>,
    id: String,
    cwd: String,
    command: String,
) -> Result<(), String> {
    let workdir = crate::fs::expand_home(&cwd);
    if !workdir.is_dir() {
        return Err(format!("{cwd} is not a folder"));
    }
    let mut cmd = shell_command(&command);
    cmd.current_dir(&workdir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PATH", crate::harness::gui_search_path())
        .env("TERM", "dumb")
        .env("PAGER", "cat")
        .env("GIT_PAGER", "cat");
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    crate::hide_window_console(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to run command: {e}"))?;
    let pid = child.id();
    let cancelled = Arc::new(AtomicBool::new(false));
    runs.lock().insert(
        id.clone(),
        LiveRun {
            pid,
            cancelled: cancelled.clone(),
        },
    );

    let (tx, rx) = mpsc::sync_channel(QUEUE_CHUNKS);
    let mut readers = 0;
    if let Some(out) = child.stdout.take() {
        spawn_reader(out, tx.clone());
        readers += 1;
    }
    if let Some(err) = child.stderr.take() {
        spawn_reader(err, tx.clone());
        readers += 1;
    }
    thread::spawn(move || {
        let code = child.wait().ok().and_then(|status| status.code());
        let _ = tx.send(Event::Exit(code));
    });
    thread::spawn(move || pump(app, id, pid, rx, readers, cancelled));
    Ok(())
}

#[tauri::command]
pub fn shell_run_cancel(runs: State<ShellRuns>, id: String) -> Result<(), String> {
    if let Some(run) = runs.lock().get(&id) {
        run.cancelled.store(true, Ordering::SeqCst);
        crate::harness::terminate(run.pid);
    }
    Ok(())
}

fn shell_command(command: &str) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into());
        let mut cmd = Command::new(shell);
        cmd.raw_arg(format!("/S /C \"{command}\""));
        cmd
    }
    #[cfg(not(windows))]
    {
        let shell = std::env::var("SHELL")
            .ok()
            .filter(|shell| !shell.is_empty())
            .unwrap_or_else(|| {
                if cfg!(target_os = "macos") {
                    "/bin/zsh".into()
                } else {
                    "/bin/bash".into()
                }
            });
        let login = matches!(
            std::path::Path::new(&shell)
                .file_stem()
                .and_then(|name| name.to_str()),
            Some("zsh" | "bash" | "sh" | "fish")
        );
        let mut cmd = Command::new(&shell);
        if login {
            cmd.arg("-l");
        }
        cmd.arg("-c").arg(command);
        cmd
    }
}

fn spawn_reader(mut source: impl Read + Send + 'static, tx: SyncSender<Event>) {
    thread::spawn(move || {
        let mut buf = vec![0_u8; READ_CHUNK];
        loop {
            match source.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if tx.send(Event::Data(buf[..n].to_vec())).is_err() {
                        return;
                    }
                }
            }
        }
        let _ = tx.send(Event::Eof);
    });
}

fn pump(
    app: AppHandle,
    id: String,
    pid: u32,
    rx: Receiver<Event>,
    mut open: usize,
    cancelled: Arc<AtomicBool>,
) {
    let mut cap = OutputCap::default();
    let mut pending = Vec::new();
    let mut last_emit = Instant::now();
    let mut code = None;
    let mut exited_at: Option<Instant> = None;
    loop {
        let mut wait = IDLE_WAIT;
        if !pending.is_empty() {
            wait = wait.min(COALESCE.saturating_sub(last_emit.elapsed()));
        }
        if let Some(at) = exited_at {
            wait = wait.min(DRAIN_GRACE.saturating_sub(at.elapsed()));
        }
        match rx.recv_timeout(wait) {
            Ok(Event::Data(bytes)) => pending.extend_from_slice(cap.push(&bytes)),
            Ok(Event::Eof) => open = open.saturating_sub(1),
            Ok(Event::Exit(status)) => {
                code = status;
                exited_at = Some(Instant::now());
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
        if !pending.is_empty() && (pending.len() >= FLUSH_BYTES || last_emit.elapsed() >= COALESCE)
        {
            emit_output(&app, &id, take_utf8(&mut pending));
            last_emit = Instant::now();
        }
        if exited_at.is_some_and(|at| open == 0 || at.elapsed() >= DRAIN_GRACE) {
            if open > 0 {
                // Closes the pipes those children hold, so the readers end.
                crate::harness::terminate(pid);
            }
            break;
        }
    }
    emit_output(&app, &id, String::from_utf8_lossy(&pending).into_owned());
    if let Some(runs) = app.try_state::<ShellRuns>() {
        runs.lock().remove(&id);
    }
    let (tail, dropped_bytes) = cap.finish();
    let _ = app.emit(
        EXIT_EVENT,
        ShellRunExit {
            id,
            code,
            cancelled: cancelled.load(Ordering::SeqCst),
            tail,
            dropped_bytes,
        },
    );
}

fn emit_output(app: &AppHandle, id: &str, data: String) {
    if data.is_empty() {
        return;
    }
    let _ = app.emit(
        OUTPUT_EVENT,
        ShellRunOutput {
            id: id.to_string(),
            data,
        },
    );
}

/// Decodes the complete UTF-8 prefix and leaves a split character for later.
fn take_utf8(buf: &mut Vec<u8>) -> String {
    let cut = match std::str::from_utf8(buf) {
        Err(err) if err.error_len().is_none() => err.valid_up_to(),
        _ => buf.len(),
    };
    let text = String::from_utf8_lossy(&buf[..cut]).into_owned();
    buf.drain(..cut);
    text
}

/// The first `HEAD_BYTES` stream live; after that only the last `TAIL_BYTES`
/// survive, and the bytes between them are counted.
#[derive(Default)]
struct OutputCap {
    streamed: usize,
    tail: VecDeque<u8>,
    dropped: usize,
}

impl OutputCap {
    /// Returns the part of `bytes` that still fits in the streamed head.
    fn push<'a>(&mut self, bytes: &'a [u8]) -> &'a [u8] {
        let room = HEAD_BYTES.saturating_sub(self.streamed).min(bytes.len());
        let (head, rest) = bytes.split_at(room);
        self.streamed += head.len();
        self.tail.extend(rest);
        let excess = self.tail.len().saturating_sub(TAIL_BYTES);
        if excess > 0 {
            self.tail.drain(..excess);
            self.dropped += excess;
        }
        head
    }

    fn finish(self) -> (String, usize) {
        let tail: Vec<u8> = self.tail.into();
        (String::from_utf8_lossy(&tail).into_owned(), self.dropped)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_output_streams_whole() {
        let mut cap = OutputCap::default();
        assert_eq!(cap.push(b"hello"), b"hello");
        assert_eq!(cap.finish(), (String::new(), 0));
    }

    #[test]
    fn output_past_the_head_keeps_only_the_tail() {
        let mut cap = OutputCap::default();
        let head = vec![b'a'; HEAD_BYTES - 1];
        assert_eq!(cap.push(&head).len(), HEAD_BYTES - 1);
        assert_eq!(cap.push(b"bc"), b"b");
        assert!(cap.push(b"x").is_empty());
        let filler = vec![b'y'; TAIL_BYTES];
        cap.push(&filler);
        cap.push(b"end");
        let (tail, dropped) = cap.finish();
        assert_eq!(tail.len(), TAIL_BYTES);
        assert!(tail.ends_with("yend"));
        assert_eq!(dropped, 5);
    }

    #[test]
    fn split_utf8_character_waits_for_its_last_byte() {
        let mut buf = "hé".as_bytes()[..2].to_vec();
        assert_eq!(take_utf8(&mut buf), "h");
        buf.push("é".as_bytes()[1]);
        assert_eq!(take_utf8(&mut buf), "é");
        assert!(buf.is_empty());
    }
}
