//! Python backend (FastAPI) sidecar supervisor.
//!
//! Spawns the backend in dev mode via a local Python interpreter running
//! `backend/main.py`, or in production via a bundled `firstpass-backend`
//! binary next to the executable. Guarantees the child is terminated when
//! the app exits so the API port is never left orphaned.

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Shared handle to the running backend child process.
pub type SharedChild = Arc<Mutex<Option<Child>>>;

/// Generate a cryptographically random 32-byte hex session token.
pub fn generate_token() -> String {
    use rand::RngCore;
    use std::fmt::Write as _;

    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let mut token = String::with_capacity(64);
    for b in bytes {
        let _ = write!(token, "{b:02x}");
    }
    token
}

/// `~/.firstpass` directory.
pub fn firstpass_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".firstpass"))
}

/// Path of the persisted session token file.
pub fn session_token_path() -> Option<PathBuf> {
    firstpass_dir().map(|d| d.join(".session_token"))
}

/// Path of the application log file.
pub fn log_file_path() -> Option<PathBuf> {
    firstpass_dir().map(|d| d.join("app.log"))
}

/// Persist the session token with owner-only permissions (0600 on Unix).
pub fn persist_token(token: &str) -> std::io::Result<PathBuf> {
    let path = session_token_path().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "home directory not found",
        )
    })?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut opts = std::fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true).mode(0o600);
        std::io::Write::write_all(&mut opts.open(&path)?, token.as_bytes())?;
    }
    #[cfg(not(unix))]
    {
        std::fs::write(&path, token.as_bytes())?;
    }
    Ok(path)
}

/// Candidate interpreter paths (relative to the workspace root) in dev mode.
#[cfg(windows)]
fn dev_python_candidates() -> Vec<PathBuf> {
    vec![
        Path::new(".venv").join("Scripts").join("python.exe"),
        Path::new(".venv-build")
            .join("Scripts")
            .join("python.exe"),
    ]
}

/// Candidate interpreter paths (relative to the workspace root) in dev mode.
#[cfg(not(windows))]
fn dev_python_candidates() -> Vec<PathBuf> {
    vec![
        PathBuf::from(".venv/bin/python"),
        PathBuf::from(".venv-build/bin/python"),
        PathBuf::from("backend/.venv/bin/python"),
    ]
}

/// System interpreter used when no workspace virtualenv is found.
#[cfg(windows)]
fn dev_fallback_interpreter() -> String {
    "python.exe".to_string()
}

/// System interpreter used when no workspace virtualenv is found.
#[cfg(not(windows))]
fn dev_fallback_interpreter() -> String {
    "python3".to_string()
}

/// Bundled sidecar binary names to look for in production.
#[cfg(windows)]
const PROD_BINARY_NAMES: [&str; 2] = ["firstpass-backend.exe", "photo-culler-backend.exe"];

/// Bundled sidecar binary names to look for in production.
#[cfg(not(windows))]
const PROD_BINARY_NAMES: [&str; 2] = ["firstpass-backend", "photo-culler-backend"];

/// Walk up from `start` looking for `relative`, returning the first hit.
fn find_in_ancestors(start: &Path, relative: &Path) -> Option<PathBuf> {
    let mut dir = Some(start);
    for _ in 0..6 {
        let current = dir?;
        let candidate = current.join(relative);
        if candidate.is_file() {
            return Some(candidate);
        }
        dir = current.parent();
    }
    None
}

/// Directories to start the upward search from (cwd and executable dir).
fn search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            roots.push(parent.to_path_buf());
        }
    }
    roots
}

fn not_found(what: &str) -> std::io::Error {
    std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!("{what} not found"),
    )
}

/// Spawn the backend sidecar for the current build mode.
pub fn spawn_backend(token: &str, resource_dir: Option<&Path>) -> std::io::Result<Child> {
    if cfg!(debug_assertions) {
        spawn_dev_backend(token)
    } else {
        spawn_prod_backend(token, resource_dir)
    }
}

/// Dev mode: run `backend/main.py` with a workspace or system interpreter.
fn spawn_dev_backend(token: &str) -> std::io::Result<Child> {
    let roots = search_roots();
    let script = roots
        .iter()
        .find_map(|root| find_in_ancestors(root, Path::new("backend/main.py")))
        .ok_or_else(|| not_found("backend/main.py"))?;
    let python = roots
        .iter()
        .find_map(|root| {
            dev_python_candidates()
                .into_iter()
                .find_map(|candidate| find_in_ancestors(root, &candidate))
        })
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(dev_fallback_interpreter);
    Command::new(python)
        .arg(script)
        .env("PYTHONUNBUFFERED", "1")
        .env("FIRSTPASS_API_KEY", token)
        .stdin(Stdio::null())
        .spawn()
}

/// Production mode: run the bundled sidecar binary next to the executable.
fn spawn_prod_backend(token: &str, resource_dir: Option<&Path>) -> std::io::Result<Child> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            dirs.push(parent.to_path_buf());
            // macOS .app bundle: the executable lives in Contents/MacOS while
            // bundled resources live in Contents/Resources.
            if let Some(grandparent) = parent.parent() {
                dirs.push(grandparent.join("Resources"));
            }
        }
    }
    if let Some(dir) = resource_dir {
        dirs.push(dir.to_path_buf());
    }
    for dir in &dirs {
        for name in PROD_BINARY_NAMES {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Command::new(candidate)
                    .env("PYTHONUNBUFFERED", "1")
                    .env("FIRSTPASS_API_KEY", token)
                    .stdin(Stdio::null())
                    .spawn();
            }
        }
    }
    Err(not_found("firstpass-backend sidecar binary"))
}

/// Terminate the backend child: SIGTERM on Unix, taskkill on Windows,
/// escalating to an unconditional kill if it does not exit promptly.
pub fn shutdown_backend(child: &mut Child) {
    let pid = child.id().to_string();
    #[cfg(unix)]
    {
        let _ = Command::new("kill").arg("-TERM").arg(&pid).status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid, "/T", "/F"])
            .status();
    }
    for _ in 0..20 {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(_) => break,
        }
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// Take and shut down the shared backend child, if still running.
pub fn shutdown_shared(child: &SharedChild) {
    if let Ok(mut guard) = child.lock() {
        if let Some(mut process) = guard.take() {
            shutdown_backend(&mut process);
        }
    }
}
