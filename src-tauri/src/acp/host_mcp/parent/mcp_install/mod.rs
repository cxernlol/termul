//! Park `mcp_install` until the user approves or declines. The approve path
//! is the catalog form → plan → commit path. Secret values stay in the
//! decision and the stored server; they are not in the tool result or events.

use std::collections::BTreeMap;
use std::future::Future;
use std::sync::Arc;
use std::time::Instant;

mod answer;
#[cfg(test)]
mod test_support;

use serde::Serialize;
use serde_json::{json, Value};
use tokio::sync::mpsc;
use uuid::Uuid;

use super::ask::ask_idle_heartbeat;
use super::HostPlanServer;
use crate::acp::events;
use crate::acp::host_mcp::mcp_install::{
    already_message, catalog_source_name, consent_transport, declined_message, default_inputs,
    find_duplicate, live, new_session_message, oauth_message, probe_config, reason_code,
    runner_of_command, runtime_message, step, stored_entry, tool_result, transport_label,
    HostMcpInstall, LaunchKey, McpInstallDecision, ToolOutcome,
};
use crate::acp::host_mcp::FrameReply;
use crate::mcp_catalog::{
    CommitRequest, ConsentView, FormReply, FormRequest, InstallForm, McpCatalogError,
    McpCatalogReason, PlanCaller, PlanReply, PlanRequest, ResolvedConfig, RunnerAvailability,
};

/// One install waiting on the card.
pub(super) struct OpenMcpInstall {
    /// The session whose turn the call belongs to.
    pub session_id: String,
    /// The session the card shows on and is answered from: the chat of an
    /// orchestrated child, else `session_id`.
    pub card_session_id: String,
    sender: mpsc::UnboundedSender<McpInstallDecision>,
    /// A decline or an approve was accepted. A later answer is rejected
    /// until the loop reopens the card after a refused commit.
    answered: bool,
    /// When the card was shown. An answer before the host-ticket floor is
    /// refused and the card stays open.
    shown_at: Instant,
}
const CANCELLED_MESSAGE: &str = "The install was cancelled. Nothing was saved.";
const STALE_REVIEW: &str = "This review is out of date. Read it, then choose Install.";
const EXPIRED_REVIEW: &str = "The review expired. Read it again, then choose Install.";

struct Planned {
    plan_id: String,
    digest: String,
    inputs: BTreeMap<String, String>,
    name: String,
    consent: ConsentView,
    config: ResolvedConfig,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Card<'a> {
    agent_id: &'a str,
    session_id: &'a str,
    request_id: &'a str,
    name: &'a str,
    title: &'a str,
    transport: Option<String>,
    form: &'a InstallForm,
    consent: Option<&'a ConsentView>,
    plan_id: Option<&'a str>,
    launch_digest: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'a str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Resolved<'a> {
    agent_id: &'a str,
    session_id: &'a str,
    request_id: &'a str,
    outcome: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    server_id: Option<&'a str>,
    next_steps: &'a [Value],
    oauth: bool,
}

impl HostPlanServer {
    pub(super) fn installer(&self) -> Option<Arc<HostMcpInstall>> {
        self.mcp_installer.lock().clone().or_else(live)
    }

