//! Native subagent sessions (Claude Agent ACP `subagents` capability).
//!
//! The adapter runs each subagent in its own ACP session and sends that
//! session's traffic (updates, permission requests, questions) under the
//! child session id. Troupe shows a subagent inside its parent chat, so the
//! driver maps every child session to its root chat session and to the
//! dispatch card that the host synthesizes for it.

use std::collections::HashMap;

/// Children kept per connection. A long chat can spawn many subagents; past
/// this bound the oldest ended routes go first.
const MAX_CHILD_ROUTES: usize = 1024;

/// Where one child session's traffic goes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ChildRoute {
    /// The chat session the user sees (never itself a child session).
    pub root_session_id: String,
    /// The session that spawned the child: the chat or another child.
    pub parent_session_id: String,
    /// The synthesized dispatch tool call that represents the child.
    pub dispatch_id: String,
    /// The dispatch of the child that spawned this one (nested subagents).
    pub parent_dispatch_id: Option<String>,
    /// The child reported an end state.
    pub ended: bool,
}

#[derive(Default)]
pub(super) struct SubagentRoutes {
    children: HashMap<String, ChildRoute>,
    /// Registration order, for eviction.
    order: Vec<String>,
}

/// The dispatch tool call id for a child session.
pub(crate) fn dispatch_id_for(child_session_id: &str) -> String {
    format!("termul-subagent:{child_session_id}")
}

impl SubagentRoutes {
    pub(super) fn route(&self, session_id: &str) -> Option<&ChildRoute> {
        self.children.get(session_id)
    }

    /// Insert the route of an orchestrated child session, built entirely
    /// from `origin` (the engine supplies every id; no parent walk, unlike
    /// [`Self::register`]). A repeated seed for the same child is a no-op
    /// that returns the existing route.
    pub(super) fn seed(
        &mut self,
        origin: &crate::acp::manager::ChildOrigin,
        child: &str,
    ) -> ChildRoute {
        if let Some(existing) = self.children.get(child) {
            return existing.clone();
        }
        let route = ChildRoute {
            root_session_id: origin.root_session_id.clone(),
            parent_session_id: origin.parent_session_id.clone(),
            dispatch_id: origin.dispatch_id.clone(),
            parent_dispatch_id: origin.parent_dispatch_id.clone(),
            ended: false,
        };
        self.evict_if_full();
        self.children.insert(child.to_string(), route.clone());
        self.order.push(child.to_string());
        route
    }

    /// The chat session for `session_id`: its root when it is a child,
    /// otherwise itself.
    pub(super) fn root_of<'a>(&'a self, session_id: &'a str) -> &'a str {
        self.children
            .get(session_id)
            .map_or(session_id, |route| route.root_session_id.as_str())
    }

    /// Record `child` as spawned from `parent` (a chat session or another
    /// child). Returns the new route, or the existing one when the child is
    /// already known. A child that names itself as parent is rejected.
    pub(super) fn register(&mut self, parent: &str, child: &str) -> Option<ChildRoute> {
        if parent == child || child.is_empty() {
            return None;
        }
        if let Some(existing) = self.children.get(child) {
            return Some(existing.clone());
        }
        let (root_session_id, parent_dispatch_id) = match self.children.get(parent) {
            Some(parent_route) => (
                parent_route.root_session_id.clone(),
                Some(parent_route.dispatch_id.clone()),
            ),
            None => (parent.to_string(), None),
        };
        let route = ChildRoute {
            root_session_id,
            parent_session_id: parent.to_string(),
            dispatch_id: dispatch_id_for(child),
            parent_dispatch_id,
            ended: false,
        };
        self.evict_if_full();
        self.children.insert(child.to_string(), route.clone());
        self.order.push(child.to_string());
        Some(route)
    }

    /// Mark a running `child` ended. Its route stays so a late request still
    /// reaches the right chat. Returns the route when the child was known and
    /// running; a repeated end report changes nothing.
    pub(super) fn mark_ended(&mut self, child: &str) -> Option<ChildRoute> {
        let route = self.children.get_mut(child).filter(|route| !route.ended)?;
        route.ended = true;
        Some(route.clone())
    }

