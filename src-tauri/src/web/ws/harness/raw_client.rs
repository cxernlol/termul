//! Minimal RFC 6455 client over a raw `TcpStream` for host-level socket tests.
//!
//! The carrier harness ([`super::carrier`]) replaces the wire in-process; this
//! client covers the paths that need a REAL upgraded socket owned by the real
//! `axum::serve` task (host stop). It speaks just enough of
//! the protocol: the handshake and unmasked server frames in.

use std::net::SocketAddr;
use std::time::Duration;

use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

pub(crate) const OP_TEXT: u8 = 0x1;
pub(crate) const OP_CLOSE: u8 = 0x8;

/// Wall-time bound on connecting and completing the upgrade handshake: a
/// stalled host fails the test instead of hanging the run.
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);

pub(crate) struct RawWsClient {
    stream: TcpStream,
}

impl RawWsClient {
    /// Connect and complete the upgrade handshake for `path`, bounded by
    /// [`HANDSHAKE_TIMEOUT`].
    pub(crate) async fn connect(addr: SocketAddr, path: &str) -> Self {
        tokio::time::timeout(HANDSHAKE_TIMEOUT, Self::handshake(addr, path))
            .await
            .expect("upgrade handshake did not complete in time")
    }

    async fn handshake(addr: SocketAddr, path: &str) -> Self {
        let mut stream = TcpStream::connect(addr).await.expect("connect");
        let request = format!(
            "GET {path} HTTP/1.1\r\nHost: {addr}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\
             Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n"
        );
        stream
            .write_all(request.as_bytes())
            .await
            .expect("write upgrade request");
        // Byte-by-byte so no frame bytes past the header terminator are lost.
        let mut headers = Vec::new();
        let mut byte = [0u8; 1];
        loop {
            stream
                .read_exact(&mut byte)
                .await
                .expect("upgrade response");
            headers.push(byte[0]);
            if headers.ends_with(b"\r\n\r\n") {
                break;
            }
            assert!(headers.len() < 8192, "upgrade response too large");
        }
        let headers = String::from_utf8_lossy(&headers);
        assert!(headers.contains(" 101 "), "upgrade must succeed: {headers}");
        Self { stream }
    }

    /// Read one server frame (unmasked) as `(opcode, payload)`; `None` once
    /// the stream ended (EOF or reset).
    pub(crate) async fn read_frame(&mut self) -> Option<(u8, Vec<u8>)> {
        let mut header = [0u8; 2];
        self.stream.read_exact(&mut header).await.ok()?;
        let opcode = header[0] & 0x0f;
        assert_eq!(header[1] & 0x80, 0, "server frames are never masked");
        let mut len = u64::from(header[1] & 0x7f);
        if len == 126 {
            let mut ext = [0u8; 2];
            self.stream.read_exact(&mut ext).await.ok()?;
            len = u64::from(u16::from_be_bytes(ext));
        } else if len == 127 {
            let mut ext = [0u8; 8];
            self.stream.read_exact(&mut ext).await.ok()?;
            len = u64::from_be_bytes(ext);
        }
        let mut payload = vec![0u8; len as usize];
        self.stream.read_exact(&mut payload).await.ok()?;
        Some((opcode, payload))
    }

    /// Next text frame as JSON, skipping control frames. `None` when the
    /// server closed (a `Close` frame, or EOF).
    pub(crate) async fn read_json(&mut self) -> Option<Value> {
        loop {
            match self.read_frame().await? {
                (OP_TEXT, payload) => return serde_json::from_slice(&payload).ok(),
                (OP_CLOSE, _) => return None,
                _ => {}
            }
        }
    }

    /// `read_json`, bounded by `timeout` of wall time. `Err(())` means no
    /// frame arrived within the window.
    pub(crate) async fn read_json_within(
        &mut self,
        timeout: Duration,
    ) -> Result<Option<Value>, ()> {
        tokio::time::timeout(timeout, self.read_json())
            .await
            .map_err(|_| ())
    }

    /// Read frames until the server's `Close`; returns its status code. `None`
    /// when the stream ended without a `Close` frame (EOF / reset).
    pub(crate) async fn read_until_close(&mut self) -> Option<u16> {
        loop {
            let (opcode, payload) = self.read_frame().await?;
            if opcode == OP_CLOSE {
                return (payload.len() >= 2).then(|| u16::from_be_bytes([payload[0], payload[1]]));
            }
        }
    }

    /// `read_until_close`, bounded by `timeout` of wall time. `Err(())` means
    /// the server neither closed nor reset within the window.
    pub(crate) async fn close_code_within(&mut self, timeout: Duration) -> Result<Option<u16>, ()> {
        tokio::time::timeout(timeout, self.read_until_close())
            .await
            .map_err(|_| ())
    }
}