    pub(super) async fn mcp_install(
        &self,
        agent_id: &str,
        session_id: &str,
        card_session_id: &str,
        request: FormRequest,
        hung_up: impl Future<Output = ()>,
    ) -> FrameReply {
        let Some(installer) = self.installer() else {
            log::warn!("[host-mcp] mcp_install refused: installer is not configured");
            return FrameReply::ok_with(error_result("MCP_INSTALL_UNAVAILABLE"));
        };
        let described = match installer.describe(&request).await {
            Ok(reply) => reply,
            Err(error) => return FrameReply::ok_with(catalog_error(&error)),
        };
        let form = match described {
            FormReply::Unsupported { reason } => {
                return FrameReply::ok_with(unsupported_result(&reason));
            }
            FormReply::Form { form } => form,
        };
        if let Some(existing) = name_duplicate(&installer, &request, &form) {
            return FrameReply::ok_with(already_result(&existing));
        }

        let request_id = format!("mcp-{}", Uuid::new_v4());
        let caller = PlanCaller::Client(format!("host-mcp-{request_id}"));
        let (inputs, missing) = default_inputs(&form.fields);
        let mut planned = if missing {
            None
        } else {
            match self
                .plan_for(&installer, &request, &caller, inputs, None)
                .await
            {
                PlanFor::Ready(planned) => Some(planned),
                PlanFor::Reply(reply) => return reply,
                PlanFor::Stay(None) => None,
                PlanFor::Stay(Some(_)) => None,
            }
        };

        let (tx, mut rx) = mpsc::unbounded_channel();
        self.pending_installs.lock().insert(
            request_id.clone(),
            OpenMcpInstall {
                session_id: session_id.to_string(),
                card_session_id: card_session_id.to_string(),
                sender: tx,
                answered: false,
                shown_at: Instant::now(),
            },
        );
        self.emit_card(
            agent_id,
            card_session_id,
            &request_id,
            &form,
            planned.as_ref(),
            None,
        );
        log::info!(
            "[host-mcp] mcp_install waiting session={} fields={}",
            crate::logging::redact_session_id(session_id),
            form.fields.len()
        );

        let idle_signal = self.idle_signals.lock().get(agent_id).cloned();
        let heartbeat = self
            .ask_heartbeat_override
            .lock()
            .unwrap_or_else(|| ask_idle_heartbeat(crate::acp::manager::turn_idle_timeout()));
        if let Some(signal) = &idle_signal {
            signal(session_id);
        }
        tokio::pin!(hung_up);
        let reply = loop {
            tokio::select! {
                decision = rx.recv() => {
                    let Some(decision) = decision else {
                        self.drop_plan(&installer, &caller, planned.as_ref()).await;
                        break self.finish_terminal(
                            agent_id,
                            card_session_id,
                            &request_id,
                            "cancelled",
                            CANCELLED_MESSAGE,
                        );
                    };
                    match decision {
                        McpInstallDecision::Decline => {
                            self.drop_plan(&installer, &caller, planned.as_ref()).await;
                            break self.finish_terminal(agent_id, card_session_id, &request_id, "declined", declined_message());
                        }
                        McpInstallDecision::Cancelled => {
                            self.drop_plan(&installer, &caller, planned.as_ref()).await;
                            log::info!(
                                "[host-mcp] mcp_install cancelled session={}",
                                crate::logging::redact_session_id(session_id)
                            );
                            break self.finish_terminal(
                                agent_id,
                                card_session_id,
                                &request_id,
                                "cancelled",
                                CANCELLED_MESSAGE,
                            );
                        }
                        McpInstallDecision::Preview { inputs } => {
                            match self.plan_for(&installer, &request, &caller, inputs, planned.as_ref()).await {
                                PlanFor::Ready(next) => {
                                    planned = Some(next);
                                    self.emit_card(agent_id, card_session_id, &request_id, &form, planned.as_ref(), None);
                                }
                                PlanFor::Reply(reply) => break self.reply_and_close(agent_id, card_session_id, &request_id, reply),
                                PlanFor::Stay(_) => {
                                    planned = None;
                                    self.emit_card(agent_id, card_session_id, &request_id, &form, None, Some(FIELD_ERROR));
                                }
                            }
                        }
                        McpInstallDecision::Approve { inputs, secret_values, plan_id, launch_digest } => {
                            let same = planned.as_ref().is_some_and(|plan| plan.inputs == inputs);
                            if !same {
                                match self.plan_for(&installer, &request, &caller, inputs, planned.as_ref()).await {
                                    PlanFor::Ready(next) => {
                                        planned = Some(next);
                                        self.emit_card(agent_id, card_session_id, &request_id, &form, planned.as_ref(), Some(REVIEW_AGAIN));
                                    }
                                    PlanFor::Reply(reply) => break self.reply_and_close(agent_id, card_session_id, &request_id, reply),
                                    PlanFor::Stay(_) => {
                                        planned = None;
                                        self.emit_card(agent_id, card_session_id, &request_id, &form, None, Some(FIELD_ERROR));
                                    }
                                }
                                self.reopen_install_answer(&request_id);
                                continue;
                            }
                            let matches = planned.as_ref().is_some_and(|plan| {
                                plan.plan_id == plan_id && plan.digest == launch_digest
                            });
                            if !matches {
                                self.emit_card(agent_id, card_session_id, &request_id, &form, planned.as_ref(), Some(STALE_REVIEW));
                                self.reopen_install_answer(&request_id);
                                continue;
                            }
                            let Some(plan) = planned.as_ref() else {
                                self.reopen_install_answer(&request_id);
                                continue;
                            };
                            match installer.commit(&CommitRequest {
                                plan_id: plan.plan_id.clone(),
                                launch_digest: plan.digest.clone(),
                                secret_values,
                            }, &caller).await {
                                Ok(committed) => {
                                    break self.finish_installed(&installer, agent_id, card_session_id, &request_id, committed).await;
                                }
                                Err(error) if error.code == "VALIDATION_ERROR" => {
                                    self.emit_card(agent_id, card_session_id, &request_id, &form, planned.as_ref(), Some(FIELD_ERROR));
                                    self.reopen_install_answer(&request_id);
                                }
                                Err(error) if error.code == "MCP_PLAN_EXPIRED" || error.code == "MCP_PLAN_NOT_FOUND" => {
                                    match self.plan_for(&installer, &request, &caller, inputs, planned.as_ref()).await {
                                        PlanFor::Ready(next) => {
                                            planned = Some(next);
                                            self.emit_card(agent_id, card_session_id, &request_id, &form, planned.as_ref(), Some(EXPIRED_REVIEW));
                                        }
                                        PlanFor::Reply(reply) => break self.reply_and_close(agent_id, card_session_id, &request_id, reply),
                                        PlanFor::Stay(_) => {
                                            planned = None;
                                            self.emit_card(agent_id, card_session_id, &request_id, &form, None, Some(FIELD_ERROR));
                                        }
                                    }
                                    self.reopen_install_answer(&request_id);
                                }
                                Err(error) => {
                                    if let Some(plan) = planned.as_ref() {
                                        installer.cancel(&plan.plan_id, &caller).await;
                                    }
                                    self.emit_resolved(&Resolved {
                                        agent_id,
                                        session_id: card_session_id,
                                        request_id: &request_id,
                                        outcome: "error",
                                        name: None,
                                        server_id: None,
                                        next_steps: &[],
                                        oauth: false,
                                    });
                                    break FrameReply::ok_with(catalog_error(&error));
                                }
                            }
                        }
                    }
                }
                () = &mut hung_up => {
                    self.drop_plan(&installer, &caller, planned.as_ref()).await;
                    log::info!(
                        "[host-mcp] mcp_install cancelled session={}",
                        crate::logging::redact_session_id(session_id)
                    );
                    break self.finish_terminal(
                        agent_id,
                        card_session_id,
                        &request_id,
                        "cancelled",
                        CANCELLED_MESSAGE,
                    );
                }
                () = tokio::time::sleep(heartbeat) => {
                    if let Some(signal) = &idle_signal {
                        signal(session_id);
                    }
                }
            }
        };
        self.close_install(&request_id);
        reply
    }

