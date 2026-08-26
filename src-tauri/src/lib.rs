use tauri::{Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

mod keyboard;

use std::sync::atomic::AtomicBool;

struct AppState {
    is_config_mode: AtomicBool,
}

#[tauri::command]
fn set_config_mode(state: tauri::State<'_, AppState>, active: bool) {
    state.is_config_mode.store(active, std::sync::atomic::Ordering::Relaxed);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(AppState { is_config_mode: AtomicBool::new(true) })
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let ctrl_shift_a =
                            Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyA);
                        let alt_q = Shortcut::new(Some(Modifiers::ALT), Code::KeyQ);

                        if shortcut == &ctrl_shift_a || shortcut == &alt_q {
                            // 1. Read old clipboard content
                            let old_text = app.clipboard().read_text().unwrap_or_default();

                            // 2. Simulate Copy
                            keyboard::simulate_copy();

                            // 3. Poll for clipboard update (up to 400ms timeout, 30ms polling interval)
                            let mut text = old_text.clone();
                            let start_time = std::time::Instant::now();
                            let timeout = std::time::Duration::from_millis(400);
                            let poll_interval = std::time::Duration::from_millis(30);

                            while start_time.elapsed() < timeout {
                                std::thread::sleep(poll_interval);
                                if let Ok(current_text) = app.clipboard().read_text() {
                                    if current_text != old_text {
                                        text = current_text;
                                        break;
                                    }
                                }
                            }

                            // 4. Get cursor position
                            if let Ok(cursor_pos) = app.cursor_position() {
                                if let Some(window) = app.get_webview_window("main") {
                                    // Default positioning targets (offset below and to the right)
                                    let mut target_x = cursor_pos.x as i32 + 10;
                                    let mut target_y = cursor_pos.y as i32 + 10;

                                    // Get current window size (fallback to default config dimensions if error)
                                    let win_size =
                                        window.outer_size().unwrap_or(tauri::PhysicalSize {
                                            width: 450,
                                            height: 600,
                                        });

                                    // Get current monitor details for boundary checks
                                    if let Ok(Some(monitor)) = window.current_monitor() {
                                        let monitor_pos = monitor.position();
                                        let monitor_size = monitor.size();

                                        let monitor_right =
                                            monitor_pos.x + monitor_size.width as i32;
                                        let monitor_bottom =
                                            monitor_pos.y + monitor_size.height as i32;

                                        // If window would overflow the right edge, shift to the left of the cursor
                                        if target_x + win_size.width as i32 > monitor_right {
                                            target_x =
                                                cursor_pos.x as i32 - win_size.width as i32 - 10;
                                        }
                                        // If window would overflow the bottom edge, shift to above the cursor
                                        if target_y + win_size.height as i32 > monitor_bottom {
                                            target_y =
                                                cursor_pos.y as i32 - win_size.height as i32 - 10;
                                        }

                                        // Safety clamp: Ensure we don't overflow the left or top bounds of the monitor
                                        if target_x < monitor_pos.x {
                                            target_x = monitor_pos.x;
                                        }
                                        if target_y < monitor_pos.y {
                                            target_y = monitor_pos.y;
                                        }
                                    }

                                    let _ = window.set_position(tauri::Position::Physical(
                                        tauri::PhysicalPosition {
                                            x: target_x,
                                            y: target_y,
                                        },
                                    ));

                                    // 6. Show and focus window
                                    let _ = window.show();
                                    let _ = window.set_focus();

                                    // 7. Emit text to frontend, plus whether the
                                    // simulated copy actually updated the clipboard
                                    let _ = window.emit("capture-status", text != old_text);
                                    let _ = window.emit("selection-captured", text);
                                }
                            }
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Register shortcut(s)
            let ctrl_shift_a =
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyA);
            let alt_q = Shortcut::new(Some(Modifiers::ALT), Code::KeyQ);

            // Try to register Alt+Q, fallback to Ctrl+Shift+A if it fails
            if let Err(e) = app.global_shortcut().register(alt_q) {
                eprintln!(
                    "Failed to register Alt+Q shortcut: {:?}, trying Ctrl+Shift+A",
                    e
                );
                if let Err(e2) = app.global_shortcut().register(ctrl_shift_a) {
                    eprintln!("Failed to register Ctrl+Shift+A shortcut: {:?}", e2);
                }
            } else {
                println!("Successfully registered Alt+Q shortcut!");
            }

            // Set up main window event listener to hide on focus loss (blur)
            if let Some(window) = app.get_webview_window("main") {
                let w_clone = window.clone();
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(focused) = event {
                        if !*focused {
                            let state = app_handle.state::<AppState>();
                            let is_config = state.is_config_mode.load(std::sync::atomic::Ordering::Relaxed);
                            if !is_config {
                                let _ = w_clone.hide();
                            }
                        }
                    }
                });
            }

            // Tray icon: left-click shows the main window,
            // right-click menu offers Show / Quit.
            {
                use tauri::{
                    menu::{Menu, MenuItem},
                    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
                };

                let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show, &quit])?;

                TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("CodeToChinese")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![set_config_mode])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // macOS: show the main window when the Dock icon is clicked
        if let tauri::RunEvent::Reopen { .. } = event {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });
}
