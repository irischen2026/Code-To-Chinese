#[cfg(target_os = "windows")]
pub fn simulate_copy() {
    use std::mem::size_of;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_CONTROL, VK_MENU,
        VK_SHIFT, VK_SPACE,
    };

    unsafe {
        // Prepare keyboard inputs:
        // 1-3. Release Alt, Shift, Space (if physically held down due to shortcut)
        // 4. Ctrl Down
        // 5. C Down
        // 6. C Up
        // 7. Ctrl Up
        let mut inputs: [INPUT; 7] = std::mem::zeroed();

        // 1. Release Alt (VK_MENU)
        inputs[0].r#type = INPUT_KEYBOARD;
        inputs[0].Anonymous.ki = KEYBDINPUT {
            wVk: VK_MENU,
            wScan: 0,
            dwFlags: KEYEVENTF_KEYUP,
            time: 0,
            dwExtraInfo: 0,
        };

        // 2. Release Shift (VK_SHIFT)
        inputs[1].r#type = INPUT_KEYBOARD;
        inputs[1].Anonymous.ki = KEYBDINPUT {
            wVk: VK_SHIFT,
            wScan: 0,
            dwFlags: KEYEVENTF_KEYUP,
            time: 0,
            dwExtraInfo: 0,
        };

        // 3. Release Space (VK_SPACE)
        inputs[2].r#type = INPUT_KEYBOARD;
        inputs[2].Anonymous.ki = KEYBDINPUT {
            wVk: VK_SPACE,
            wScan: 0,
            dwFlags: KEYEVENTF_KEYUP,
            time: 0,
            dwExtraInfo: 0,
        };

        // 4. Ctrl Down
        inputs[3].r#type = INPUT_KEYBOARD;
        inputs[3].Anonymous.ki = KEYBDINPUT {
            wVk: VK_CONTROL,
            wScan: 0,
            dwFlags: 0,
            time: 0,
            dwExtraInfo: 0,
        };

        // 5. C Down
        inputs[4].r#type = INPUT_KEYBOARD;
        inputs[4].Anonymous.ki = KEYBDINPUT {
            wVk: 0x43, // 'C' key
            wScan: 0,
            dwFlags: 0,
            time: 0,
            dwExtraInfo: 0,
        };

        // 6. C Up
        inputs[5].r#type = INPUT_KEYBOARD;
        inputs[5].Anonymous.ki = KEYBDINPUT {
            wVk: 0x43, // 'C' key
            wScan: 0,
            dwFlags: KEYEVENTF_KEYUP,
            time: 0,
            dwExtraInfo: 0,
        };

        // 7. Ctrl Up
        inputs[6].r#type = INPUT_KEYBOARD;
        inputs[6].Anonymous.ki = KEYBDINPUT {
            wVk: VK_CONTROL,
            wScan: 0,
            dwFlags: KEYEVENTF_KEYUP,
            time: 0,
            dwExtraInfo: 0,
        };

        SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            size_of::<INPUT>() as i32,
        );
    }
}

#[cfg(target_os = "macos")]
pub fn simulate_copy() -> Result<(), String> {
    // System Events keystroke: same Accessibility gate as CGEvent posting,
    // but failures return a real error message instead of dropping events
    // silently.
    const SCRIPT: &str =
        r#"tell application "System Events" to keystroke "c" using command down"#;
    let output = std::process::Command::new("osascript")
        .args(["-e", SCRIPT])
        .output()
        .map_err(|e| format!("failed to spawn osascript: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn simulate_copy() {
    // Linux / other platforms placeholder
    eprintln!("Clipboard copy simulation is not implemented for this platform yet.");
}
