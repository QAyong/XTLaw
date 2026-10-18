//! Reactor-style entry points for a browser WebAssembly host (Lexora addition, not upstream code; build-wasm.mjs
//! copies it into the engine). The host writes a request line into guest memory, calls `xlsx_handle` and reads
//! back the response line.
use std::cell::RefCell;

use crate::protocol::Engine;

thread_local! {
    static ENGINE: RefCell<Option<Engine>> = const { RefCell::new(None) };
}

#[unsafe(no_mangle)]
pub extern "C" fn xlsx_alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len.max(1));
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

/// # Safety
/// `pointer`/`capacity` must come from `xlsx_alloc` or a `xlsx_handle` result.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn xlsx_free(pointer: *mut u8, capacity: usize) {
    drop(unsafe { Vec::from_raw_parts(pointer, 0, capacity.max(1)) });
}

/// Handles one request line. Returns `(pointer << 32) | length` of a response
/// buffer the host must release with `xlsx_free(pointer, length)`; 0 for no
/// response.
///
/// # Safety
/// `pointer`/`length` must describe a valid UTF-8 request in guest memory.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn xlsx_handle(pointer: *const u8, length: usize) -> u64 {
    let request = unsafe { std::slice::from_raw_parts(pointer, length) };
    let Ok(line) = std::str::from_utf8(request) else {
        return 0;
    };
    let response = ENGINE.with(|cell| {
        let mut slot = cell.borrow_mut();
        slot.get_or_insert_with(Engine::new).handle_line(line)
    });
    let Some(response) = response else { return 0 };
    let mut bytes = response.into_bytes();
    bytes.shrink_to_fit();
    let length = bytes.len();
    let pointer = bytes.as_mut_ptr();
    std::mem::forget(bytes);
    ((pointer as usize as u64) << 32) | length as u64
}
