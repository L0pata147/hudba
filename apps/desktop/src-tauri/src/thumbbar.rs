//! Windows taskbar thumbnail toolbar: Previous / Play-Pause / Next buttons under the
//! window's taskbar preview. Clicks go to the web layer as the same "tray" event the
//! tray menu uses.

use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU32, Ordering};
use std::sync::OnceLock;

use tauri::{AppHandle, Emitter, WebviewWindow};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::UI::Shell::{
    DefSubclassProc, ITaskbarList3, SetWindowSubclass, TaskbarList, THBF_ENABLED, THB_FLAGS, THB_ICON, THB_TOOLTIP, THUMBBUTTON,
};
use windows::Win32::UI::WindowsAndMessaging::{CreateIcon, GetSystemMetrics, RegisterWindowMessageW, HICON, SM_CXSMICON, WM_COMMAND};

/// Notification code of a thumbnail button click (HIWORD of WM_COMMAND's wParam).
const THBN_CLICKED: usize = 0x1800;
const ID_PREVIOUS: u32 = 1;
const ID_PLAY: u32 = 2;
const ID_NEXT: u32 = 3;

static APP: OnceLock<AppHandle> = OnceLock::new();
static HWND_MAIN: AtomicIsize = AtomicIsize::new(0);
/// The buttons can be added only once per taskbar button; afterwards they are updated.
static ADDED: AtomicBool = AtomicBool::new(false);
static PLAYING: AtomicBool = AtomicBool::new(false);
/// "TaskbarButtonCreated": sent when Explorer (re)creates the window's taskbar button.
static TASKBAR_CREATED: AtomicU32 = AtomicU32::new(0);
/// previous, play, pause, next
static ICONS: OnceLock<[isize; 4]> = OnceLock::new();

#[derive(Clone, Copy)]
enum Glyph {
    Previous,
    Play,
    Pause,
    Next,
}

/// Is (x, y) — in 0…1 icon space — inside the glyph?
fn inside(glyph: Glyph, x: f32, y: f32) -> bool {
    let tri = |ax: f32, ay: f32, bx: f32, by: f32, cx: f32, cy: f32| {
        let s = |px: f32, py: f32, qx: f32, qy: f32| (x - qx) * (py - qy) - (px - qx) * (y - qy);
        let (d1, d2, d3) = (s(ax, ay, bx, by), s(bx, by, cx, cy), s(cx, cy, ax, ay));
        !((d1 < 0.0 || d2 < 0.0 || d3 < 0.0) && (d1 > 0.0 || d2 > 0.0 || d3 > 0.0))
    };
    let rect = |x0: f32, y0: f32, x1: f32, y1: f32| x >= x0 && x <= x1 && y >= y0 && y <= y1;
    match glyph {
        Glyph::Play => tri(0.26, 0.15, 0.26, 0.85, 0.86, 0.5),
        Glyph::Pause => rect(0.22, 0.17, 0.42, 0.83) || rect(0.58, 0.17, 0.78, 0.83),
        Glyph::Previous => rect(0.16, 0.2, 0.3, 0.8) || tri(0.84, 0.2, 0.84, 0.8, 0.32, 0.5),
        Glyph::Next => rect(0.7, 0.2, 0.84, 0.8) || tri(0.16, 0.2, 0.16, 0.8, 0.68, 0.5),
    }
}

/// A white anti-aliased glyph as an icon (4×4 supersampling, 32-bit BGRA with alpha).
fn make_icon(glyph: Glyph, size: i32) -> Option<HICON> {
    let n = size.max(16) as usize;
    let mut bgra = vec![0u8; n * n * 4];
    for py in 0..n {
        for px in 0..n {
            let mut hits = 0u32;
            for sy in 0..4 {
                for sx in 0..4 {
                    let x = (px as f32 + (sx as f32 + 0.5) / 4.0) / n as f32;
                    let y = (py as f32 + (sy as f32 + 0.5) / 4.0) / n as f32;
                    hits += inside(glyph, x, y) as u32;
                }
            }
            let a = (hits * 255 / 16) as u8;
            let i = (py * n + px) * 4;
            // premultiplied white
            bgra[i..i + 4].copy_from_slice(&[a, a, a, a]);
        }
    }
    // AND mask: all zero (opacity comes from the alpha channel); rows padded to 16 bits
    let mask = vec![0u8; n.div_ceil(16) * 2 * n];
    unsafe { CreateIcon(None, n as i32, n as i32, 1, 32, mask.as_ptr(), bgra.as_ptr()).ok() }
}

