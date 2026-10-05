use std::io::Read;

use serde::Deserialize;

#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;

pub const MAX_TEXT_BYTES: usize = 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum WriteError {
    #[error("BOUNDED_FILE_WRITE_FAILED")]
    Failed,
    #[error("BOUNDED_FILE_CONFLICT")]
    Conflict,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WriteRequest<Data = String> {
    pub root: String,
    pub path: String,
    pub expected: Data,
    pub content: Data,
}

const MAX_BINARY_BYTES: usize = 64 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BinaryHeader {
    root: String,
    path: String,
    expected_size: usize,
    content_size: usize,
}

pub fn run_binary(mut input: impl Read) -> Result<(), WriteError> {
    let mut prefix = [0u8; 4];
    input.read_exact(&mut prefix).map_err(|_| WriteError::Failed)?;
    let header_size = u32::from_le_bytes(prefix) as usize;
    if header_size == 0 || header_size > 32 * 1024 {
        return Err(WriteError::Failed);
    }
    let mut header = vec![0u8; header_size];
    input.read_exact(&mut header).map_err(|_| WriteError::Failed)?;
    let header: BinaryHeader = serde_json::from_slice(&header).map_err(|_| WriteError::Failed)?;
    if header.expected_size > MAX_BINARY_BYTES || header.content_size > MAX_BINARY_BYTES {
        return Err(WriteError::Failed);
    }
    let mut expected = vec![0u8; header.expected_size];
    let mut content = vec![0u8; header.content_size];
    input.read_exact(&mut expected).map_err(|_| WriteError::Failed)?;
    input.read_exact(&mut content).map_err(|_| WriteError::Failed)?;
    if input.read(&mut [0u8; 1]).map_err(|_| WriteError::Failed)? != 0 {
        return Err(WriteError::Failed);
    }
    write_bytes(&WriteRequest { root: header.root, path: header.path, expected: expected.as_slice(), content: content.as_slice() })
}

pub fn run(input: impl Read) -> Result<(), WriteError> {
    let mut bytes = Vec::new();
    input
        .take(16 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| WriteError::Failed)?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err(WriteError::Failed);
    }
    let request: WriteRequest = serde_json::from_slice(&bytes).map_err(|_| WriteError::Failed)?;
    write(&request)
}

pub fn write(request: &WriteRequest) -> Result<(), WriteError> {
    if request.expected.len() > MAX_TEXT_BYTES || request.content.len() > MAX_TEXT_BYTES {
        return Err(WriteError::Failed);
    }
    write_bytes(&WriteRequest { root: request.root.clone(), path: request.path.clone(), expected: request.expected.as_bytes(), content: request.content.as_bytes() })
}

fn write_bytes(request: &WriteRequest<&[u8]>) -> Result<(), WriteError> {
    #[cfg(unix)]
    return unix::write(request);
    #[cfg(windows)]
    return windows::write(request);
    #[cfg(not(any(unix, windows)))]
    Err(WriteError::Failed)
}

fn check_content(file: &std::fs::File, expected: &[u8]) -> Result<(), WriteError> {
    let metadata = file.metadata().map_err(|_| WriteError::Failed)?;
    if !metadata.is_file() || metadata.len() > MAX_BINARY_BYTES as u64 {
        return Err(WriteError::Failed);
    }
    let mut bytes = Vec::new();
    file.take(MAX_BINARY_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| WriteError::Failed)?;
    if bytes != expected {
        return Err(WriteError::Conflict);
    }
    Ok(())
}
