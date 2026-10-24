# Metric definitions

Every number in Optic is computed with plain SQL over the `sessions`, `events` and `clicks` tables
([`src/lib/query`](../src/lib/query)). This page says exactly what each one means.

## Visitors and sessions

| Metric | Definition |
| --- | --- |
| **Visitor** | A distinct `visitor_id`. Cookieless sites: a hash of a salt that rotates daily, the site, the IP address and the user agent, so the same person counts once per day. Persistent sites: a hash of a random first-party id. Identified users (`optic("identify")`): a hash of your user id, across devices. |
| **Session** | Activity from one visitor with no gap longer than **30 minutes**. A new campaign (a pageview carrying a different `utm_campaign`) also starts a new session, as in GA4. |
| **New visitor** | A visitor whose session is their first ever on the site. |
| **Pageviews** | Count of `pageview` events, including single-page-app route changes. |
| **Views per session** | Pageviews ÷ sessions. |

## Engagement

| Metric | Definition |
| --- | --- |
| **Engaged session** | GA4's definition: lasted at least 10 s of visible time, **or** viewed 2+ pages, **or** completed a goal. |
| **Bounce rate** | 1 − engaged sessions ÷ sessions. A visitor who reads one article for two minutes is *not* a bounce. |
| **Session duration** | Last activity − first activity in the session. |
| **Engaged time on page** | Average visible time sent by `page_leave`; time in background tabs is excluded. |
| **Scroll depth** | Deepest point reached, as a percentage of the page height. |
| **Exit rate** | Sessions that ended on the page ÷ pageviews of the page. |

## Acquisition

Channels follow GA4's default channel grouping, in this order:

1. `utm_medium` decides when present: `cpc`/`ppc`/`paid` → Paid Search (Paid Social if the source is a social
   network), `paid_social` → Paid Social, `social` → Organic Social, `email`/`newsletter` → Email,
   `display`/`banner`/`cpm` → Display, `affiliate` → Affiliates, `organic` → Organic Search, `referral` → Referral.
2. Otherwise the referrer's domain: search engines → Organic Search, social networks (including `t.co`) → Organic
   Social, webmail → Email, your own domain → Direct, anything else → Referral.
3. No referrer and no UTM → Direct.

`gclid` implies `google / cpc`; `fbclid` implies `facebook / social`.

## Conversions

| Metric | Definition |
| --- | --- |
| **Goal completion** | An event with the goal's name, or a pageview matching the goal's path (`*` wildcards allowed). Goals are evaluated when data arrives, so they count from the moment they are created. |
| **Conversion rate** | Sessions with at least one goal completion ÷ sessions. |
| **Revenue** | Sum of `revenue` on events. |
| **Average order value** | Purchase revenue ÷ number of `purchase` events. |
| **Cart abandonment** | 1 − sessions with both `add_to_cart` and `purchase` ÷ sessions with `add_to_cart`. |
| **Checkout abandonment** | 1 − sessions with `purchase` ÷ sessions with `begin_checkout`. |

## Funnels

A **closed funnel**: a session enters at step 1, and reaches step *k* only if the step happens **after** step *k−1*
in the same session. Each step's time is the first matching event after the previous step, so repeats do not
inflate counts. "Average time from previous" is the mean gap between those first matches.

## Paths

Built with SQL window functions (`LAG` and `LEAD` over each session's pageviews, ordered by time). "Then went to"
shows the next two pages after the selected page, with `(exit)` when the session ended there.

## Retention

Visitors are grouped by the Monday-starting week of their **first ever** session. Week *n* retention is the share of
the cohort with at least one session in the *n*-th week after that. The average curve weights each cohort by its
size. Retention needs persistent identity: with cookieless identity the id changes every day.

## Insights

**Anomalies.** For each day, the expected value is the median of the same weekday over the previous four weeks, so a
quiet Sunday is not flagged. The spread is the median absolute deviation (MAD) of recent residuals. A day is flagged
when its robust z-score, residual ÷ (1.4826 × MAD), is at least 3.5. Flagged days are left out of the baseline so one
outage does not hide the next. At least 14 days of history are required.

**Forecast.** Additive Holt-Winters with level, trend and a 7-day season, fitted to the last 12 weeks. The smoothing
constants (α, β, γ) are chosen by a grid search that minimises one-step-ahead squared error. The shaded band is an 80%
interval from the in-sample residual standard deviation, widening with the horizon.

**What changed.** For each dimension, the change in the metric between the selected and previous periods, split by
value and sorted by absolute contribution.

**Rage clicks** are 3+ clicks within 800 ms and 30 px. **Dead clicks** are clicks on non-interactive elements where
the DOM and URL did not change within 600 ms.

**Core Web Vitals** are the 75th percentile of real-user measurements, rated with Google's thresholds:

| Metric | Good | Poor |
| --- | --- | --- |
| LCP | ≤ 2.5 s | > 4 s |
| INP | ≤ 200 ms | > 500 ms |
| CLS | ≤ 0.1 | > 0.25 |
| FCP | ≤ 1.8 s | > 3 s |
| TTFB | ≤ 0.8 s | > 1.8 s |