    async fn plan_for(
        &self,
        installer: &HostMcpInstall,
        request: &FormRequest,
        caller: &PlanCaller,
        inputs: BTreeMap<String, String>,
        previous: Option<&Planned>,
    ) -> PlanFor {
        if let Some(previous) = previous {
            installer.cancel(&previous.plan_id, caller).await;
        }
        let planned = match installer
            .plan(
                &PlanRequest {
                    source: request.source.clone(),
                    choice: request.choice,
                    inputs: inputs.clone(),
                },
                caller.clone(),
            )
            .await
        {
            Ok(PlanReply::Plan { plan }) => plan,
            Ok(PlanReply::Unsupported { reason }) => {
                return PlanFor::Reply(FrameReply::ok_with(unsupported_result(&reason)));
            }
            Err(error) if error.code == "VALIDATION_ERROR" => {
                return PlanFor::Stay(None);
            }
            Err(error) => return PlanFor::Reply(FrameReply::ok_with(catalog_error(&error))),
        };
        let launch = LaunchKey::from_config(&planned.config);
        match installer.list() {
            Ok(listed) => {
                if let Some(existing) = find_duplicate(
                    &listed,
                    Some(planned.name.as_str()),
                    catalog_source_name(&request.source),
                    Some(&launch),
                ) {
                    installer.cancel(&planned.plan_id, caller).await;
                    return PlanFor::Reply(FrameReply::ok_with(already_result(existing)));
                }
            }
            Err(_) => {
                log::warn!("[host-mcp] mcp_install could not read the server list");
                installer.cancel(&planned.plan_id, caller).await;
                return PlanFor::Reply(FrameReply::ok_with(error_result("MCP_INSTALL_LIST")));
            }
        }
        PlanFor::Ready(Planned {
            plan_id: planned.plan_id,
            digest: planned.launch_digest,
            inputs,
            name: planned.name,
            consent: planned.consent_view,
            config: planned.config,
        })
    }