    /// Mark an ended `child` running again (the RFD form reuses an idle
    /// child). Returns the route when the child was known and had ended.
    pub(super) fn mark_running(&mut self, child: &str) -> Option<ChildRoute> {
        let route = self.children.get_mut(child).filter(|route| route.ended)?;
        route.ended = false;
        Some(route.clone())
    }

    /// Children that have not reported an end.
    pub(super) fn running_count(&self) -> usize {
        self.children.values().filter(|route| !route.ended).count()
    }

    /// Drop every child of `root` (the chat session closed or reloaded).
    pub(super) fn forget_root(&mut self, root: &str) {
        self.children
            .retain(|_, route| route.root_session_id != root);
        let children = &self.children;
        self.order.retain(|id| children.contains_key(id));
    }

    fn evict_if_full(&mut self) {
        if self.children.len() < MAX_CHILD_ROUTES {
            return;
        }
        let victim = self
            .order
            .iter()
            .position(|id| self.children.get(id).is_some_and(|route| route.ended))
            .unwrap_or(0);
        let id = self.order.remove(victim);
        self.children.remove(&id);
        log::warn!(
            "[acp] native subagent routes full ({MAX_CHILD_ROUTES}); dropped the oldest route"
        );
    }

    #[cfg(test)]
    pub(super) fn len(&self) -> usize {
        self.children.len()
    }
}

impl super::DriverState {
    /// Record a native subagent session spawned from `parent`.
    pub(crate) fn register_subagent(&mut self, parent: &str, child: &str) -> Option<ChildRoute> {
        self.subagents.register(parent, child)
    }

    /// Seed the route of an orchestrated child session from the origin the
    /// engine supplied at `session/new` time.
    pub(crate) fn seed_child_route(
        &mut self,
        origin: &crate::acp::manager::ChildOrigin,
        session_id: &str,
    ) -> ChildRoute {
        self.subagents.seed(origin, session_id)
    }

    /// Mark a running native subagent session ended.
    pub(crate) fn end_subagent(&mut self, child: &str) -> Option<ChildRoute> {
        self.subagents.mark_ended(child)
    }

    /// Mark an ended native subagent session running again.
    pub(crate) fn resume_subagent(&mut self, child: &str) -> Option<ChildRoute> {
        self.subagents.mark_running(child)
    }

    /// The subagent records of every chat on this connection.
    pub(crate) fn subagent_records(&mut self) -> &mut crate::acp::subagents::SubagentRecords {
        &mut self.subagent_records
    }

    /// The route of a native subagent session, `None` for a chat session.
    pub(crate) fn subagent_route(&self, session_id: &str) -> Option<ChildRoute> {
        self.subagents.route(session_id).cloned()
    }

    /// The chat session that owns `session_id`: the root of a native
    /// subagent session, otherwise `session_id` itself. Permission requests,
    /// questions, and elicitations from a subagent use this so the prompt
    /// appears in the chat the user sees.
    pub(crate) fn chat_session_for(&self, session_id: &str) -> String {
        self.subagents.root_of(session_id).to_string()
    }

    /// Whether a prompt parked under `parked` belongs to `session_id`. An
    /// orchestrated child's prompts are parked under its chat, which lives
    /// on another connection; on its own private connection that chat key
    /// names this child alone, so draining the child drains them too.
    pub(crate) fn parked_for(&self, session_id: &str, parked: &str) -> bool {
        if parked == session_id {
            return true;
        }
        let root = self.subagents.root_of(session_id);
        root != session_id && parked == root && !self.session_roots.contains_key(root)
    }

    /// Whether `session_id` runs headless, locked out of the client's file
    /// and terminal methods: its chat (itself, or the chat an orchestrated
    /// child is routed under) is ephemeral. An orchestrated child is
    /// ephemeral itself but works for a chat, like the chat's own agent.
    pub(crate) fn is_headless(&self, session_id: &str) -> bool {
        self.is_ephemeral(&self.chat_session_for(session_id))
    }
}
