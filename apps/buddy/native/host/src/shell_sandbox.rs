mod broker;
mod cancellation;
mod filesystem;
mod metadata;
mod network;
mod policy;
mod process;
mod security;
mod setup;

use std::io;

const SERVICE_NAME: &str = "XTLawSandboxNetwork";
const PIPE_NAME: &str = r"\\.\pipe\XTLawSandboxNetwork-v1";
const PROFILE_PREFIX: &str = "XTLaw.Sandbox.";
const PROTOCOL_VERSION: u32 = 1;

pub fn run() -> io::Result<i32> {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    if arguments.len() != 1 {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    match arguments[0].as_str() {
        "run" => process::run(),
        "status" => setup::status(),
        "health" => broker::Lease::health(),
        "setup" => setup::elevate("install"),
        "remove" => setup::elevate("uninstall"),
        "install" => setup::install(),
        "uninstall" => setup::uninstall(),
        "service" => broker::dispatch(),
        _ => Err(io::ErrorKind::InvalidInput.into()),
    }
}

#[cfg(test)]
mod isolation_tests {
    #[test]
    fn identities_do_not_reuse_lexora_service_or_container_names() {
        assert_eq!(super::SERVICE_NAME, "XTLawSandboxNetwork");
        assert_eq!(super::PIPE_NAME, r"\\.\pipe\XTLawSandboxNetwork-v1");
        assert_eq!(super::PROFILE_PREFIX, "XTLaw.Sandbox.");
    }
}
