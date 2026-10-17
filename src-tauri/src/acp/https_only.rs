/// GitHub releases and CDNs redirect to other https hosts, so https hops are
/// followed. Deferring to `Policy::default()` keeps reqwest's 10-hop cap,
/// which a bare `attempt.follow()` would drop.
pub(crate) fn redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        let scheme = attempt.url().scheme().to_string();
        if scheme == "https" {
            reqwest::redirect::Policy::default().redirect(attempt)
        } else {
            attempt.error(format!("non-https redirect target (scheme {scheme:?})"))
        }
    })
}
