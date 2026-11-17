//! Window chrome controls the renderer drives at run time.
//!
//! Collapsed Rail: the macOS traffic lights hide while the Rail is collapsed
//! and show again when it expands. Tauri 2 has no public API for
//! this, so the command calls AppKit (`-[NSWindow standardWindowButton:]`,
//! `-[NSView setHidden:]`) on the main thread. Other platforms draw their own
//! window controls in the renderer, so the command does nothing there.

/// `NSWindowCloseButton`, `NSWindowMiniaturizeButton`, `NSWindowZoomButton`.
#[cfg(target_os = "macos")]
const TRAFFIC_LIGHT_BUTTONS: [usize; 3] = [0, 1, 2];

/// Hides or shows the macOS traffic lights of the calling window.
#[tauri::command]
pub fn set_traffic_lights_hidden(window: tauri::WebviewWindow, hidden: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let ns_window = window.ns_window().map_err(|error| {
            log::warn!("[window-chrome] no NSWindow for traffic lights: {error}");
            error.to_string()
        })? as usize;
        window
            .run_on_main_thread(move || {
                use objc2::msg_send;
                use objc2::runtime::AnyObject;
                let ns_window = ns_window as *mut AnyObject;
                for kind in TRAFFIC_LIGHT_BUTTONS {
                    // SAFETY: `ns_window` is the live NSWindow of this webview
                    // window, used on the main thread. `standardWindowButton:`
                    // returns nil or an NSButton (an NSView).
                    unsafe {
                        let button: *mut AnyObject =
                            msg_send![ns_window, standardWindowButton: kind];
                        if !button.is_null() {
                            let _: () = msg_send![button, setHidden: hidden];
                        }
                    }
                }
            })
            .map_err(|error| {
                log::warn!("[window-chrome] traffic lights update failed: {error}");
                error.to_string()
            })?;
        log::debug!("[window-chrome] traffic lights hidden={hidden}");
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, hidden);
    }
    Ok(())
}
