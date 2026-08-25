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
pub fn simulate_copy() {
    use std::os::raw::c_void;

    // CoreGraphics system framework, no external crate required.
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventCreateKeyboardEvent(
            source: *mut c_void,
            virtual_key: u16,
            key_down: bool,
        ) -> *mut c_void;
        fn CGEventSetFlags(event: *mut c_void, flags: u64);
        fn CGEventPost(tap: u32, event: *mut c_void);
        fn CFRelease(cf: *mut c_void);
    }

    const K_CG_HID_EVENT_TAP: u32 = 0;
    const K_CG_EVENT_FLAG_MASK_COMMAND: u64 = 1 << 20; // kCGEventFlagMaskCommand
    const K_VK_ANSI_C: u16 = 8; // kVK_ANSI_C

    unsafe {
        let key_down = CGEventCreateKeyboardEvent(std::ptr::null_mut(), K_VK_ANSI_C, true);
        let key_up = CGEventCreateKeyboardEvent(std::ptr::null_mut(), K_VK_ANSI_C, false);

        if key_down.is_null() || key_up.is_null() {
            if !key_down.is_null() {
                CFRelease(key_down);
            }
            if !key_up.is_null() {
                CFRelease(key_up);
            }
            eprintln!("Failed to create CGEvent for copy simulation.");
            return;
        }

        // Explicitly set only the Command flag so physically-held shortcut
        // modifiers (e.g. Option from Alt+Q) won't turn ⌘C into ⌥⌘C.
        CGEventSetFlags(key_down, K_CG_EVENT_FLAG_MASK_COMMAND);
        CGEventSetFlags(key_up, K_CG_EVENT_FLAG_MASK_COMMAND);

        CGEventPost(K_CG_HID_EVENT_TAP, key_down);
        CGEventPost(K_CG_HID_EVENT_TAP, key_up);

        CFRelease(key_down);
        CFRelease(key_up);
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn simulate_copy() {
    // Linux / other platforms placeholder
    eprintln!("Clipboard copy simulation is not implemented for this platform yet.");
}