    fn emit_card(
        &self,
        agent_id: &str,
        session_id: &str,
        request_id: &str,
        form: &InstallForm,
        planned: Option<&Planned>,
        error: Option<&str>,
    ) {
        let name = planned
            .map(|plan| plan.name.as_str())
            .unwrap_or(form.title.as_str());
        let transport = planned
            .map(|plan| consent_transport(&plan.consent))
            .or_else(|| planned.map(|plan| transport_label(&plan.config).to_string()));
        events::fan_out(
            &self.sinks,
            Some(session_id),
            events::EVENT_MCP_INSTALL_REQUEST,
            &Card {
                agent_id,
                session_id,
                request_id,
                name,
                title: &form.title,
                transport,
                form,
                consent: planned.map(|plan| &plan.consent),
                plan_id: planned.map(|plan| plan.plan_id.as_str()),
                launch_digest: planned.map(|plan| plan.digest.as_str()),
                error,
            },
        );
    }

    async fn drop_plan(
        &self,
        installer: &HostMcpInstall,
        caller: &PlanCaller,
        planned: Option<&Planned>,
    ) {
        if let Some(plan) = planned {
            installer.cancel(&plan.plan_id, caller).await;
        }
    }

    fn reply_and_close(
        &self,
        agent_id: &str,
        session_id: &str,
        request_id: &str,
        reply: FrameReply,
    ) -> FrameReply {
        let outcome = reply
            .result
            .as_ref()
            .and_then(|value| value.get("outcome"))
            .and_then(Value::as_str)
            .unwrap_or("error");
        let steps = reply
            .result
            .as_ref()
            .and_then(|value| value.get("nextSteps"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let name = reply
            .result
            .as_ref()
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str)
            .map(str::to_string);
        let server_id = reply
            .result
            .as_ref()
            .and_then(|value| value.get("serverId"))
            .and_then(Value::as_str)
            .map(str::to_string);
        self.emit_resolved(&Resolved {
            agent_id,
            session_id,
            request_id,
            outcome,
            name: name.as_deref(),
            server_id: server_id.as_deref(),
            next_steps: &steps,
            oauth: false,
        });
        reply
    }

    fn finish_terminal(
        &self,
        agent_id: &str,
        session_id: &str,
        request_id: &str,
        outcome: &str,
        message: &str,
    ) -> FrameReply {
        let steps = vec![step(outcome, None, message)];
        self.emit_resolved(&Resolved {
            agent_id,
            session_id,
            request_id,
            outcome,
            name: None,
            server_id: None,
            next_steps: &steps,
            oauth: false,
        });
        FrameReply::ok_with(tool_result(ToolOutcome {
            outcome,
            name: None,
            server_id: None,
            config: None,
            reason: None,
            attached: false,
            new_session_needed: false,
            next_steps: steps,
        }))
    }

    async fn finish_installed(
        &self,
        installer: &HostMcpInstall,
        agent_id: &str,
        session_id: &str,
        request_id: &str,
        committed: crate::mcp_catalog::CommitResult,
    ) -> FrameReply {
        let listed = match installer.list() {
            Ok(listed) => listed,
            Err(_) => {
                log::warn!("[host-mcp] mcp_install could not read the server list");
                self.emit_resolved(&Resolved {
                    agent_id,
                    session_id,
                    request_id,
                    outcome: "error",
                    name: None,
                    server_id: None,
                    next_steps: &[],
                    oauth: false,
                });
                return FrameReply::ok_with(error_result("MCP_INSTALL_LIST"));
            }
        };
        let launch = LaunchKey::from_config(&committed.config);
        if let Some(existing) = find_duplicate(
            &listed,
            Some(committed.name.as_str()),
            committed.provenance.as_ref().map(|item| item.name.as_str()),
            Some(&launch),
        ) {
            let result = already_result(existing);
            let steps = result
                .get("nextSteps")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            self.emit_resolved(&Resolved {
                agent_id,
                session_id,
                request_id,
                outcome: "already_exists",
                name: Some(&existing.name),
                server_id: Some(&existing.id),
                next_steps: &steps,
                oauth: false,
            });
            return FrameReply::ok_with(result);
        }
        let server_id = Uuid::new_v4().to_string();
        let entry = match stored_entry(&server_id, &committed) {
            Ok(entry) => entry,
            Err(()) => {
                log::warn!("[host-mcp] mcp_install commit was missing a stored value");
                self.emit_resolved(&Resolved {
                    agent_id,
                    session_id,
                    request_id,
                    outcome: "error",
                    name: None,
                    server_id: None,
                    next_steps: &[],
                    oauth: false,
                });
                return FrameReply::ok_with(error_result("MCP_INSTALL_SAVE"));
            }
        };
        if installer.save(&entry).is_err() {
            log::warn!("[host-mcp] mcp_install could not save the server list");
            self.emit_resolved(&Resolved {
                agent_id,
                session_id,
                request_id,
                outcome: "error",
                name: None,
                server_id: None,
                next_steps: &[],
                oauth: false,
            });
            return FrameReply::ok_with(error_result("MCP_INSTALL_SAVE"));
        }
        events::fan_out(
            &self.sinks,
            Some(session_id),
            events::EVENT_MCP_REGISTRY_CHANGED,
            &json!({
                "agentId": agent_id,
                "sessionId": session_id,
                "serverId": server_id,
                "name": committed.name,
            }),
        );
        let runners = installer.runners().await;
        let oauth = self.oauth_needed(installer, &committed).await;
        let mut steps = Vec::new();
        if let Some(runtime) = missing_runtime(&committed.config, runners) {
            let command = runtime.command();
            steps.push(step(
                "runtime",
                Some(command),
                &runtime_message(command, command),
            ));
        }
        if oauth {
            steps.push(step("oauth", None, oauth_message()));
        }
        steps.push(step("new_session", None, new_session_message()));
        log::info!(
            "[host-mcp] mcp_install installed session={} transport={} oauth={}",
            crate::logging::redact_session_id(session_id),
            transport_label(&committed.config),
            oauth
        );
        self.emit_resolved(&Resolved {
            agent_id,
            session_id,
            request_id,
            outcome: "installed",
            name: Some(&committed.name),
            server_id: Some(&server_id),
            next_steps: &steps,
            oauth,
        });
        FrameReply::ok_with(tool_result(ToolOutcome {
            outcome: "installed",
            name: Some(&committed.name),
            server_id: Some(&server_id),
            config: Some(&committed.config),
            reason: None,
            attached: false,
            new_session_needed: true,
            next_steps: steps,
        }))
    }

    async fn oauth_needed(
        &self,
        installer: &HostMcpInstall,
        committed: &crate::mcp_catalog::CommitResult,
    ) -> bool {
        if matches!(committed.config, ResolvedConfig::Stdio { .. }) {
            return false;
        }
        let Some(config) = probe_config(&committed.name, committed) else {
            return false;
        };
        tokio::time::timeout(
            installer.probe_timeout(),
            crate::acp::mcp_probe::probe(config),
        )
        .await
        .is_ok_and(|result| result.status == crate::acp::mcp_probe::ProbeStatus::AuthRequired)
    }

    fn emit_resolved(&self, body: &Resolved<'_>) {
        events::fan_out(
            &self.sinks,
            Some(body.session_id),
            events::EVENT_MCP_INSTALL_RESOLVED,
            body,
        );
    }
}

enum PlanFor {
    Ready(Planned),
    Reply(FrameReply),
    Stay(Option<Planned>),
}

fn name_duplicate(
    installer: &HostMcpInstall,
    request: &FormRequest,
    form: &InstallForm,
) -> Option<crate::acp::host_mcp::mcp_install::ListedServer> {
    let listed = installer.list().ok()?;
    let wire_name = match &request.source {
        crate::mcp_catalog::PlanSource::Import { .. } => Some(form.title.as_str()),
        _ => None,
    };
    find_duplicate(
        &listed,
        wire_name,
        catalog_source_name(&request.source),
        None,
    )
    .cloned()
}

fn already_result(existing: &crate::acp::host_mcp::mcp_install::ListedServer) -> Value {
    let message = already_message(&existing.name);
    tool_result(ToolOutcome {
        outcome: "already_exists",
        name: Some(&existing.name),
        server_id: Some(&existing.id),
        config: None,
        reason: None,
        attached: false,
        new_session_needed: false,
        next_steps: vec![step("already_installed", None, &message)],
    })
}

fn unsupported_result(reason: &McpCatalogReason) -> Value {
    log::info!(
        "[host-mcp] mcp_install unsupported code={}",
        reason_code(reason)
    );
    let mut steps = Vec::new();
    if let McpCatalogReason::NeedsRuntime { runtime } = reason {
        let command = runtime.command();
        steps.push(step(
            "runtime",
            Some(command),
            &runtime_message(command, command),
        ));
    } else {
        steps.push(step(
            "unsupported",
            None,
            "Troupe cannot install this server. The reason explains why. Nothing was saved.",
        ));
    }
    tool_result(ToolOutcome {
        outcome: "unsupported",
        name: None,
        server_id: None,
        config: None,
        reason: Some(reason),
        attached: false,
        new_session_needed: false,
        next_steps: steps,
    })
}

fn catalog_error(error: &McpCatalogError) -> Value {
    log::warn!("[host-mcp] mcp_install refused code={}", error.code);
    error_result(error.code)
}

fn error_result(code: &str) -> Value {
    json!({
        "outcome": "error",
        "code": code,
        "attached": false,
        "newSessionNeeded": false,
        "nextSteps": [{
            "kind": "error",
            "message": "The install could not be prepared. Nothing was saved."
        }]
    })
}

fn missing_runtime(
    config: &ResolvedConfig,
    runners: RunnerAvailability,
) -> Option<crate::mcp_catalog::Runner> {
    let ResolvedConfig::Stdio { command, .. } = config else {
        return None;
    };
    let runner = runner_of_command(command)?;
    (!runners.has(runner)).then_some(runner)
}

const FIELD_ERROR: &str = "Check the fields and try again. Secret values stay on this card.";
const REVIEW_AGAIN: &str = "The command changed. Read it, then choose Install.";
