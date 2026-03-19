use anyhow::Result;
use tracing_subscriber::EnvFilter;

fn main() -> Result<()> {
    // Log to file — never stderr, that would corrupt the TUI
    let file_appender = tracing_appender::rolling::daily("/tmp", "ted.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .with_writer(non_blocking)
        .without_time()
        .init();

    let config = ted_config::Config::load()?;

    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;

    rt.block_on(ted_ui::App::run(config))?;

    Ok(())
}