fn tip(text: &str) -> [u16; 260] {
    let mut out = [0u16; 260];
    for (i, c) in text.encode_utf16().take(259).enumerate() {
        out[i] = c;
    }
    out
}

/// Adds the buttons, or updates them (Play ↔ Pause) once added.
fn apply(hwnd: HWND) {
    let Some(icons) = ICONS.get() else { return };
    let playing = PLAYING.load(Ordering::Relaxed);
    let button = |id: u32, icon: isize, text: &str| THUMBBUTTON {
        dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS,
        iId: id,
        hIcon: HICON(icon as _),
        szTip: tip(text),
        dwFlags: THBF_ENABLED,
        ..Default::default()
    };
    let buttons = [
        button(ID_PREVIOUS, icons[0], "Previous"),
        if playing { button(ID_PLAY, icons[2], "Pause") } else { button(ID_PLAY, icons[1], "Play") },
        button(ID_NEXT, icons[3], "Next"),
    ];
    unsafe {
        let Ok(taskbar) = CoCreateInstance::<_, ITaskbarList3>(&TaskbarList, None, CLSCTX_INPROC_SERVER) else { return };
        if taskbar.HrInit().is_err() {
            return;
        }
        if ADDED.load(Ordering::Relaxed) {
            let _ = taskbar.ThumbBarUpdateButtons(hwnd, &buttons);
        } else if taskbar.ThumbBarAddButtons(hwnd, &buttons).is_ok() {
            ADDED.store(true, Ordering::Relaxed);
        }
    }
}

unsafe extern "system" fn subclass_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, _data: usize) -> LRESULT {
    if msg == WM_COMMAND && (wparam.0 >> 16) & 0xffff == THBN_CLICKED {
        let action = match (wparam.0 & 0xffff) as u32 {
            ID_PREVIOUS => Some("previous"),
            ID_PLAY => Some("play"),
            ID_NEXT => Some("next"),
            _ => None,
        };
        if let (Some(action), Some(app)) = (action, APP.get()) {
            let _ = app.emit("tray", action.to_string());
            return LRESULT(0);
        }
    }
    let created = TASKBAR_CREATED.load(Ordering::Relaxed);
    if created != 0 && msg == created {
        // a new taskbar button (first show, shown again from the tray, Explorer restarted)
        ADDED.store(false, Ordering::Relaxed);
        apply(hwnd);
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

/// Installs the thumbnail buttons on the main window. Call once from setup (main thread).
pub fn install(app: &AppHandle, window: &WebviewWindow) {
    let Ok(raw) = window.hwnd() else { return };
    let hwnd = HWND(raw.0 as _);
    let _ = APP.set(app.clone());
    HWND_MAIN.store(hwnd.0 as isize, Ordering::Relaxed);
    let size = unsafe { GetSystemMetrics(SM_CXSMICON) };
    let icons = [Glyph::Previous, Glyph::Play, Glyph::Pause, Glyph::Next].map(|g| make_icon(g, size).map(|i| i.0 as isize).unwrap_or(0));
    let _ = ICONS.set(icons);
    unsafe {
        TASKBAR_CREATED.store(RegisterWindowMessageW(w!("TaskbarButtonCreated")), Ordering::Relaxed);
        let _ = SetWindowSubclass(hwnd, Some(subclass_proc), 0x0E57, 0);
    }
    // the taskbar button may already exist
    apply(hwnd);
}

/// Shows Play or Pause on the middle button.
pub fn set_playing(app: &AppHandle, playing: bool) {
    if PLAYING.swap(playing, Ordering::Relaxed) == playing {
        return;
    }
    let _ = app.run_on_main_thread(|| {
        let raw = HWND_MAIN.load(Ordering::Relaxed);
        if raw != 0 && ADDED.load(Ordering::Relaxed) {
            apply(HWND(raw as _));
        }
    });
}
