use super::MAX_REGISTRY_BODY_BYTES;

const ONE_AGENT_REGISTRY: &str =
    r#"{"agents":[{"id":"local-agent","distribution":{"npx":{"package":"local@1.0.0"}}}]}"#;

fn padded_registry_body(len: usize) -> axum::body::Body {
    let prefix = r#"{"agents":[],"pad":""#;
    let suffix = r#""}"#;
    let mut body = Vec::with_capacity(len);
    body.extend_from_slice(prefix.as_bytes());
    body.resize(len - suffix.len(), b'x');
    body.extend_from_slice(suffix.as_bytes());
    let chunks: Vec<Result<Vec<u8>, std::io::Error>> = body
        .chunks(64 * 1024)
        .map(|chunk| Ok(chunk.to_vec()))
        .collect();
    axum::body::Body::from_stream(futures_util::stream::iter(chunks))
}

/// Serves `/plain.json`, `/redirect.json` (307 to the plain route over http),
/// `/at-cap.json` and `/over-cap.json`, and returns the origin.
pub(crate) async fn serve_registry_routes() -> String {
    use axum::routing::get;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let plain_url = format!("{base}/plain.json");
    let app = axum::Router::new()
        .route("/plain.json", get(|| async { ONE_AGENT_REGISTRY }))
        .route(
            "/redirect.json",
            get(move || async move { axum::response::Redirect::temporary(&plain_url) }),
        )
        .route(
            "/at-cap.json",
            get(|| async { padded_registry_body(MAX_REGISTRY_BODY_BYTES) }),
        )
        .route(
            "/over-cap.json",
            get(|| async { padded_registry_body(MAX_REGISTRY_BODY_BYTES + 1) }),
        );
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    base
}

/// Serves the one-agent registry at `/counted.json`, returning its URL and the
/// number of requests it has answered.
pub(crate) async fn serve_counted_registry() -> (
    String,
    std::sync::Arc<std::sync::atomic::AtomicUsize>,
) {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    let requests = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&requests);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/counted.json", listener.local_addr().unwrap());
    let app = axum::Router::new().route(
        "/counted.json",
        axum::routing::get(move || {
            counter.fetch_add(1, Ordering::SeqCst);
            async { ONE_AGENT_REGISTRY }
        }),
    );
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    (url, requests)
}
