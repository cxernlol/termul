//! The orchestrated child's two sinks: the filter that keeps the child
//! invisible as a chat while its re-addressed traffic reaches the real
//! sinks, and the watcher that feeds the run's state and capture.

use std::sync::Arc;

use crate::acp::events;
use crate::acp::orchestrator::engine::OrchestratorEngine;
use crate::acp::orchestrator::run::{RunCapture, RunId};
use crate::web::sink::{AcpEvent, EventSink};
use crate::web::WsRelaySink;

/// Forwards only events addressed to the root chat; drops everything else
/// (the child's own `session_created`, agent-level events). This is what
/// keeps the child invisible as a chat while its re-addressed transcript,
/// permission cards, questions and elicitations reach the renderers and
/// persistence exactly like a native subagent's.
pub(crate) struct RerouteFilter {
    root: String,
    sinks: Vec<Arc<dyn EventSink>>,
}

impl RerouteFilter {
    pub(crate) fn new(root: String, sinks: Vec<Arc<dyn EventSink>>) -> Self {
        Self { root, sinks }
    }
}

impl EventSink for RerouteFilter {
    fn emit(&self, event: &AcpEvent) {
        if event.sid.as_deref() != Some(self.root.as_str()) {
            return;
        }
        for sink in &self.sinks {
            sink.emit(event);
        }
    }

    fn note_session_registered(&self, session_id: &str) {
        if session_id == self.root {
            for sink in &self.sinks {
                sink.note_session_registered(session_id);
            }
        }
    }

    fn as_ws_relay(&self) -> Option<&WsRelaySink> {
        self.sinks.iter().find_map(|sink| sink.as_ws_relay())
    }
}

/// Feeds the run: counts tool calls, keeps the child's last agent-role text
/// (tail-capped), and mirrors the permission fork into the
/// ledger's `awaiting_permission` flag. The child's death is not watched
/// here: the driver teardown drops the prompt reply, which the supervision
/// task turns into a Failed settle.
pub(crate) struct RunWatcher {
    engine: Arc<OrchestratorEngine>,
    run: RunId,
    /// The dispatch id this run's chunks carry; nested children carry their
    /// own.
    dispatch: String,
    pub(crate) capture: Arc<RunCapture>,
}

impl RunWatcher {
    pub(crate) fn new(
        engine: Arc<OrchestratorEngine>,
        run: RunId,
        capture: Arc<RunCapture>,
    ) -> Self {
        let dispatch = run.dispatch_id();
        Self {
            engine,
            run,
            dispatch,
            capture,
        }
    }
}

impl EventSink for RunWatcher {
    fn emit(&self, event: &AcpEvent) {
        match event.type_ {
            events::EVENT_PERMISSION_REQUEST => {
                self.engine.note_permission(&self.run, true);
            }
            events::EVENT_MESSAGE_CHUNK => {
                let payload = &event.payload;
                let is_child_text = payload["role"] == "agent"
                    && payload["content"]["type"] == "text"
                    && payload["parentToolCallId"] == self.dispatch.as_str();
                if is_child_text {
                    if let Some(text) = payload["content"]["text"].as_str() {
                        self.capture.note_chunk(text);
                    }
                }
                self.engine.note_permission(&self.run, false);
            }
            events::EVENT_TOOL_CALL => {
                self.capture.note_tool_call();
                self.engine.note_permission(&self.run, false);
            }
            events::EVENT_USAGE_UPDATE | events::EVENT_TOOL_CALL_UPDATE => {
                self.engine.note_permission(&self.run, false);
            }
            _ => {}
        }
    }
}
