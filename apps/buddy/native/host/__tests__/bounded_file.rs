#[cfg(test)]
use lexora_buddy_host::file_reader::{ReadError, read_request, run, run_batch};

#[test]
fn accepts_zero_byte_limit() {
    let request =
        read_request(br#"{"root":"C:\\data","path":"C:\\data\\empty","maxBytes":0}"#.as_slice())
            .unwrap();
    assert_eq!(request.max_bytes, 0);
}

#[test]
fn rejects_invalid_or_unbounded_requests_without_output() {
    for input in [
        r#"{"root":"C:\\data","path":"C:\\data\\file","maxBytes":-1}"#,
        r#"{"root":"C:\\data","path":"C:\\data\\file","maxBytes":1.5}"#,
        r#"{"root":"C:\\data","path":"C:\\data\\file","maxBytes":67108865}"#,
        r#"{"root":"C:\\data","path":"C:\\data\\file","maxBytes":0,"command":"whoami"}"#,
        "{}",
    ] {
        let mut output = Vec::new();
        assert!(run(input.as_bytes(), &mut output).is_err());
        assert!(output.is_empty());
    }
}

#[test]
fn errors_do_not_disclose_host_paths() {
    assert_eq!(
        ReadError::ReadFailed.to_string(),
        "BOUNDED_FILE_READ_FAILED"
    );
    assert_eq!(
        ReadError::OutputLimit.to_string(),
        "BOUNDED_FILE_OUTPUT_LIMIT"
    );
    assert_eq!(
        ReadError::Unavailable.to_string(),
        "BOUNDED_FILE_READER_UNAVAILABLE"
    );
}

#[test]
fn rejects_oversized_request() {
    assert!(read_request(vec![b' '; 256 * 1024 + 1].as_slice()).is_err());
}

#[test]
fn rejects_unbounded_batches_before_writing_output() {
    let request = r#"{"root":"/data","path":"/data/file","maxBytes":262144}"#;
    let too_many = format!("[{}]", vec![request; 65].join(","));
    for input in [
        too_many.as_str(),
        r#"[{"root":"/data","path":"/data/file","maxBytes":16777217}]"#,
        r#"[{"root":"/data","path":"/data/file","maxBytes":10000000},{"root":"/data","path":"/data/file","maxBytes":10000000}]"#,
        r#"[{"root":"/data","path":"/data/file","maxBytes":1,"command":"extra"}]"#,
    ] {
        let mut output = Vec::new();
        assert!(run_batch(input.as_bytes(), &mut output).is_err());
        assert!(output.is_empty());
    }
}

#[test]
fn batch_frames_preserve_binary_bytes_empty_files_and_individual_failures() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().canonicalize().unwrap();
    std::fs::write(root.join("binary"), [0, 255, 10]).unwrap();
    std::fs::write(root.join("empty"), []).unwrap();
    let input = serde_json::to_vec(&serde_json::json!([
        {"root": root, "path": root.join("binary"), "maxBytes": 3},
        {"root": root, "path": root.join("missing"), "maxBytes": 3},
        {"root": root, "path": root.join("binary"), "maxBytes": 2},
        {"root": root, "path": root.join("empty"), "maxBytes": 0},
    ]))
    .unwrap();
    let mut output = Vec::new();
    run_batch(input.as_slice(), &mut output).unwrap();
    assert_eq!(
        output,
        [
            0, 0, 0, 0, 3, 0, 255, 10, 1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0
        ]
    );
}
