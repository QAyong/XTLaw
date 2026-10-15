use std::{io, process::ExitCode};

fn main() -> ExitCode {
    if std::env::args().nth(1).as_deref() == Some("--save-binary") {
        return match lexora_buddy_host::file_writer::run_binary(io::stdin().lock()) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("{error}");
                ExitCode::FAILURE
            }
        };
    }
    if std::env::args().nth(1).as_deref() == Some("--serve") {
        let Some(directory) = std::env::args_os().nth(2) else {
            return ExitCode::FAILURE;
        };
        return match lexora_buddy_host::file_engine::serve(std::path::Path::new(&directory)) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("{error}");
                ExitCode::FAILURE
            }
        };
    }
    if std::env::args().nth(1).as_deref() == Some("--save-text") {
        return match lexora_buddy_host::file_writer::run(io::stdin().lock()) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("{error}");
                ExitCode::FAILURE
            }
        };
    }
    match lexora_buddy_host::file_reader::run(io::stdin().lock(), io::stdout().lock()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
